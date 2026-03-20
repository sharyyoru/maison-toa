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
};

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();
    console.log("PDF generation request received for invoice ID:", invoiceId);

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
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, role")
        .eq("id", invoiceData.provider_id)
        .single();
      if (providerRow) billingEntityData = providerRow as ProviderData;
    }

    // Fetch medical staff (doctor/nurse) data from providers table
    let staffData: ProviderData | null = null;
    if (invoiceData.doctor_user_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, specialty, email, phone, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, role")
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

    // ── Detect insurance (Tiers Payant / Tiers Garant) invoice and generate specialized PDF ──
    // Only treat as insurance if there's an actual insurer OR payment method is Insurance
    const isInsuranceInvoice = !!invoiceData.insurer_id || invoiceData.payment_method === "Insurance";
    if (isInsuranceInvoice) {
      console.log(`[GeneratePDF] Insurance invoice detected (${invoiceData.billing_type || "TP"}) — using Sumex1 Print for PDF`);

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

      // Diagnosis codes from invoice
      const diagCodes: string[] = Array.isArray(invoiceData.diagnosis_codes)
        ? invoiceData.diagnosis_codes.map((d: any) => d.code || d).filter(Boolean)
        : [];
      const sumexDiagnoses: SumexDiagnosis[] = diagCodes.map(code => ({
        type: DiagnosisType.ICD,
        code: String(code),
      }));

      const sumexInput: SumexInvoiceInput = {
        language: 2,
        roleType: RoleType.Physician,
        placeType: PlaceType.Practice,
        requestType: RequestType.Invoice,
        requestSubtype: RequestSubtype.Normal,
        tiersMode: mapSumexTiers(invoiceData.billing_type || "TG"),
        vatNumber: "",
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
      };

      // Generate XML + PDF via Sumex1 server
      const sumexResult = await buildInvoiceRequest(sumexInput, { generatePdf: true });

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

      const fileName = `invoice-sumex-${invoiceData.invoice_number}-${Date.now()}.pdf`;
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

      await supabaseAdmin
        .from("invoices")
        .update({ pdf_path: filePath, pdf_generated_at: new Date().toISOString() })
        .eq("id", invoiceId);

      const { data: publicUrlData } = supabaseAdmin.storage
        .from("invoice-pdfs")
        .getPublicUrl(filePath);

      return NextResponse.json({
        success: true,
        pdfUrl: publicUrlData.publicUrl,
        pdfPath: filePath,
        qrCodeType: "sumex1",
        sumex1Schema: sumexResult.usedSchema,
      });
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
        return {
          tariffType: "999",
          code: item.code || "",
          referenceCode: "",
          quantity: item.quantity || 1,
          sessionNumber: 1,
          dateBegin: item.date_begin || treatmentDate,
          providerGln: svcGln,
          responsibleGln: svcGln,
          side: 0 as 0,
          serviceName: item.name || "",
          unit: item.unit_price || 0,
          unitFactor: 1,
          externalFactor: 1,
          amount: item.total_price || 0,
          vatRate: 0,
          ignoreValidate: YesNo.Yes,
        };
      });

      const sumexInput2: SumexInvoiceInput = {
        language: 2,
        roleType: RoleType.Physician,
        placeType: PlaceType.Practice,
        requestType: RequestType.Invoice,
        requestSubtype: RequestSubtype.Normal,
        tiersMode: mapSumexTiers("TG"),
        vatNumber: "",
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
      };

      try {
        const sumexResult2 = await buildInvoiceRequest(sumexInput2, { generatePdf: true });

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

          const fileName = `invoice-sumex-${invoiceData.invoice_number}-${Date.now()}.pdf`;
          const filePath = `${invoiceData.patient_id}/${fileName}`;
          const { error: uploadError } = await supabaseAdmin.storage.from("invoice-pdfs").upload(filePath, finalPdfBuffer, { contentType: "application/pdf", cacheControl: "3600", upsert: true });
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
