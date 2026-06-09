import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { generateSwissReference } from "@/lib/swissQrBill";
import type { Invoice, InvoiceLineItem } from "@/lib/invoiceTypes";
import {
  buildInvoiceRequest,
  mapLawType as mapSumexLaw,
  mapTiersMode as mapSumexTiers,
  mapSex as mapSumexSex,
  TiersMode,
  RoleType,
  PlaceType,
  RequestType,
  RequestSubtype,
  DiagnosisType,
  EsrType,
  YesNo,
  GenerationAttribute,
  type SumexInvoiceInput,
  type InvoiceServiceInput as SumexServiceInput,
  type InvoiceDiagnosis as SumexDiagnosis,
} from "@/lib/sumexInvoice";
import { deriveTariffType } from "@/lib/tariffType";

type PatientData = {
  first_name: string;
  last_name: string;
  dob: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  gender: string | null;
  email?: string | null;
  phone?: string | null;
};

type ProviderData = {
  id: string;
  name: string;
  specialty: string | null;
  email: string | null;
  phone: string | null;
  gln: string | null;
  zsr: string | null;
  street: string | null;
  street_no: string | null;
  zip_code: string | null;
  city: string | null;
  canton: string | null;
  iban: string | null;
  salutation: string | null;
  title: string | null;
  qual_dignities?: string[] | null;
};

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, invoiceType = "tp", reminderLevel = 1 } = await request.json();
    console.log("PDF generation request received for invoice ID:", invoiceId, "type:", invoiceType);

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Fetch invoice with line items
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    console.log("Invoice query result:", { invoice, invoiceError });

    if (invoiceError || !invoice) {
      console.log("Invoice not found, error:", invoiceError);
      return NextResponse.json(
        { error: "Invoice not found", details: invoiceError },
        { status: 404 }
      );
    }

    const invoiceData = invoice as Invoice;

    // Fetch line items
    const { data: lineItemsRaw, error: lineItemsError } = await supabaseAdmin
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true });

    if (lineItemsError) {
      return NextResponse.json(
        { error: "Failed to fetch line items" },
        { status: 500 }
      );
    }

    const lineItems = (lineItemsRaw || []) as InvoiceLineItem[];

    // Fetch patient
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, dob, street_address, postal_code, town, gender, email, phone")
      .eq("id", invoiceData.patient_id)
      .single();

    console.log("Patient query result:", { patientId: invoiceData.patient_id, patient, patientError });

    if (patientError || !patient) {
      console.log("Patient not found, error:", patientError);
      return NextResponse.json(
        { error: "Patient not found", details: patientError },
        { status: 404 }
      );
    }

    const patientData = patient as PatientData;

    // Fetch billing entity (clinic) data
    let billingEntityData: ProviderData | null = null;
    if (invoiceData.provider_id) {
      const { data: providerRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, role, vatuid, qual_dignities")
        .eq("id", invoiceData.provider_id)
        .single();
      if (providerRow) billingEntityData = providerRow as ProviderData;
    }

    // Fetch medical staff (doctor/nurse) data from providers table
    let staffData: ProviderData | null = null;
    if (invoiceData.doctor_user_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, role, qual_dignities")
        .eq("id", invoiceData.doctor_user_id)
        .single();
      if (staffRow) staffData = staffRow as ProviderData;
    }

    // FALLBACK for old invoices: If no doctor_user_id, provider_id was the doctor
    // In old system, the doctor record contained BOTH doctor info AND billing entity info
    if (!invoiceData.doctor_user_id && billingEntityData) {
      // Old invoice: provider_id was the doctor who had everything
      staffData = {
        ...billingEntityData,
        // Use snapshot data from invoice if available (more accurate for old invoices)
        name: invoiceData.provider_name || billingEntityData.name,
        gln: invoiceData.provider_gln || billingEntityData.gln,
        zsr: invoiceData.provider_zsr || billingEntityData.zsr,
      };
      
      // For old invoices, the doctor record IS also the billing entity
      // So billingEntityData already has the IBAN and address we need
      // No need to fetch a separate billing entity
    }

    // SYMMETRIC FALLBACK: invoice has doctor_user_id but no provider_id
    // Without this, Sumex SetEsrQR fails with [622] "Kreditor: Die Adressangaben
    // sind nicht vollständig" because provStreet/provZip/provCity default to "".
    if (!billingEntityData && staffData) {
      billingEntityData = staffData;
      console.log(
        `[GeneratePDF] No provider_id on invoice; using doctor (${staffData.name}) as billing entity.`,
      );
    }

    // ── Detect insurance (Tiers Payant / Tiers Garant) invoice and generate specialized PDF ──
    // Treat as insurance if:
    // 1. There's an actual insurer OR payment method is Insurance
    // 2. OR invoice contains TARMED/TARDOC items (requires proper tariff handling)
    const hasMedicalTariffItems = lineItems.some((item: any) =>
      item.tariff_code === 1 || // TARMED
      item.tariff_code === 7 || // TARDOC
      item.catalog_name?.toLowerCase() === 'tarmed' ||
      item.catalog_name?.toLowerCase() === 'tardoc'
    );
    const isInsuranceInvoice = !!invoiceData.insurer_id || invoiceData.payment_method === "Insurance" || hasMedicalTariffItems;
    if (isInsuranceInvoice) {
      console.log(`[GeneratePDF] Insurance invoice detected (${invoiceData.billing_type || "TP"}) — using Sumex1 Print for PDF`);

      // Fetch insurer data — MediData participants is authoritative for addresses
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
      let insurerRow: Record<string, any> | null = null;
      if (invoiceData.insurer_id) {
        insurerRow = await fetchInsurerRow({ col: "id", val: invoiceData.insurer_id });
      }
      // Fallback: look up by GLN stored on the invoice
      if (!insurerRow && invoiceData.insurance_gln) {
        insurerRow = await fetchInsurerRow({ col: "gln", val: invoiceData.insurance_gln });
      }
      if (insurerRow) {
        insurerGln = insurerRow.gln || "";
        insurerName = insurerRow.name || "";
        receiverGln = insurerRow.receiver_gln || insurerGln;
        insurerStreet = insurerRow.address_street || "";
        insurerZip = insurerRow.address_postal_code || "";
        insurerCity = insurerRow.address_city || "";
      }
      // If insurer GLN not yet resolved, use invoice field directly
      if (!insurerGln && invoiceData.insurance_gln) insurerGln = invoiceData.insurance_gln;
      if (!insurerName && invoiceData.insurance_name) insurerName = invoiceData.insurance_name;

      const provGln = billingEntityData?.gln || invoiceData.provider_gln || "7601003000115";
      const provZsr = billingEntityData?.zsr || invoiceData.provider_zsr || "";
      const provName = "TOA SA";
      const provStreet = billingEntityData?.street ? `${billingEntityData.street}${billingEntityData.street_no ? " " + billingEntityData.street_no : ""}` : "Voie du Chariot 6";
      const provZip = billingEntityData?.zip_code || "1003";
      const provCity = billingEntityData?.city || "Lausanne";
      const provCanton = billingEntityData?.canton || invoiceData.treatment_canton || "VD";
      // IBAN: strip spaces, validate Swiss QR-IBAN (Sumex SetEsrQR requires IID 30000-31999).
      // Regular IBANs are rejected by Sumex with code 638; fall back to the clinic's default QR-IBAN.
      const sanitizeQrIban = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const stripped = raw.replace(/\s+/g, "").toUpperCase();
        if (!/^CH[0-9A-Z]{19}$/.test(stripped)) return null;
        // QR-IBAN: positions 4-8 (0-indexed) must be 30000-31999
        const iid = parseInt(stripped.slice(4, 9), 10);
        if (Number.isNaN(iid) || iid < 30000 || iid > 31999) {
          console.warn(`[GeneratePDF] IBAN ${stripped} is not a QR-IBAN (IID=${iid}); falling back to default QR-IBAN.`);
          return null;
        }
        return stripped;
      };
      const provIban = sanitizeQrIban(billingEntityData?.iban) || sanitizeQrIban(invoiceData.provider_iban) || "CH0930788000050249289";

      const treatmentDate = invoiceData.treatment_date || invoiceData.invoice_date || new Date().toISOString().split("T")[0];

      // Map line items to Sumex1 services
      // GLN must be exactly 13 digits; fall back to billing entity GLN if invalid
      const isValidGln = (g: string | null | undefined) => g != null && /^\d{13}$/.test(g);

      const sumexServices: SumexServiceInput[] = lineItems.map((item: any) => {
        // Resolve tariff_type honoring `catalog_name` first so TMA gestures
        // emit as "TMA". See src/lib/tariffType.ts.
        const tariffType = deriveTariffType(item);
        const svcGln = isValidGln(item.provider_gln) ? item.provider_gln : provGln;
        const svcRespGln = isValidGln(item.responsible_gln) ? item.responsible_gln : svcGln;

        // TARMED (tariff_code=1) vs TARDOC (tariff_code=7) vs ACF (005) vs other
        const isTardoc = item.tariff_code === 7 || tariffType === "007";
        const isTarmed = item.tariff_code === 1 || tariffType === "001";
        const isAcf = tariffType === "005";

        let unit: number;
        let unitFactor: number;
        let unitTT: number | undefined;
        let unitFactorTT: number | undefined;
        let calculatedAmount: number;

        if (isTarmed) {
          // TARMED: unit = tp_al (medical technical points), Sumex handles Taxpunktwert internally
          unit = item.tp_al || item.unit_price || 0;
          unitFactor = 1;
          calculatedAmount = unit * (item.quantity || 1);
        } else if (isTardoc || isAcf) {
          // TARDOC and ACF: split AL (arzt) and TL (technisch) tax points + point values.
          // AR.* room/change codes (serviceType=R) self-compute TT via changeMin — must send 0.
          const isArCode = (item.tardoc_code || item.code || "").startsWith("AR.");
          unit = item.tp_al || 0;
          unitFactor = item.tp_al_value || 1;
          unitTT = isArCode ? undefined : (item.tp_tl || undefined);
          unitFactorTT = isArCode ? undefined : (item.tp_tl_value || undefined);
          calculatedAmount = item.total_price || 0;
        } else {
          unit = item.unit_price || 0;
          unitFactor = 1;
          calculatedAmount = item.total_price || 0;
        }

        // Plain service lines (no tariff code) get tariff 999 with code "1"
        // to prevent Sumex error 929 "undefined/invalid code".
        const isPlain = !isTardoc && !isTarmed && !isAcf && !item.code && !item.tardoc_code;
        const resolvedTariffType = isPlain ? "999" : tariffType;
        const resolvedCode = isPlain ? "1" : (item.code || item.tardoc_code || "");

        return {
          tariffType: resolvedTariffType,
          code: resolvedCode,
          referenceCode: item.ref_code || "",
          quantity: item.quantity || 1,
          sessionNumber: isAcf ? 1 : (item.session_number ?? 1),
          dateBegin: item.date_begin || treatmentDate,
          providerGln: svcGln,
          responsibleGln: svcRespGln,
          side: (item.side_type as 0 | 1 | 2 | 3) ?? 0,
          serviceName: item.name || "",
          unit,
          unitFactor,
          unitTT,
          unitFactorTT,
          externalFactor: (item.tariff_code === 5 || item.tariff_code === 7) ? (item.external_factor_mt ?? 1) : (item.external_factor_mt ?? 1),
          amount: calculatedAmount,
          // TARDOC/ACF/TARMED lines are always VAT-exempt for insurer billing.
          vatRate: (isTardoc || isTarmed || isAcf) ? 0 : (Number(item.vat_rate_value) || 0),
          ignoreValidate: YesNo.Yes,
        };
      });

      // Diagnosis codes from invoice
      const diagCodes: string[] = Array.isArray(invoiceData.diagnosis_codes)
        ? invoiceData.diagnosis_codes.map((d: any) => d.code || d).filter(Boolean)
        : [];
      const sumexDiagnoses: SumexDiagnosis[] = diagCodes.map(code => ({
        type: DiagnosisType.ICD,
        code: String(code),
      }));

      // --- Payment status remark & generation attributes ---
      const paidAmt = Number(invoiceData.paid_amount) || 0;
      const totalAmt = Number(invoiceData.total_amount) || 0;
      const isFullyPaid = invoiceData.status === "PAID" || invoiceData.status === "OVERPAID" || (paidAmt > 0 && paidAmt >= totalAmt - 0.01);
      const isPartialPaid = invoiceData.status === "PARTIAL_PAID" || (paidAmt > 0 && paidAmt < totalAmt - 0.01);

      let paymentRemark = "";
      let pdfGenAttrs = GenerationAttribute.None;
      if (isFullyPaid) {
        paymentRemark = `ACQUITTÉ / BEZAHLT — Montant acquitté: ${totalAmt.toFixed(2)} CHF`;
        // Remove QR payment slip for fully paid invoices (nothing to pay)
        pdfGenAttrs = GenerationAttribute.ExcludeESRInPrint;
      } else if (isPartialPaid) {
        const remaining = totalAmt - paidAmt;
        paymentRemark = `Acompte reçu / Anzahlung erhalten: ${paidAmt.toFixed(2)} CHF — Solde / Restbetrag: ${remaining.toFixed(2)} CHF`;
      }

      const tiersMode1 = mapSumexTiers(invoiceType === "tg" ? "TG" : invoiceType === "tp" ? "TP" : (invoiceData.billing_type || "TG"));
      // amountPrepaid is only allowed in Tiers Garant (TG) — error [926] if sent for TP/TS
      const amountPrepaid1 = tiersMode1 === TiersMode.Garant ? paidAmt : 0;

      const sumexInput: SumexInvoiceInput = {
        language: 2,
        roleType: RoleType.Physician,
        placeType: PlaceType.Practice,
        requestType: invoiceType === "reminder" ? RequestType.Reminder : RequestType.Invoice,
        requestSubtype: RequestSubtype.Normal,
        remark: paymentRemark || undefined,
        tiersMode: tiersMode1,
        amountPrepaid: amountPrepaid1 || undefined,
        vatNumber: (billingEntityData as any)?.vatuid || "",
        invoiceId: invoiceData.invoice_number || `INV-${invoiceId.slice(0, 8)}`,
        invoiceDate: invoiceData.invoice_date || new Date().toISOString().split("T")[0],
        lawType: mapSumexLaw(invoiceData.health_insurance_law || "KVG"),
        insuredId: invoiceData.patient_ssn || "",
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
        providerGln: provGln,
        providerZsr: provZsr || undefined,
        providerAddress: {
          familyName: staffData?.name || invoiceData.doctor_name || provName,
          givenName: "",
          salutation: staffData?.salutation || billingEntityData?.salutation || "",
          title: staffData?.title || billingEntityData?.title || "",
          street: provStreet,
          zip: provZip,
          city: provCity,
          stateCode: provCanton,
        },
        insuranceGln: insurerGln || undefined,
        insuranceAddress: insurerGln ? {
          companyName: insurerName,
          street: insurerStreet,
          zip: insurerZip,
          city: insurerCity,
          stateCode: "",
        } : undefined,
        patientSex: mapSumexSex(patientData.gender || "male"),
        patientBirthdate: patientData.dob || "1990-01-01",
        patientSsn: invoiceData.patient_ssn || "",
        patientAddress: {
          familyName: patientData.last_name,
          givenName: patientData.first_name,
          street: patientData.street_address || "",
          zip: patientData.postal_code || "",
          city: patientData.town || "",
          stateCode: provCanton,
          email: patientData.email || undefined,
          phone: patientData.phone || undefined,
        },
        guarantorAddress: {
          familyName: patientData.last_name,
          givenName: patientData.first_name,
          street: patientData.street_address || "",
          zip: patientData.postal_code || "",
          city: patientData.town || "",
          stateCode: provCanton,
          email: patientData.email || undefined,
          phone: patientData.phone || undefined,
        },
        treatmentCanton: provCanton,
        treatmentDateBegin: treatmentDate,
        treatmentDateEnd: treatmentDate,
        diagnoses: sumexDiagnoses,
        services: sumexServices,
        transportFrom: provGln,
        transportTo: receiverGln || insurerGln || "",
        printCopyToGuarantor: (invoiceData.billing_type === 'TP' || invoiceData.copy_to_guarantor) ? YesNo.Yes : YesNo.No,
        qualDignities:
          (staffData?.qual_dignities && staffData.qual_dignities.length > 0)
            ? staffData.qual_dignities
            : (billingEntityData?.qual_dignities && billingEntityData.qual_dignities.length > 0)
              ? billingEntityData.qual_dignities
              : undefined,
        ...(invoiceType === "reminder" ? {
          reminderLevel: Number(reminderLevel) || 1,
          reminderText: `Rappel de paiement (${reminderLevel}${reminderLevel === 1 ? "er" : "ème"} rappel)`,
          reminderDate: new Date().toISOString().split("T")[0],
        } : {}),
      };

      // Generate XML + PDF via Sumex1 server
      // Template options:
      // - detail: multi-page with full service details (verbose, can overflow to many pages)
      // - summary: compact format with service list + QR-bill on same page where possible
      // - feeSummary: fee summary format (2 pages with QR-bill in v5.0)
      // Use "summary" for all invoice types to keep client invoice + QR-bill on same page
      // The insurance copy (Facture TP) will still be a separate page
      const printTemplate = "summary";
      // For non-TP types, force law=ORG (only template the server respects)
      if (invoiceType !== "tp") {
        sumexInput.lawType = mapSumexLaw("ORG");
      }
      const sumexResult = await buildInvoiceRequest(sumexInput, { generatePdf: true, printTemplate, generationAttributes: pdfGenAttrs });

      if (!sumexResult.success) {
        console.error(`[GeneratePDF] Sumex1 FAILED: ${sumexResult.error} / ${sumexResult.abortInfo}`);
        return NextResponse.json({ 
          error: "Sumex1 PDF generation failed", 
          details: sumexResult.error,
          abortInfo: sumexResult.abortInfo 
        }, { status: 500 });
      }

      // Use Sumex1-generated PDF
      if (!sumexResult.pdfContent) {
        console.error(`[GeneratePDF] Sumex1 XML OK but PDF not available`);
        return NextResponse.json({ 
          error: "Sumex1 PDF generation failed - no PDF content returned",
          xmlGenerated: true
        }, { status: 500 });
      }

      const pdfBuffer = sumexResult.pdfContent;
      console.log(`[GeneratePDF] Sumex1 PDF: ${pdfBuffer.length} bytes, schema=${sumexResult.usedSchema}`);

      const typePrefix = invoiceType === "tg" ? "invoice" : invoiceType === "tp" ? "invoice-tp" : invoiceType === "reminder" ? "reminder" : "receipt";
      const fileName = `${typePrefix}-${invoiceData.invoice_number}-${Date.now()}.pdf`;
      const filePath = `${invoiceData.patient_id}/${fileName}`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .upload(filePath, pdfBuffer, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: true,
        });

      if (uploadError) {
        return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 });
      }

      const pdfColumn = invoiceType === "tg" ? "pdf_path_tg" : invoiceType === "tp" ? "pdf_path_tp" : invoiceType === "reminder" ? "pdf_path_reminder" : "pdf_path_receipt";
      await supabaseAdmin
        .from("invoices")
        .update({ pdf_path: filePath, [pdfColumn]: filePath, pdf_generated_at: new Date().toISOString() })
        .eq("id", invoiceId);

      // Use signed URL for private bucket access (valid for 1 hour)
      const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .createSignedUrl(filePath, 3600);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("[GeneratePDF] Failed to create signed URL:", signedUrlError);
        return NextResponse.json({ 
          error: "PDF generated but failed to create download URL",
          pdfPath: filePath 
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        pdfUrl: signedUrlData.signedUrl,
        pdfPath: filePath,
        qrCodeType: "sumex1",
        sumex1Schema: sumexResult.usedSchema,
      });
    }

    // ── Try Sumex1 for cash/card/bank/online invoices too (unified template) ──
    {
      console.log(`[GeneratePDF] Non-insurance invoice (${invoiceData.payment_method}) — attempting Sumex1 unified template (TG mode, no insurance)`);

      const provGln = billingEntityData?.gln || invoiceData.provider_gln || "7601003000115";
      const provZsr = billingEntityData?.zsr || invoiceData.provider_zsr || "";
      const provName = "TOA SA";
      const provStreetFull = billingEntityData?.street ? `${billingEntityData.street}${billingEntityData.street_no ? " " + billingEntityData.street_no : ""}` : "Voie du Chariot 6";
      const provZip = billingEntityData?.zip_code || "1003";
      const provCity = billingEntityData?.city || "Lausanne";
      const provCanton = billingEntityData?.canton || invoiceData.treatment_canton || "VD";
      // QR-IBAN check: Sumex SetEsrQR requires IID 30000-31999.
      const sanitizeQrIban2 = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const stripped = raw.replace(/\s+/g, "").toUpperCase();
        if (!/^CH[0-9A-Z]{19}$/.test(stripped)) return null;
        const iid = parseInt(stripped.slice(4, 9), 10);
        if (Number.isNaN(iid) || iid < 30000 || iid > 31999) {
          console.warn(`[GeneratePDF] IBAN ${stripped} is not a QR-IBAN (IID=${iid}); falling back to default QR-IBAN.`);
          return null;
        }
        return stripped;
      };
      const provIbanSumex = sanitizeQrIban2(billingEntityData?.iban) || sanitizeQrIban2(invoiceData.provider_iban) || "CH0930788000050249289";
      const treatmentDate = invoiceData.treatment_date || invoiceData.invoice_date || new Date().toISOString().split("T")[0];

      // Map line items
      const isValidGln2 = (g: string | null | undefined) => g != null && /^\d{13}$/.test(g);
      const sumexServices2: SumexServiceInput[] = lineItems.map((item: any) => {
        const svcGln = isValidGln2(item.provider_gln) ? item.provider_gln : provGln;
        const svcRespGln = isValidGln2(item.responsible_gln) ? item.responsible_gln : svcGln;
        // Resolve tariff_type honoring `catalog_name` first so TMA gestures
        // emit as "TMA". See src/lib/tariffType.ts.
        const tariffType = deriveTariffType(item);
        const isTardoc2 = item.tariff_code === 7 || tariffType === "007";
        const isTarmed2 = item.tariff_code === 1 || tariffType === "001";
        const isAcf2 = tariffType === "005";
        let unit2: number; let unitFactor2: number; let unitTT2: number | undefined; let unitFactorTT2: number | undefined; let amt2: number;
        if (isTarmed2) {
          unit2 = item.tp_al || item.unit_price || 0; unitFactor2 = 1; amt2 = unit2 * (item.quantity || 1);
        } else if (isTardoc2 || isAcf2) {
          // AR.* room/change codes self-compute TT via changeMin — must send 0.
          const isArCode2 = (item.tardoc_code || item.code || "").startsWith("AR.");
          unit2 = item.tp_al || 0; unitFactor2 = item.tp_al_value || 1;
          unitTT2 = isArCode2 ? undefined : (item.tp_tl || undefined);
          unitFactorTT2 = isArCode2 ? undefined : (item.tp_tl_value || undefined);
          amt2 = item.total_price || 0;
        } else {
          unit2 = item.unit_price || 0; unitFactor2 = 1; amt2 = item.total_price || 0;
        }
        // Plain service lines (no tariff code) get tariff 999 with code "1"
        // to prevent Sumex error 929 "undefined/invalid code".
        const isPlain2 = !isTardoc2 && !isTarmed2 && !isAcf2 && !item.code && !item.tardoc_code;
        const resolvedTariffType2 = isPlain2 ? "999" : tariffType;
        const resolvedCode2 = isPlain2 ? "1" : (item.code || item.tardoc_code || "");

        return {
          tariffType: resolvedTariffType2,
          code: resolvedCode2,
          referenceCode: item.ref_code || "",
          quantity: item.quantity || 1,
          sessionNumber: isAcf2 ? 1 : (item.session_number ?? 1),
          dateBegin: item.date_begin || treatmentDate,
          providerGln: svcGln,
          responsibleGln: svcRespGln,
          side: (item.side_type as 0 | 1 | 2 | 3) ?? 0,
          serviceName: item.name || "",
          unit: unit2,
          unitFactor: unitFactor2,
          unitTT: unitTT2,
          unitFactorTT: unitFactorTT2,
          externalFactor: (item.tariff_code === 5 || item.tariff_code === 7) ? (item.external_factor_mt ?? 1) : (item.external_factor_mt ?? 1),
          amount: amt2,
          vatRate: (isTardoc2 || isTarmed2 || isAcf2) ? 0 : (Number(item.vat_rate_value) || 0),
          ignoreValidate: YesNo.Yes,
        };
      });

      // --- Payment status remark & generation attributes (non-insurance path) ---
      const paidAmt2 = Number(invoiceData.paid_amount) || 0;
      const totalAmt2 = Number(invoiceData.total_amount) || 0;
      const isFullyPaid2 = invoiceData.status === "PAID" || invoiceData.status === "OVERPAID" || (paidAmt2 > 0 && paidAmt2 >= totalAmt2 - 0.01);
      const isPartialPaid2 = invoiceData.status === "PARTIAL_PAID" || (paidAmt2 > 0 && paidAmt2 < totalAmt2 - 0.01);

      let paymentRemark2 = "";
      let pdfGenAttrs2 = GenerationAttribute.None;
      if (isFullyPaid2) {
        paymentRemark2 = `ACQUITTÉ / BEZAHLT — Montant acquitté: ${totalAmt2.toFixed(2)} CHF`;
        pdfGenAttrs2 = GenerationAttribute.ExcludeESRInPrint;
      } else if (isPartialPaid2) {
        const remaining2 = totalAmt2 - paidAmt2;
        paymentRemark2 = `Acompte reçu / Anzahlung erhalten: ${paidAmt2.toFixed(2)} CHF — Solde / Restbetrag: ${remaining2.toFixed(2)} CHF`;
      }

      const tiersMode2 = mapSumexTiers("TG");
      // amountPrepaid only allowed in TG — keep consistent even though this path is always TG
      const amountPrepaid2 = tiersMode2 === TiersMode.Garant ? paidAmt2 : 0;

      const sumexInput2: SumexInvoiceInput = {
        language: 2,
        roleType: RoleType.Physician,
        placeType: PlaceType.Practice,
        requestType: invoiceType === "reminder" ? RequestType.Reminder : RequestType.Invoice,
        requestSubtype: RequestSubtype.Normal,
        remark: paymentRemark2 || undefined,
        tiersMode: tiersMode2,
        amountPrepaid: amountPrepaid2 || undefined,
        vatNumber: (billingEntityData as any)?.vatuid || "",
        invoiceId: invoiceData.invoice_number || `INV-${invoiceId.slice(0, 8)}`,
        invoiceDate: invoiceData.invoice_date || new Date().toISOString().split("T")[0],
        lawType: mapSumexLaw(invoiceData.health_insurance_law || "VVG"),
        esrType: EsrType.QR,
        iban: provIbanSumex,
        paymentPeriod: 30,
        billerGln: provGln,
        billerZsr: provZsr || undefined,
        billerAddress: {
          companyName: provName,
          street: provStreetFull,
          zip: provZip,
          city: provCity,
          stateCode: provCanton,
        },
        providerGln: provGln,
        providerZsr: provZsr || undefined,
        providerAddress: {
          familyName: staffData?.name || invoiceData.doctor_name || provName,
          givenName: "",
          salutation: staffData?.salutation || billingEntityData?.salutation || "",
          title: staffData?.title || billingEntityData?.title || "",
          street: provStreetFull,
          zip: provZip,
          city: provCity,
          stateCode: provCanton,
        },
        // For non-insurance invoices (card/cash/bank), provide fallback address
        // values to prevent Sumex1 SetPatient [622] "incomplete address" errors.
        // These invoices won't be sent to insurance so placeholder values are fine.
        patientSex: mapSumexSex(patientData.gender || "male"),
        patientBirthdate: patientData.dob || "1990-01-01",
        patientSsn: "",
        patientAddress: {
          familyName: patientData.last_name || "Patient",
          givenName: patientData.first_name || "Unknown",
          street: patientData.street_address || provStreetFull || "N/A",
          zip: patientData.postal_code || provZip || "0000",
          city: patientData.town || provCity || "N/A",
          stateCode: provCanton,
          email: patientData.email || "",
          phone: patientData.phone || "",
        },
        guarantorAddress: {
          familyName: patientData.last_name || "Patient",
          givenName: patientData.first_name || "Unknown",
          street: patientData.street_address || provStreetFull || "N/A",
          zip: patientData.postal_code || provZip || "0000",
          city: patientData.town || provCity || "N/A",
          stateCode: provCanton,
          email: patientData.email || "",
          phone: patientData.phone || "",
        },
        treatmentCanton: provCanton,
        treatmentDateBegin: treatmentDate,
        treatmentDateEnd: treatmentDate,
        services: sumexServices2,
        qualDignities:
          (staffData?.qual_dignities && staffData.qual_dignities.length > 0)
            ? staffData.qual_dignities
            : (billingEntityData?.qual_dignities && billingEntityData.qual_dignities.length > 0)
              ? billingEntityData.qual_dignities
              : undefined,
        ...(invoiceType === "reminder" ? {
          reminderLevel: Number(reminderLevel) || 1,
          reminderText: `Rappel de paiement (${reminderLevel}${reminderLevel === 1 ? "er" : "ème"} rappel)`,
          reminderDate: new Date().toISOString().split("T")[0],
        } : {}),
      };

      try {
        // Use "summary" template for compact format with service list + QR-bill on same page
        const printTemplate2 = "summary";
        if (invoiceType !== "tp") {
          sumexInput2.lawType = mapSumexLaw("ORG");
        }
        const sumexResult2 = await buildInvoiceRequest(sumexInput2, { generatePdf: true, printTemplate: printTemplate2, generationAttributes: pdfGenAttrs2 });

        if (sumexResult2.success && sumexResult2.pdfContent) {
          console.log(`[GeneratePDF] Sumex1 unified PDF generated: ${sumexResult2.pdfContent.length} bytes, paymentMethod=${invoiceData.payment_method}`);
          
          let finalPdfBuffer = sumexResult2.pdfContent;

          const typePrefix2 = invoiceType === "tg" ? "invoice" : invoiceType === "tp" ? "invoice-tp" : invoiceType === "reminder" ? "reminder" : "receipt";
          const fileName = `${typePrefix2}-${invoiceData.invoice_number}-${Date.now()}.pdf`;
          const filePath = `${invoiceData.patient_id}/${fileName}`;
          const { error: uploadError } = await supabaseAdmin.storage.from("invoice-pdfs").upload(filePath, finalPdfBuffer, { contentType: "application/pdf", cacheControl: "3600", upsert: true });
          if (!uploadError) {
            const pdfCol2 = invoiceType === "tg" ? "pdf_path_tg" : invoiceType === "tp" ? "pdf_path_tp" : invoiceType === "reminder" ? "pdf_path_reminder" : "pdf_path_receipt";
            await supabaseAdmin.from("invoices").update({ pdf_path: filePath, [pdfCol2]: filePath, pdf_generated_at: new Date().toISOString() }).eq("id", invoiceId);
            
            // Use signed URL for private bucket access (valid for 1 hour)
            const { data: signedUrlData, error: signedUrlError } = await supabaseAdmin.storage
              .from("invoice-pdfs")
              .createSignedUrl(filePath, 3600);
            
            if (signedUrlError || !signedUrlData?.signedUrl) {
              console.error("[GeneratePDF] Failed to create signed URL:", signedUrlError);
              return NextResponse.json({ 
                error: "PDF generated but failed to create download URL",
                pdfPath: filePath 
              }, { status: 500 });
            }
            
            return NextResponse.json({ 
              success: true, 
              pdfUrl: signedUrlData.signedUrl, 
              pdfPath: filePath, 
              qrCodeType: "sumex1-unified", 
              sumex1Schema: sumexResult2.usedSchema 
            });
          }
        } else {
          console.error(`[GeneratePDF] Sumex1 unified failed: ${sumexResult2.error}`);
          return NextResponse.json({ 
            error: "Sumex1 PDF generation failed", 
            details: sumexResult2.error 
          }, { status: 500 });
        }
      } catch (sumex2Err) {
        console.error(`[GeneratePDF] Sumex1 unified error:`, sumex2Err);
        return NextResponse.json({ 
          error: "Sumex1 PDF generation error", 
          details: String(sumex2Err) 
        }, { status: 500 });
      }
    }

    // Should never reach here - all paths above should return
    console.error(`[GeneratePDF] Unexpected code path - no PDF generated`);
    return NextResponse.json({ error: "Unexpected error - no PDF generated" }, { status: 500 });
  } catch (error) {
    console.error("[GeneratePDF] Fatal error:", error);
    return NextResponse.json({ error: "Internal server error", details: String(error) }, { status: 500 });
  }
}
