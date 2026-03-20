import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
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

// Default QR-IBAN fallback (IID 30000-31999 required for QR type)
const FALLBACK_QR_IBAN = "CH0930788000050249289";

// MediData intermediate (clearing house) GLN — required in XML transport <via>
const MEDIDATA_INTERMEDIATE_GLN = "7601001304307";


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
    const {
      invoiceId,
      // Legacy compat: also accept consultationId as alias
      consultationId,
      patientId: bodyPatientId,
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
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, phone, vatuid")
        .eq("id", invoice.provider_id)
        .single();
      if (provRow) billingEntity = provRow;
    }

    // ── Fetch staff/doctor provider if different ──
    let staffEntity: Record<string, any> | null = null;
    if (invoice.doctor_user_id && invoice.doctor_user_id !== invoice.provider_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title")
        .eq("id", invoice.doctor_user_id)
        .single();
      if (staffRow) staffEntity = staffRow;
    }

    // ── Fetch insurer data ──
    let insurerGln = "";
    let insurerName = "";
    let receiverGln = "";
    if (invoice.insurer_id) {
      const { data: insurerRow } = await supabaseAdmin
        .from("swiss_insurers")
        .select("name, gln, receiver_gln")
        .eq("id", invoice.insurer_id)
        .single();
      if (insurerRow) {
        insurerGln = insurerRow.gln || "";
        insurerName = insurerRow.name || "";
        receiverGln = insurerRow.receiver_gln || insurerGln;
      }
    }

    // If no insurer on invoice, try patient_insurances
    if (!insurerGln) {
      const { data: patIns } = await supabaseAdmin
        .from("patient_insurances")
        .select("insurer_id, gln, insurer_gln, provider_name, card_number, avs_number")
        .eq("patient_id", patientId)
        .eq("is_primary", true)
        .limit(1);
      const ins = patIns?.[0];
      if (ins) {
        insurerGln = ins.gln || ins.insurer_gln || "";
        insurerName = ins.provider_name || "";
        // Try to resolve receiver_gln from swiss_insurers
        if (ins.insurer_id && !receiverGln) {
          const { data: siRow } = await supabaseAdmin
            .from("swiss_insurers")
            .select("name, gln, receiver_gln")
            .eq("id", ins.insurer_id)
            .single();
          if (siRow) {
            insurerGln = insurerGln || siRow.gln || "";
            insurerName = insurerName || siRow.name || "";
            receiverGln = siRow.receiver_gln || insurerGln;
          }
        }
      }
    }

    // ── Resolve provider fields with fallbacks ──
    // GLN must be exactly 13 digits
    const pickValidGln = (...candidates: (string | null | undefined)[]) => {
      for (const c of candidates) if (c && /^\d{13}$/.test(c)) return c;
      return "7601003000115"; // fallback
    };
    const provGln = pickValidGln(billingEntity?.gln, invoice.provider_gln);
    const provZsr = billingEntity?.zsr || invoice.provider_zsr || "";
    const provName = billingEntity?.name || invoice.provider_name || "Aesthetics Clinic XT SA";
    const provStreet = billingEntity?.street
      ? `${billingEntity.street}${billingEntity.street_no ? " " + billingEntity.street_no : ""}`
      : "";
    const provZip = billingEntity?.zip_code || "";
    const provCity = billingEntity?.city || "";
    const provCanton = billingEntity?.canton || invoice.treatment_canton || "GE";

    // IBAN: validate, strip spaces, fallback to QR-IBAN
    const provIban = sanitizeIban(billingEntity?.iban)
      || sanitizeIban(invoice.provider_iban)
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
    // GLN must be exactly 13 digits; fall back to billing entity GLN if invalid
    const isValidGln = (g: string | null | undefined) => g != null && /^\d{13}$/.test(g);

    const sumexServices: SumexServiceInput[] = (dbLineItems || []).map((item: any) => {
      // Use stored tariff_type, or derive from tariff_code (zero-padded to 3 digits)
      const tariffType = item.tariff_type || (item.tariff_code ? String(item.tariff_code).padStart(3, "0") : "999");
      const svcGln = isValidGln(item.provider_gln) ? item.provider_gln : provGln;
      const svcRespGln = isValidGln(item.responsible_gln) ? item.responsible_gln : svcGln;
      return {
        tariffType,
        code: item.code || "",
        referenceCode: item.ref_code || "",
        quantity: item.quantity || 1,
        sessionNumber: item.session_number ?? 1,
        dateBegin: item.date_begin || treatmentDate,
        providerGln: svcGln,
        responsibleGln: svcRespGln,
        side: (item.side_type as 0 | 1 | 2 | 3) ?? 0,
        serviceName: item.name || "",
        unit: item.unit_price || 0,
        unitFactor: 1,
        externalFactor: item.tariff_code === 5 ? (item.external_factor_mt ?? 1) : 1,
        amount: item.total_price || 0,
        vatRate: 0,
        ignoreValidate: YesNo.Yes,
      };
    });

    if (sumexServices.length === 0) {
      return NextResponse.json(
        { error: "No line items found for this invoice" },
        { status: 400 },
      );
    }

    // ── Diagnosis codes from invoice ──
    // Filter to valid ICD codes only (must be at least 2 chars, e.g. "Z42.1")
    const diagCodes: string[] = Array.isArray(invoice.diagnosis_codes)
      ? invoice.diagnosis_codes
          .filter((d: any) => d.type === "ICD" || typeof d === "string")
          .map((d: any) => (typeof d === "string" ? d : d.code))
          .filter((c: string) => c && c.length >= 2)
      : [];
    const sumexDiagnoses: SumexDiagnosis[] = diagCodes.map(code => ({
      type: DiagnosisType.ICD,
      code: String(code),
    }));

    // ── Build Sumex1 input ──
    const sumexInput: SumexInvoiceInput = {
      language: 2,
      roleType: RoleType.Physician,
      placeType: PlaceType.Practice,
      requestType: RequestType.Invoice,
      requestSubtype: RequestSubtype.Normal,
      tiersMode: mapSumexTiers(invoice.billing_type || "TG"),
      vatNumber: billingEntity?.vatuid || "",
      invoiceId: invoice.invoice_number || `INV-${resolvedInvoiceId.slice(0, 8)}`,
      invoiceDate: invoice.invoice_date || new Date().toISOString().split("T")[0],
      lawType: mapSumexLaw(invoice.health_insurance_law || "KVG"),
      insuredId: invoice.patient_card_number || invoice.patient_ssn || "",
      esrType: EsrType.QR,
      iban: provIban,
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
        street: "",
        zip: "",
        city: "",
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
      printCopyToGuarantor: mapSumexTiers(invoice.billing_type || "TG") === 1 ? YesNo.Yes : undefined,
      treatmentCanton: invoice.treatment_canton || provCanton,
      treatmentDateBegin: treatmentDate,
      treatmentDateEnd: invoice.treatment_date_end?.split("T")[0] || treatmentDate,
      diagnoses: sumexDiagnoses,
      services: sumexServices,
      softwarePackage: "AestheticsClinic",
      softwareVersion: 100,
      softwareId: 0,
      transportFrom: senderGln || provGln,
      transportViaGln: MEDIDATA_INTERMEDIATE_GLN,
      transportTo: receiverGln || insurerGln || provGln,
    };

    console.log(`[CheckXML] Building XML: ${sumexServices.length} services, ${sumexDiagnoses.length} diagnoses, IBAN=${provIban}, biller=${provGln}`);

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
    });
  } catch (error) {
    console.error("[CheckXML] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
