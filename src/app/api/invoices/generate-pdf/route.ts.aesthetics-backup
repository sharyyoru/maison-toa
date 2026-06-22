import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import QRCode from "qrcode";
import { generateSwissReference } from "@/lib/swissQrBill";
import type { Invoice, InvoiceLineItem } from "@/lib/invoiceTypes";
import { createPayrexxGateway } from "@/lib/payrexx";
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
  qual_dignities: string[] | null;
};

export async function POST(request: NextRequest) {
  const startTime = Date.now();
  const timings: Record<string, number> = {};
  
  try {
    const { invoiceId } = await request.json();
    console.log(`[TIMING] PDF generation started for invoice ID: ${invoiceId}`);
    timings.start = 0;

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Fetch invoice with line items
    const fetchInvoiceStart = Date.now();
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();
    timings.fetchInvoice = Date.now() - fetchInvoiceStart;
    console.log(`[TIMING] Fetch invoice: ${timings.fetchInvoice}ms`);

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
    const fetchLineItemsStart = Date.now();
    const { data: lineItemsRaw, error: lineItemsError } = await supabaseAdmin
      .from("invoice_line_items")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("sort_order", { ascending: true });
    timings.fetchLineItems = Date.now() - fetchLineItemsStart;
    console.log(`[TIMING] Fetch line items: ${timings.fetchLineItems}ms`);

    if (lineItemsError) {
      return NextResponse.json(
        { error: "Failed to fetch line items" },
        { status: 500 }
      );
    }

    const lineItems = (lineItemsRaw || []) as InvoiceLineItem[];

    // Fetch patient
    const fetchPatientStart = Date.now();
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, dob, street_address, postal_code, town, gender, email, phone")
      .eq("id", invoiceData.patient_id)
      .single();
    timings.fetchPatient = Date.now() - fetchPatientStart;
    console.log(`[TIMING] Fetch patient: ${timings.fetchPatient}ms`);

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
    const fetchProvidersStart = Date.now();
    let billingEntityData: ProviderData | null = null;
    if (invoiceData.provider_id) {
      const { data: providerRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, role, qual_dignities")
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
    timings.fetchProviders = Date.now() - fetchProvidersStart;
    console.log(`[TIMING] Fetch providers: ${timings.fetchProviders}ms`);

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
    // (self-employed doctor, or setup where the doctor is their own biller).
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
      console.log(`[GeneratePDF] Insurance/Medical tariff invoice detected (${invoiceData.billing_type || "TG"}) — using Sumex1 Print for PDF`);

      // Fetch insurer data
      let insurerGln = "";
      let insurerName = "";
      let receiverGln = "";
      if (invoiceData.insurer_id) {
        const { data: insurerRow } = await supabaseAdmin
          .from("swiss_insurers")
          .select("name, gln, street, zip_code, city, pobox, receiver_gln")
          .eq("id", invoiceData.insurer_id)
          .single();
        if (insurerRow) {
          insurerGln = (insurerRow as any).gln || "";
          insurerName = (insurerRow as any).name || "";
          receiverGln = (insurerRow as any).receiver_gln || insurerGln;
        }
      }

      const provGln = billingEntityData?.gln || invoiceData.provider_gln || "7601003000115";
      const provZsr = billingEntityData?.zsr || invoiceData.provider_zsr || "";
      const provName = billingEntityData?.name || invoiceData.provider_name || "Aesthetics Clinic XT SA";
      const provStreet = billingEntityData?.street ? `${billingEntityData.street}${billingEntityData.street_no ? " " + billingEntityData.street_no : ""}` : "";
      const provZip = billingEntityData?.zip_code || "";
      const provCity = billingEntityData?.city || "";
      const provCanton = billingEntityData?.canton || invoiceData.treatment_canton || "GE";
      // IBAN: strip spaces, validate Swiss format, fallback to QR-IBAN
      const sanitizeIban = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const stripped = raw.replace(/\s+/g, "").toUpperCase();
        if (/^CH[0-9A-Z]{19}$/.test(stripped)) return stripped;
        return null;
      };
      const provIban = sanitizeIban(billingEntityData?.iban) || sanitizeIban(invoiceData.provider_iban) || "CH0930788000050249289";

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
        
        // TARMED (tariff_code=1) vs TARDOC (tariff_code=7) have different handling
        const isTardoc = item.tariff_code === 7 || tariffType === "007";
        const isTarmed = item.tariff_code === 1 || tariffType === "001";
        
        // For TARMED: Sumex expects amounts in technical points (TP), not CHF
        // The formula is: amount = tp_al (medical TP) for the service
        // Sumex will multiply by tax point value internally
        // For TARDOC/others: use stored total_price (CHF)
        let calculatedAmount: number;
        let unit: number;
        let unitFactor: number;
        
        if (isTarmed) {
          // TARMED: amount = tp_al (medical technical points)
          // unit = tp_al, unitFactor = 1 (Sumex handles tax point value internally)
          unit = item.tp_al || item.unit_price || 0;
          unitFactor = 1;
          calculatedAmount = unit * (item.quantity || 1);
        } else if (isTardoc || (item.catalog_name === "ACF" && item.tp_al > 0)) {
          // TARDOC and ACF: use tp_al (tax points) and tp_al_value (point value / Taxpunktwert)
          unit = item.tp_al || 0;
          unitFactor = item.tp_al_value || 1;
          calculatedAmount = item.total_price || 0;
        } else {
          // Other tariffs: use unit_price and total_price
          unit = item.unit_price || 0;
          unitFactor = 1;
          calculatedAmount = item.total_price || 0;
        }
        
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
          unit,
          unitFactor,
          externalFactor: item.tariff_code === 5 ? (item.external_factor_mt ?? 1) : (item.external_factor_mt ?? 1),
          amount: calculatedAmount,
          vatRate: 0,
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

      const tiersMode1 = mapSumexTiers(invoiceData.billing_type || "TG");
      // amountPrepaid is only allowed in Tiers Garant (TG) — error [926] if sent for TP/TS
      const amountPrepaid1 = tiersMode1 === TiersMode.Garant ? paidAmt : 0;

      const sumexInput: SumexInvoiceInput = {
        language: 2,
        roleType: RoleType.Physician,
        placeType: PlaceType.Practice,
        requestType: RequestType.Invoice,
        requestSubtype: RequestSubtype.Normal,
        remark: paymentRemark || undefined,
        tiersMode: tiersMode1,
        vatNumber: "",
        amountPrepaid: amountPrepaid1,
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
          street: "",
          zip: "",
          city: "",
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
      };

      // Generate XML + PDF via Sumex1 server
      try {
        const sumexStart = Date.now();
        console.log(`[TIMING] Starting Sumex1 buildInvoiceRequest (insurance path)...`);
        const sumexResult = await buildInvoiceRequest(sumexInput, { generatePdf: true, generationAttributes: pdfGenAttrs });
        timings.sumexBuildInvoice = Date.now() - sumexStart;
        console.log(`[TIMING] Sumex1 buildInvoiceRequest completed: ${timings.sumexBuildInvoice}ms`);

        if (!sumexResult.success) {
          console.error(`[GeneratePDF] Sumex1 FAILED: ${sumexResult.error} / ${sumexResult.abortInfo}`);
          
          // Check for server offline error
          if (sumexResult.error === 'SUMEX_SERVER_OFFLINE') {
            return NextResponse.json({ 
              error: "Sumex1 server is offline", 
              details: "The invoice generation server is currently unavailable. Please contact your system administrator for support.",
              technicalDetails: "Connection timeout to Sumex server at 34.100.230.253:8080"
            }, { status: 503 });
          }
          
          return NextResponse.json({ 
            error: "Sumex1 PDF generation failed", 
            details: sumexResult.error,
            abortInfo: sumexResult.abortInfo 
          }, { status: 500 });
        }      // Use Sumex1-generated PDF
      if (!sumexResult.pdfContent) {
        console.error(`[GeneratePDF] Sumex1 XML OK but PDF not available`);
        return NextResponse.json({ 
          error: "Sumex1 PDF generation failed - no PDF content returned",
          xmlGenerated: true
        }, { status: 500 });
      }

      const pdfBuffer = sumexResult.pdfContent;
      console.log(`[GeneratePDF] Sumex1 PDF: ${pdfBuffer.length} bytes, schema=${sumexResult.usedSchema}`);

      // Create filename with patient name, invoice number, and timestamp for versioning
      const patientName = `${patientData.last_name}_${patientData.first_name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
      const fileName = `Facture_${invoiceData.invoice_number}_${patientName}_${timestamp}.pdf`;
      const filePath = `${invoiceData.patient_id}/${fileName}`;

      const uploadStart = Date.now();
      const { error: uploadError } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .upload(filePath, pdfBuffer, {
          contentType: "application/pdf",
          cacheControl: "3600",
        });
      timings.uploadPdf = Date.now() - uploadStart;
      console.log(`[TIMING] Upload PDF to storage: ${timings.uploadPdf}ms`);

      if (uploadError) {
        return NextResponse.json({ error: "Failed to upload PDF" }, { status: 500 });
      }

      const updateDbStart = Date.now();
      await supabaseAdmin
        .from("invoices")
        .update({ pdf_path: filePath, pdf_generated_at: new Date().toISOString() })
        .eq("id", invoiceId);
      timings.updateDb = Date.now() - updateDbStart;
      console.log(`[TIMING] Update database: ${timings.updateDb}ms`);

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("invoice-pdfs")
        .getPublicUrl(filePath);

      timings.total = Date.now() - startTime;
      console.log(`[TIMING] ===== TOTAL PDF GENERATION TIME: ${timings.total}ms =====`);
      console.log(`[TIMING] Breakdown:`, JSON.stringify(timings, null, 2));

      return NextResponse.json({
        success: true,
        pdfUrl: publicUrlData.publicUrl,
        pdfPath: filePath,
        qrCodeType: "sumex1",
        timings, // Include timing data in response for analysis
        sumex1Schema: sumexResult.usedSchema,
      });
      } catch (sumexErr: any) {
        console.error(`[GeneratePDF] Sumex1 insurance error:`, sumexErr);
        
        // Check for server offline error
        if (sumexErr?.message === 'SUMEX_SERVER_OFFLINE') {
          return NextResponse.json({ 
            error: "Sumex1 server is offline", 
            details: "The invoice generation server is currently unavailable. Please contact your system administrator for support.",
            technicalDetails: "Connection timeout to Sumex server at 34.100.230.253:8080"
          }, { status: 503 });
        }
        
        return NextResponse.json({ 
          error: "Sumex1 PDF generation error", 
          details: String(sumexErr) 
        }, { status: 500 });
      }
    }

    // ── Try Sumex1 for cash/card/bank/online invoices too (unified template) ──
    {
      console.log(`[GeneratePDF] Non-insurance invoice (${invoiceData.payment_method}) — attempting Sumex1 unified template (TG mode, no insurance)`);
      // Auto-create Payrexx gateway for online/card/cash invoices that don't have one yet
      const pmLower = (invoiceData.payment_method || "").toLowerCase();
      const needsPayrexx = (pmLower.includes("online") || pmLower.includes("card") || pmLower.includes("cash")) && !invoiceData.payrexx_payment_link;
      if (needsPayrexx) {
        console.log(`[GeneratePDF] No Payrexx link for ${invoiceData.payment_method} invoice — auto-creating gateway`);
        try {
          const amount = Math.round((invoiceData.total_amount || 0) * 100);
          if (amount > 0) {
            const gatewayRes = await createPayrexxGateway({
              amount,
              currency: "CHF",
              referenceId: invoiceData.invoice_number,
              purpose: `Invoice ${invoiceData.invoice_number} - Medical Services`,
              forename: patientData.first_name,
              surname: patientData.last_name,
              email: patientData.email || undefined,
              phone: patientData.phone || undefined,
              street: patientData.street_address || undefined,
              postcode: patientData.postal_code || undefined,
              place: patientData.town || undefined,
              country: "CH",
            });
            const gwData = Array.isArray(gatewayRes.data) ? gatewayRes.data[0] : gatewayRes.data;
            if (gatewayRes.status === "success" && gwData) {
              const gw = gwData as { id: number; hash: string; link: string };
              const paymentLink = gw.link || `https://aesthetics-ge.payrexx.com/?payment=${gw.hash}`;
              await supabaseAdmin.from("invoices").update({
                payrexx_gateway_id: gw.id,
                payrexx_gateway_hash: gw.hash,
                payrexx_payment_link: paymentLink,
                payrexx_payment_status: "waiting",
              }).eq("id", invoiceId);
              // Update local copy so QR overlay picks it up
              (invoiceData as any).payrexx_payment_link = paymentLink;
              console.log(`[GeneratePDF] ✓ Payrexx gateway created: ${paymentLink}`);
            } else {
              console.warn(`[GeneratePDF] Payrexx gateway creation returned non-success:`, gatewayRes.status);
            }
          }
        } catch (payrexxErr) {
          console.error(`[GeneratePDF] ✗ Failed to auto-create Payrexx gateway:`, payrexxErr);
          // Non-fatal — continue with bank QR instead
        }
      }

      const provGln = billingEntityData?.gln || invoiceData.provider_gln || "7601003000115";
      const provZsr = billingEntityData?.zsr || invoiceData.provider_zsr || "";
      const provName = billingEntityData?.name || invoiceData.provider_name || "Aesthetics Clinic XT SA";
      const provStreetFull = billingEntityData?.street ? `${billingEntityData.street}${billingEntityData.street_no ? " " + billingEntityData.street_no : ""}` : "";
      const provZip = billingEntityData?.zip_code || "";
      const provCity = billingEntityData?.city || "";
      const provCanton = billingEntityData?.canton || invoiceData.treatment_canton || "GE";
      const sanitizeIban2 = (raw: string | null | undefined): string | null => {
        if (!raw) return null;
        const stripped = raw.replace(/\s+/g, "").toUpperCase();
        if (/^CH[0-9A-Z]{19}$/.test(stripped)) return stripped;
        return null;
      };
      const provIbanSumex = sanitizeIban2(billingEntityData?.iban) || sanitizeIban2(invoiceData.provider_iban) || "CH0930788000050249289";
      const treatmentDate = invoiceData.treatment_date || invoiceData.invoice_date || new Date().toISOString().split("T")[0];

      // Map line items
      const isValidGln2 = (g: string | null | undefined) => g != null && /^\d{13}$/.test(g);
      const sumexServices2: SumexServiceInput[] = lineItems.map((item: any) => {
        const svcGln = isValidGln2(item.provider_gln) ? item.provider_gln : provGln;
        const svcRespGln = isValidGln2(item.responsible_gln) ? item.responsible_gln : svcGln;
        
        // Resolve tariff_type honoring `catalog_name` first so TMA gestures
        // emit as "TMA". See src/lib/tariffType.ts.
        const tariffType = deriveTariffType(item);
        
        // TARMED (tariff_code=1) vs TARDOC (tariff_code=7) have different handling
        const isTardoc = item.tariff_code === 7 || tariffType === "007";
        const isTarmed = item.tariff_code === 1 || tariffType === "001";
        
        // For TARMED: Sumex expects amounts in technical points (TP), not CHF
        // For TARDOC/others: use stored total_price (CHF)
        let calculatedAmount: number;
        let unit: number;
        let unitFactor: number;
        
        if (isTarmed) {
          // TARMED: amount = tp_al (medical technical points)
          // unit = tp_al, unitFactor = 1 (Sumex handles tax point value internally)
          unit = item.tp_al || item.unit_price || 0;
          unitFactor = 1;
          calculatedAmount = unit * (item.quantity || 1);
        } else if (isTardoc || (item.catalog_name === "ACF" && item.tp_al > 0)) {
          // TARDOC and ACF: use tp_al (tax points) and tp_al_value (point value / Taxpunktwert)
          unit = item.tp_al || 0;
          unitFactor = item.tp_al_value || 1;
          calculatedAmount = item.total_price || 0;
        } else {
          // Other tariffs: use unit_price and total_price
          unit = item.unit_price || 0;
          unitFactor = 1;
          calculatedAmount = item.total_price || 0;
        }
        
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
          unit,
          unitFactor,
          externalFactor: item.tariff_code === 5 ? (item.external_factor_mt ?? 1) : (item.external_factor_mt ?? 1),
          amount: calculatedAmount,
          vatRate: 0,
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
        requestType: RequestType.Invoice,
        requestSubtype: RequestSubtype.Normal,
        remark: paymentRemark2 || undefined,
        tiersMode: tiersMode2,
        vatNumber: "",
        amountPrepaid: amountPrepaid2,
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
      };

      try {
        const sumexStart = Date.now();
        console.log(`[TIMING] Starting Sumex1 buildInvoiceRequest (non-insurance path)...`);
        const sumexResult2 = await buildInvoiceRequest(sumexInput2, { generatePdf: true, generationAttributes: pdfGenAttrs2 });
        timings.sumexBuildInvoice = Date.now() - sumexStart;
        console.log(`[TIMING] Sumex1 buildInvoiceRequest completed: ${timings.sumexBuildInvoice}ms`);

        if (sumexResult2.success && sumexResult2.pdfContent) {
          // Overlay Payrexx QR for Online and Card payments (both use Payrexx gateway)
          const hasPayrexxLink = !!invoiceData.payrexx_payment_link;
          console.log(`[GeneratePDF] Sumex1 unified PDF generated: ${sumexResult2.pdfContent.length} bytes, paymentMethod=${invoiceData.payment_method}, hasPayrexxLink=${hasPayrexxLink}`);
          
          let finalPdfBuffer = sumexResult2.pdfContent;

          // For online payments with Payrexx link, overlay Payrexx QR on top of
          // the bank QR code on the payment slip (FIRST page = patient invoice).
          // Sumex1 generates multi-page PDF: page 1 = patient invoice with QR, rest = copies.
          // Swiss QR-bill standard: A4 page (595x842pt), payment slip is bottom 105mm (≈298pt).
          // Payment part is on the right side (210mm wide), receipt on left (62mm).
          // QR code in payment part: 46x46mm, positioned 67mm from left edge of payment part.
          if (hasPayrexxLink) {
            try {
              console.log(`[GeneratePDF] Starting Payrexx QR overlay for link: ${invoiceData.payrexx_payment_link}`);
              const { PDFDocument, rgb } = await import("pdf-lib");
              const pdfDoc = await PDFDocument.load(sumexResult2.pdfContent);
              const pages = pdfDoc.getPages();
              const firstPage = pages[0]; // Patient invoice is always page 1
              const { width: pageWidth, height: pageHeight } = firstPage.getSize();
              console.log(`[GeneratePDF] PDF total pages: ${pages.length}, page 1 size: ${pageWidth}x${pageHeight}pt`);
              
              // Generate Payrexx QR code as PNG
              const payrexxLink = invoiceData.payrexx_payment_link as string;
              const qrDataUrl = await QRCode.toDataURL(payrexxLink, {
                width: 300,
                margin: 0,
                color: { dark: "#000000", light: "#FFFFFF" },
              });
              const qrImageBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");
              const qrImage = await pdfDoc.embedPng(qrImageBytes);
              console.log(`[GeneratePDF] Payrexx QR image generated: ${qrImageBytes.length} bytes`);
              
              // Swiss QR-bill layout (in mm, converted to pt: 1mm ≈ 2.834pt):
              // Payment slip (Zahlteil) is at the bottom 105mm of the page
              // - Receipt part (Empfangsschein): left side, 0-62mm from left
              // - Payment part (Zahlteil): right side, 62-210mm from left
              // - QR code is in the payment part, positioned at:
              //   * Horizontal: 67mm from left edge of payment part = 62+67 = 129mm from page left = 365pt
              //   * Vertical: The QR is centered in the payment slip height, roughly 42mm from page bottom
              // - QR size: 46x46mm ≈ 130x130pt
              const qrSize = 130; // 46mm in points
              const qrX = 190; // 129mm from left = 365pt
              const qrY = 122; // 42mm from bottom = 119pt
              
              console.log(`[GeneratePDF] Overlaying on PAGE 1 at (${qrX}, ${qrY}) size ${qrSize}x${qrSize}`);
              // White-out the existing bank QR code area
              firstPage.drawRectangle({
                x: qrX - 2,
                y: qrY - 2,
                width: qrSize + 4,
                height: qrSize + 4,
                color: rgb(1, 1, 1),
              });
              
              // Draw Payrexx QR on top
              firstPage.drawImage(qrImage, {
                x: qrX,
                y: qrY,
                width: qrSize,
                height: qrSize,
              });
              
              finalPdfBuffer = Buffer.from(await pdfDoc.save());
              console.log(`[GeneratePDF] ✓ Successfully overlaid Payrexx QR on page 1 payment slip`);
            } catch (qrErr) {
              console.error(`[GeneratePDF] ✗ Failed to overlay Payrexx QR:`, qrErr);
            }
          }

          // Create filename with patient name, invoice number, and timestamp for versioning
          const patientName = `${patientData.last_name}_${patientData.first_name}`.replace(/[^a-zA-Z0-9_-]/g, '_');
          const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19); // YYYY-MM-DDTHH-MM-SS
          const fileName = `Facture_${invoiceData.invoice_number}_${patientName}_${timestamp}.pdf`;
          const filePath = `${invoiceData.patient_id}/${fileName}`;
          const { error: uploadError } = await supabaseAdmin.storage.from("invoice-pdfs").upload(filePath, finalPdfBuffer, { contentType: "application/pdf", cacheControl: "3600" });
          if (!uploadError) {
            await supabaseAdmin.from("invoices").update({ pdf_path: filePath, pdf_generated_at: new Date().toISOString() }).eq("id", invoiceId);
            const { data: publicUrlData } = supabaseAdmin.storage.from("invoice-pdfs").getPublicUrl(filePath);
            return NextResponse.json({ 
              success: true, 
              pdfUrl: publicUrlData.publicUrl, 
              pdfPath: filePath, 
              qrCodeType: hasPayrexxLink ? "sumex1-payrexx" : "sumex1-unified", 
              sumex1Schema: sumexResult2.usedSchema 
            });
          }
        } else {
          console.error(`[GeneratePDF] Sumex1 unified failed: ${sumexResult2.error}`);
          
          // Check for server offline error
          if (sumexResult2.error === 'SUMEX_SERVER_OFFLINE') {
            return NextResponse.json({ 
              error: "Sumex1 server is offline", 
              details: "The invoice generation server is currently unavailable. Please contact your system administrator for support.",
              technicalDetails: "Connection timeout to Sumex server at 34.100.230.253:8080"
            }, { status: 503 });
          }
          
          return NextResponse.json({ 
            error: "Sumex1 PDF generation failed", 
            details: sumexResult2.error 
          }, { status: 500 });
        }
      } catch (sumex2Err: any) {
        console.error(`[GeneratePDF] Sumex1 unified error:`, sumex2Err);
        
        // Check for server offline error
        if (sumex2Err?.message === 'SUMEX_SERVER_OFFLINE') {
          return NextResponse.json({ 
            error: "Sumex1 server is offline", 
            details: "The invoice generation server is currently unavailable. Please contact your system administrator for support.",
            technicalDetails: "Connection timeout to Sumex server at 34.100.230.253:8080"
          }, { status: 503 });
        }
        
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
