import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { resolveInsuranceDiagnosisCodes } from "@/lib/insuranceDiagnosisCodes";
import {
  buildInvoiceRequest,
  mapLawType as mapSumexLaw,
  mapTiersMode as mapSumexTiers,
  mapSex as mapSumexSex,
  RoleType,
  PlaceType,
  RequestType,
  RequestSubtype,
  DiagnosisType,
  EsrType,
  YesNo,
  type SumexInvoiceInput,
  type InvoiceServiceInput as SumexServiceInput,
  type InvoiceDiagnosis as SumexDiagnosis,
} from "@/lib/sumexInvoice";
import { loadTardocCatalog } from "@/lib/tardocCatalog";
import {
  mapLineItemToSumexService,
  reconcileInvoiceLines,
  type SumexLineItemRow,
} from "@/lib/sumexLineMapper";

// No IBAN fallback — provider must have a valid QR-IBAN configured
const FALLBACK_QR_IBAN = null;

// MediData intermediate (clearing house) GLN — required in XML transport <via>
const MEDIDATA_INTERMEDIATE_GLN = "7601001304307";
const TG_NO_TRANSMISSION_GLN = "2000000000008";


/** Strip spaces from IBAN and check it looks like a valid Swiss IBAN (CH + 19 digits) */
function sanitizeIban(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const stripped = raw.replace(/\s+/g, "").toUpperCase();
  // Swiss IBAN: CH followed by exactly 19 alphanumeric chars
  if (/^CH[0-9A-Z]{19}$/.test(stripped)) return stripped;
  return null;
}

/**
 * POST /api/sumex/check-xml
 *
 * Generates XML via Sumex1 server and returns it for preview.
 * Does NOT create a submission record — purely for inspection.
 *
 * Accepts { invoiceId } — queries the `invoices` table.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const insurerWasProvided = Object.prototype.hasOwnProperty.call(body, "insurerGln");
    const {
      invoiceId,
      // Legacy compat: also accept consultationId as alias
      consultationId,
      patientId: bodyPatientId,
      billingType: bodyBillingType,
      insurerGln: bodyInsurerGln,
      insurerName: bodyInsurerName,
      insurerAddress: bodyInsurerAddress,
      skipValidation = false,
    } = body;

    const resolvedInvoiceId = invoiceId || consultationId;
    if (!resolvedInvoiceId) {
      return NextResponse.json(
        { error: "invoiceId is required" },
        { status: 400 },
      );
    }

    // ── Fetch clinic config (sender GLN) from medidata_config ──
    const { data: mdConfig } = await supabaseAdmin
      .from("medidata_config")
      .select("clinic_gln")
      .limit(1)
      .single();
    const senderGln = mdConfig?.clinic_gln || "";

    console.log(`[CheckXML] Starting XML check for invoiceId=${resolvedInvoiceId}, senderGln=${senderGln}`);

    // ── Fetch invoice from `invoices` table ──
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", resolvedInvoiceId)
      .single();

    if (invoiceError || !invoice) {
      console.error(`[CheckXML] Invoice not found: ${invoiceError?.message}`);
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const patientId = bodyPatientId || invoice.patient_id;
    console.log(`[CheckXML] Invoice found: ${invoice.invoice_number}, patient=${patientId}, billing=${invoice.billing_type}, law=${invoice.health_insurance_law}`);

    // ── Fetch patient ──
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, dob, street_address, postal_code, town, country, gender, email, phone")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    // ── Fetch billing entity (provider) ──
    let billingEntity: Record<string, any> | null = null;
    if (invoice.provider_id) {
      const { data: provRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, phone, vatuid, qual_dignities, medical_section_code")
        .eq("id", invoice.provider_id)
        .single();
      if (provRow) billingEntity = provRow;
    }

    // ── Fetch staff/doctor provider if different ──
    let staffEntity: Record<string, any> | null = null;
    if (invoice.doctor_user_id && invoice.doctor_user_id !== invoice.provider_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, qual_dignities, medical_section_code")
        .eq("id", invoice.doctor_user_id)
        .single();
      if (staffRow) staffEntity = staffRow;
    }

    // ── Fetch insurer data ──
    let insurerGln = "";
    let insurerName = "";
    let receiverGln = "";
    let insurerStreet = "";
    let insurerZip = "";
    let insurerCity = "";
    const fetchInsurerRow = async (filter: { col: string; val: string }) => {
      const { data } = await supabaseAdmin
        .from("swiss_insurers")
        .select("name, gln, receiver_gln, address_street, address_postal_code, address_city")
        .eq(filter.col, filter.val)
        .limit(1)
        .maybeSingle();
      return data as Record<string, any> | null;
    };
    if (invoice.insurer_id) {
      const insurerRow = await fetchInsurerRow({ col: "id", val: invoice.insurer_id });
      if (insurerRow) {
        insurerGln = insurerRow.gln || "";
        insurerName = insurerRow.name || "";
        receiverGln = insurerRow.receiver_gln || insurerGln;
        insurerStreet = insurerRow.address_street || "";
        insurerZip = insurerRow.address_postal_code || "";
        insurerCity = insurerRow.address_city || "";
      }
    }
    if (!insurerGln && invoice.insurance_gln) {
      const insurerRow = await fetchInsurerRow({ col: "gln", val: invoice.insurance_gln });
      if (insurerRow) {
        insurerGln = insurerRow.gln || "";
        insurerName = insurerRow.name || "";
        receiverGln = insurerRow.receiver_gln || insurerGln;
        insurerStreet = insurerRow.address_street || "";
        insurerZip = insurerRow.address_postal_code || "";
        insurerCity = insurerRow.address_city || "";
      }
    }

    // If no insurer on invoice, try patient_insurances
    if (!insurerGln) {
      const { data: patIns } = await supabaseAdmin
        .from("patient_insurances")
        .select("insurer_id, gln, insurer_gln, provider_name, card_number, avs_number")
        .eq("patient_id", patientId)
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (patIns) {
        const patInsurerGln = (patIns as any).gln || (patIns as any).insurer_gln || "";
        let siRow = patInsurerGln ? await fetchInsurerRow({ col: "gln", val: patInsurerGln }) : null;
        if (!siRow && (patIns as any).insurer_id) siRow = await fetchInsurerRow({ col: "id", val: (patIns as any).insurer_id });
        if (siRow) {
          insurerGln = siRow.gln || "";
          insurerName = siRow.name || "";
          receiverGln = siRow.receiver_gln || insurerGln;
          insurerStreet = siRow.address_street || "";
          insurerZip = siRow.address_postal_code || "";
          insurerCity = siRow.address_city || "";
        } else if (patInsurerGln) {
          insurerGln = patInsurerGln;
          insurerName = (patIns as any).provider_name || "";
        }
      }
    }

    const billingType = bodyBillingType || invoice.billing_type || "TG";
    if (billingType === "TG" && insurerWasProvided) {
      insurerGln = typeof bodyInsurerGln === "string" ? bodyInsurerGln.trim() : "";
      insurerName = insurerGln && typeof bodyInsurerName === "string" ? bodyInsurerName : "";
      insurerStreet = insurerGln && typeof bodyInsurerAddress?.street === "string" ? bodyInsurerAddress.street : "";
      insurerZip = insurerGln && typeof bodyInsurerAddress?.zip === "string" ? bodyInsurerAddress.zip : "";
      insurerCity = insurerGln && typeof bodyInsurerAddress?.city === "string" ? bodyInsurerAddress.city : "";
      receiverGln = insurerGln;
    }

    // ── BILL-015: insurance invoices must be billed by the clinic mandant ──
    // (biller = TOA SA, GLN 7601002932929 / ZSR Z797322; doctor = provider).
    // Mirrors medidata/send-invoice — see comment there.
    let mandantEntity: Record<string, any> | null = null;
    if (billingType === "TP" && senderGln) {
      const { data: mandantRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, vatuid, salutation, title, qual_dignities, medical_section_code")
        .eq("gln", senderGln)
        .limit(1)
        .maybeSingle();
      if (mandantRow) {
        mandantEntity = mandantRow;
        if (!staffEntity && billingEntity?.gln && billingEntity.gln !== mandantRow.gln) {
          staffEntity = billingEntity;
        }
        console.log(`[CheckXML] BILL-015: billing as clinic mandant ${mandantRow.name} (${mandantRow.gln}/${mandantRow.zsr})`);
      }
    }
    const billerEntity = mandantEntity ?? billingEntity;

    // ── Resolve provider fields with fallbacks ──
    // GLN must be exactly 13 digits
    const pickValidGln = (...candidates: (string | null | undefined)[]) => {
      for (const c of candidates) if (c && /^\d{13}$/.test(c)) return c;
      return "7601003000115"; // fallback
    };
    const provGln = pickValidGln(billerEntity?.gln, invoice.provider_gln);
    const provZsr = billerEntity?.zsr || invoice.provider_zsr || "";
    const provName = billerEntity?.name || invoice.provider_name || "Maison Toa";
    const provStreet = billerEntity?.street
      ? `${billerEntity.street}${billerEntity.street_no ? " " + billerEntity.street_no : ""}`
      : "";
    const provZip = billerEntity?.zip_code || "";
    const provCity = billerEntity?.city || "";
    const provCanton = billerEntity?.canton || invoice.treatment_canton || "VD";

    // IBAN stays PER-DOCTOR (doctor-specific TOA SA accounts); mandant IBAN is
    // only a last-resort fallback.
    const provIban = sanitizeIban(billingEntity?.iban)
      || sanitizeIban(invoice.provider_iban)
      || sanitizeIban(mandantEntity?.iban)
      || FALLBACK_QR_IBAN;

    const treatmentDate = invoice.treatment_date?.split("T")[0]
      || invoice.invoice_date
      || new Date().toISOString().split("T")[0];

    // ── Fetch line items ──
    const { data: dbLineItems } = await supabaseAdmin
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", resolvedInvoiceId)
      .order("sort_order", { ascending: true });

    console.log(`[CheckXML] Line items: ${dbLineItems?.length || 0}`);

    // ── Map line items to Sumex service inputs ──
    // Shared mapping with send-invoice / generate-pdf (src/lib/sumexLineMapper.ts)
    // so the preview validates exactly what would be sent.
    const mapperCtx = {
      fallbackProviderGln: provGln,
      fallbackTreatmentDate: treatmentDate,
      skipValidation,
      tardocCatalog: await loadTardocCatalog(dbLineItems || []),
    };
    const sumexServices: SumexServiceInput[] = ((dbLineItems || []) as SumexLineItemRow[]).map(
      (item) => mapLineItemToSumexService(item, mapperCtx),
    );

    // Reconciliation check — surfaced in the preview response.
    const reconciliation = reconcileInvoiceLines(
      (dbLineItems || []) as SumexLineItemRow[],
      Number(invoice.total_amount) || 0,
      { tardocCatalog: mapperCtx.tardocCatalog },
    );
    if (!reconciliation.ok) {
      console.warn(`[CheckXML] ⚠ Reconciliation mismatch:`, JSON.stringify(reconciliation, null, 2));
    }

    if (sumexServices.length === 0) {
      return NextResponse.json(
        { error: "No line items found for this invoice" },
        { status: 400 },
      );
    }

    const diagCodes = resolveInsuranceDiagnosisCodes(invoice.diagnosis_codes);
    if (diagCodes.length === 0) {
      return NextResponse.json(
        { error: "Invoice requires at least one valid ICD-10 diagnosis code before insurance submission" },
        { status: 422 },
      );
    }
    const sumexDiagnoses: SumexDiagnosis[] = diagCodes.map((code) => ({
      type: DiagnosisType.ICD,
      code,
    }));

    // ── Build Sumex1 input ──
    const sumexInput: SumexInvoiceInput = {
      language: 2,
      roleType: RoleType.Physician,
      placeType: PlaceType.Practice,
      requestType: RequestType.Invoice,
      requestSubtype: RequestSubtype.Normal,
      tiersMode: mapSumexTiers(billingType),
      vatNumber: billerEntity?.vatuid || "",
      invoiceId: invoice.invoice_number || `INV-${resolvedInvoiceId.slice(0, 8)}`,
      invoiceDate: invoice.invoice_date || new Date().toISOString().split("T")[0],
      lawType: mapSumexLaw(invoice.health_insurance_law || "KVG"),
      insuredId: invoice.patient_card_number || invoice.patient_ssn || "",
      esrType: EsrType.QR,
      iban: provIban ?? "",
      paymentPeriod: 30,
      billerGln: provGln,
      billerZsr: provZsr || undefined,
      billerAddress: {
        companyName: provName,
        street: provStreet,
        zip: provZip,
        city: provCity,
        stateCode: provCanton,
      },
      providerGln: pickValidGln(staffEntity?.gln, invoice.doctor_gln, provGln),
      providerZsr: staffEntity?.zsr || invoice.doctor_zsr || provZsr || undefined,
      providerAddress: {
        familyName: staffEntity?.name || invoice.doctor_name || provName,
        givenName: "",
        salutation: staffEntity?.salutation || billingEntity?.salutation || "",
        title: staffEntity?.title || billingEntity?.title || "",
        street: staffEntity?.street ? `${staffEntity.street}${staffEntity.street_no ? " " + staffEntity.street_no : ""}` : provStreet,
        zip: staffEntity?.zip_code || provZip,
        city: staffEntity?.city || provCity,
        stateCode: staffEntity?.canton || provCanton,
      },
      insuranceGln: insurerGln || undefined,
      insuranceAddress: insurerGln ? {
        companyName: insurerName,
        street: insurerStreet,
        zip: insurerZip,
        city: insurerCity,
        stateCode: "",
      } : undefined,
      patientSex: mapSumexSex(patient.gender || "male"),
      patientBirthdate: patient.dob || "1990-01-01",
      patientSsn: invoice.patient_ssn || "",
      patientAddress: (() => {
        const c = patient.country?.trim() || "";
        const isCH = !c || /^(ch|switzerland|suisse|schweiz|svizzera)$/i.test(c);
        const CMAP: Record<string, string> = { france:"FR",frankreich:"FR",francia:"FR",germany:"DE",deutschland:"DE",allemagne:"DE",italia:"IT",italy:"IT",italien:"IT",italie:"IT",austria:"AT","österreich":"AT",autriche:"AT",liechtenstein:"LI",spain:"ES",espagne:"ES",portugal:"PT",belgium:"BE",belgique:"BE",netherlands:"NL","pays-bas":"NL","united kingdom":"GB",uk:"GB",luxembourg:"LU",luxemburg:"LU","united states":"US",usa:"US" };
        const cc = isCH ? "" : (c.length === 2 ? c.toUpperCase() : (CMAP[c.toLowerCase()] || ""));
        return {
          familyName: patient.last_name || "Patient",
          givenName: patient.first_name || "Unknown",
          street: patient.street_address || provStreet || "N/A",
          zip: patient.postal_code || provZip || "0000",
          city: patient.town || provCity || "N/A",
          stateCode: isCH ? provCanton : "",
          country: isCH ? undefined : (c || undefined),
          countryCode: cc || undefined,
          email: patient.email || "",
          phone: patient.phone || "",
        };
      })(),
      guarantorAddress: (() => {
        const c = patient.country?.trim() || "";
        const isCH = !c || /^(ch|switzerland|suisse|schweiz|svizzera)$/i.test(c);
        const CMAP: Record<string, string> = { france:"FR",frankreich:"FR",francia:"FR",germany:"DE",deutschland:"DE",allemagne:"DE",italia:"IT",italy:"IT",italien:"IT",italie:"IT",austria:"AT","österreich":"AT",autriche:"AT",liechtenstein:"LI",spain:"ES",espagne:"ES",portugal:"PT",belgium:"BE",belgique:"BE",netherlands:"NL","pays-bas":"NL","united kingdom":"GB",uk:"GB",luxembourg:"LU",luxemburg:"LU","united states":"US",usa:"US" };
        const cc = isCH ? "" : (c.length === 2 ? c.toUpperCase() : (CMAP[c.toLowerCase()] || ""));
        return {
          familyName: patient.last_name || "Patient",
          givenName: patient.first_name || "Unknown",
          street: patient.street_address || provStreet || "N/A",
          zip: patient.postal_code || provZip || "0000",
          city: patient.town || provCity || "N/A",
          stateCode: isCH ? provCanton : "",
          country: isCH ? undefined : (c || undefined),
          countryCode: cc || undefined,
          email: patient.email || "",
          phone: patient.phone || "",
        };
      })(),
      printCopyToGuarantor: mapSumexTiers(billingType) === 1 ? YesNo.Yes : undefined,
      treatmentCanton: invoice.treatment_canton || provCanton,
      treatmentDateBegin: treatmentDate,
      treatmentDateEnd: invoice.treatment_date_end?.split("T")[0] || treatmentDate,
      diagnoses: sumexDiagnoses,
      services: sumexServices,
      softwarePackage: "MaisonToa",
      softwareVersion: 100,
      softwareId: 0,
      transportFrom: senderGln || provGln,
      transportViaGln: MEDIDATA_INTERMEDIATE_GLN,
      transportTo: billingType === "TG" ? TG_NO_TRANSMISSION_GLN : receiverGln || insurerGln || provGln,
      qualDignities:
        (staffEntity?.qual_dignities && (staffEntity.qual_dignities as string[]).length > 0)
          ? staffEntity.qual_dignities as string[]
          : (billingEntity?.qual_dignities && (billingEntity.qual_dignities as string[]).length > 0)
            ? billingEntity.qual_dignities as string[]
            // When skipValidation is true, use a placeholder so buildInvoiceRequest doesn't throw.
            // For normal validation runs, leave undefined so the guard in buildInvoiceRequest catches it.
            : (skipValidation ? ["0000"] : undefined),
      // OAAT/OTMA "Fachbereich" (service spécialisé) — required with every
      // TARDOC position (CSS 5.113.002 / Helsana eK6.2.1 otherwise).
      medicalSectionCode: staffEntity?.medical_section_code
        || mandantEntity?.medical_section_code
        || billingEntity?.medical_section_code
        || "",
    };

    // When skipValidation is true and qualDignities still ended up undefined, force placeholder.
    if (skipValidation && (!sumexInput.qualDignities || sumexInput.qualDignities.length === 0)) {
      (sumexInput as any).qualDignities = ["0000"];
    }

    console.log(`[CheckXML] Building XML: ${sumexServices.length} services, ${sumexDiagnoses.length} diagnoses, IBAN=${provIban}, biller=${provGln}, skipValidation=${skipValidation}`);

    // Generate XML only (no PDF for check)
    const result = await buildInvoiceRequest(sumexInput);

    if (!result.success || !result.xmlContent) {
      console.error(`[CheckXML] FAILED: error=${result.error}, abort=${result.abortInfo}`);
      return NextResponse.json(
        {
          error: "Sumex1 XML generation failed",
          details: result.error,
          abortInfo: result.abortInfo,
          validationError: result.validationError,
        },
        { status: 500 },
      );
    }

    console.log(`[CheckXML] OK: schema=${result.usedSchema}, validErr=${result.validationError}, xmlLength=${result.xmlContent.length}`);

    return NextResponse.json({
      success: true,
      xmlContent: result.xmlContent,
      usedSchema: result.usedSchema,
      validationError: result.validationError,
      xmlFilePath: result.xmlFilePath,
      total: invoice.total_amount,
      serviceCount: sumexServices.length,
      reconciliation,
    });
  } catch (error) {
    console.error("[CheckXML] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
