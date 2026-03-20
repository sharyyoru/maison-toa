import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateTardocServicesFromDuration,
  type BillingType,
  type SwissLawType,
} from "@/lib/medidata";
import {
  uploadInvoiceXml,
} from "@/lib/medidataProxy";
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

type ConsultationData = {
  id: string;
  patient_id: string;
  title: string;
  content: string | null;
  scheduled_at: string;
  invoice_total_amount: number | null;
  doctor_name: string | null;
};

type PatientData = {
  id: string;
  first_name: string;
  last_name: string;
  dob: string | null;
  gender: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  country?: string | null;
  avs_number?: string | null;
  email?: string | null;
  phone?: string | null;
};

type InsuranceData = {
  id: string;
  provider_name: string;
  card_number: string;
  insurance_type: string;
  gln: string | null;
  avs_number: string | null;
  policy_number: string | null;
  law_type: string | null;
  billing_type: string | null;
  case_number: string | null;
  insurer_id: string | null;
};

// MediData intermediate (clearing house) GLN — required in XML transport <via>
const MEDIDATA_INTERMEDIATE_GLN = "7601001304307";
// Per MediData: TG invoices must use this GLN as transport "To" (no transmission to insurance)
const TG_NO_TRANSMISSION_GLN = "2000000000008";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      invoiceId,
      consultationId, // legacy fallback
      patientId: bodyPatientId,
      billingType: bodyBillingType = 'TP',
      lawType: bodyLawType = 'KVG',
      reminderLevel = 0,
      diagnosisCodes = [],
      treatmentReason = 'disease',
      insurerGln,
      insurerName,
      policyNumber,
      avsNumber,
      caseNumber,
      accidentDate,
      durationMinutes,
      language,
    } = body as {
      invoiceId?: string;
      consultationId?: string;
      patientId?: string;
      billingType?: string;
      lawType?: string;
      reminderLevel?: number;
      diagnosisCodes?: string[];
      treatmentReason?: string;
      insurerGln?: string;
      insurerName?: string;
      policyNumber?: string;
      avsNumber?: string;
      caseNumber?: string;
      accidentDate?: string;
      durationMinutes?: number;
      language?: 1 | 2 | 3;
    };

    // ── Resolve the invoice (primary) or fall back to consultation ──
    let invoiceRecord: any = null;
    let consultationData: ConsultationData | null = null;
    let resolvedInvoiceId: string | null = invoiceId || null;

    if (invoiceId) {
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("id", invoiceId)
        .single();
      if (invErr || !inv) {
        return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
      }
      invoiceRecord = inv;
    } else if (consultationId) {
      // Legacy path: look up invoice by consultation_id, or fall back to consultation table
      const { data: inv } = await supabaseAdmin
        .from("invoices")
        .select("*")
        .eq("consultation_id", consultationId)
        .limit(1)
        .single();
      if (inv) {
        invoiceRecord = inv;
        resolvedInvoiceId = inv.id;
      } else {
        const { data: cons } = await supabaseAdmin
          .from("consultations")
          .select("*")
          .eq("id", consultationId)
          .eq("record_type", "invoice")
          .single();
        if (!cons) {
          return NextResponse.json({ error: "Invoice or consultation not found" }, { status: 404 });
        }
        consultationData = cons as unknown as ConsultationData;
      }
    } else {
      return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
    }

    const patientId = bodyPatientId
      || invoiceRecord?.patient_id
      || consultationData?.patient_id;

    // Derive billing fields from invoice record when available
    const billingType = bodyBillingType || invoiceRecord?.billing_type || 'TP';
    const lawType = bodyLawType || invoiceRecord?.health_insurance_law || 'KVG';

    // Get patient data
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("*")
      .eq("id", patientId)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    const patientData = patient as unknown as PatientData;

    // Get insurance data if available
    let insuranceData: InsuranceData | null = null;
    const { data: insurances } = await supabaseAdmin
      .from("patient_insurances")
      .select("*")
      .eq("patient_id", patientId)
      .limit(1);

    if (insurances && insurances.length > 0) {
      insuranceData = insurances[0] as unknown as InsuranceData;
    }

    // Get detailed Swiss insurer data if available
    let swissInsurer: {
      receiver_gln: string | null;
      tp_allowed: boolean | null;
      name: string | null;
      address_street: string | null;
      address_postal_code: string | null;
      address_city: string | null;
      address_canton: string | null;
    } | null = null;

    const resolvedInsurerId = invoiceRecord?.insurer_id || insuranceData?.insurer_id;
    if (resolvedInsurerId) {
      const { data } = await supabaseAdmin
        .from("swiss_insurers")
        .select("name, receiver_gln, tp_allowed, address_street, address_postal_code, address_city, address_canton")
        .eq("id", resolvedInsurerId)
        .single();

      if (data) swissInsurer = data;
    }

    // Fallback: look up swiss_insurers by GLN if no insurer_id resolved
    if (!swissInsurer) {
      const lookupGln = insurerGln || invoiceRecord?.insurance_gln || insuranceData?.gln;
      if (lookupGln) {
        const { data } = await supabaseAdmin
          .from("swiss_insurers")
          .select("name, receiver_gln, tp_allowed, address_street, address_postal_code, address_city, address_canton")
          .eq("gln", lookupGln)
          .limit(1)
          .single();

        if (data) swissInsurer = data;
      }
    }

    // Get sender GLN from medidata_config (only field needed from config)
    const { data: mdConfig } = await supabaseAdmin
      .from("medidata_config")
      .select("clinic_gln")
      .limit(1)
      .single();
    const senderGln = mdConfig?.clinic_gln || "";

    // ── Fetch billing entity (provider) from providers table ──
    let billingEntity: Record<string, any> | null = null;
    if (invoiceRecord?.provider_id) {
      const { data: provRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, phone, vatuid")
        .eq("id", invoiceRecord.provider_id)
        .single();
      if (provRow) billingEntity = provRow;
    }

    // ── Fetch staff/doctor provider if different ──
    let staffEntity: Record<string, any> | null = null;
    if (invoiceRecord?.doctor_user_id && invoiceRecord.doctor_user_id !== invoiceRecord.provider_id) {
      const { data: staffRow } = await supabaseAdmin
        .from("providers")
        .select("id, name, gln, zsr, street, street_no, zip_code, city, canton, salutation, title")
        .eq("id", invoiceRecord.doctor_user_id)
        .single();
      if (staffRow) staffEntity = staffRow;
    }

    // ── Resolve provider fields with fallbacks (same pattern as check-xml) ──
    const pickValidGln = (...candidates: (string | null | undefined)[]) => {
      for (const c of candidates) if (c && /^\d{13}$/.test(c)) return c;
      return "7601003000115"; // fallback
    };
    const provGln = pickValidGln(billingEntity?.gln, invoiceRecord?.provider_gln);
    const provZsr = billingEntity?.zsr || invoiceRecord?.provider_zsr || "";
    const provName = billingEntity?.name || invoiceRecord?.provider_name || "Aesthetics Clinic XT SA";
    const provStreet = billingEntity?.street
      ? `${billingEntity.street}${billingEntity.street_no ? " " + billingEntity.street_no : ""}`
      : "";
    const provZip = billingEntity?.zip_code || "";
    const provCity = billingEntity?.city || "";
    const provCanton = billingEntity?.canton || invoiceRecord?.treatment_canton || "GE";
    const provIban = billingEntity?.iban || invoiceRecord?.provider_iban || "CH0930788000050249289";

    // Derive invoice metadata
    const invoiceNumber = invoiceRecord?.invoice_number || `INV-${Date.now().toString(36).toUpperCase()}`;
    const invoiceDate = invoiceRecord?.invoice_date
      ? String(invoiceRecord.invoice_date).split('T')[0]
      : new Date().toISOString().split('T')[0];
    const dueDate = invoiceRecord?.due_date
      ? String(invoiceRecord.due_date).split('T')[0]
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const treatmentDate = invoiceRecord?.treatment_date
      ? new Date(invoiceRecord.treatment_date).toISOString().split('T')[0]
      : consultationData?.scheduled_at?.split('T')[0]
        || new Date().toISOString().split('T')[0];

    // Load line items
    let services: import("@/lib/medidata").InvoiceServiceLine[] = [];
    const lineItemLookupId = resolvedInvoiceId || consultationId;
    const { data: dbLineItems } = await supabaseAdmin
      .from("invoice_line_items")
      .select("code, name, quantity, unit_price, total_price, tariff_code, tariff_type, external_factor_mt, side_type, session_number, ref_code, date_begin, provider_gln, responsible_gln, catalog_name")
      .eq("invoice_id", lineItemLookupId)
      .order("sort_order", { ascending: true });

    if (dbLineItems && dbLineItems.length > 0) {
      // Map actual line items to InvoiceServiceLine for XML generation
      services = dbLineItems.map((item: any) => {
        // Use stored tariff_type, or derive from tariff_code (zero-padded to 3 digits)
        const tariffType = item.tariff_type || (item.tariff_code ? String(item.tariff_code).padStart(3, "0") : "999");
        return {
          code: item.code || "",
          tariffType,
          description: item.name || "",
          quantity: item.quantity || 1,
          unitPrice: item.unit_price || 0,
          total: item.total_price || 0,
          date: item.date_begin || treatmentDate,
          providerId: item.provider_gln || provGln,
          providerGln: item.provider_gln || provGln,
          // ACF/TARDOC-specific fields
          externalFactor: (item.tariff_code === 5 || item.tariff_code === 7) ? (item.external_factor_mt ?? 1) : undefined,
          sideType: item.tariff_code === 5 ? (item.side_type ?? 0) : undefined,
          sessionNumber: item.session_number ?? 1,
          refCode: item.ref_code || undefined,
        };
      });
    } else {
      // Fallback: generate TARDOC services from duration (backward compatibility)
      const duration = durationMinutes || extractDurationFromContent(consultationData?.content || null);
      services = generateTardocServicesFromDuration(
        duration,
        treatmentDate,
        provGln
      );
    }

    // Calculate totals
    const subtotal = services.reduce((sum, s) => sum + s.total, 0);
    const total = invoiceRecord?.total_amount || consultationData?.invoice_total_amount || subtotal;
    const resolvedInsurerGln = insurerGln || invoiceRecord?.insurance_gln || insuranceData?.gln || '7601003000016';
    const resolvedReceiverGln = swissInsurer?.receiver_gln || resolvedInsurerGln;
    const resolvedInsurerName = insurerName || invoiceRecord?.insurance_name || insuranceData?.provider_name || 'Unknown Insurer';

    // Build Sumex1 input — Sumex1 server is the ONLY XML generation path
    const sumexServices: SumexServiceInput[] = services.map(s => ({
      tariffType: s.tariffType || "999",
      code: s.code,
      referenceCode: s.refCode || "",
      quantity: s.quantity,
      sessionNumber: s.sessionNumber ?? 1,
      dateBegin: s.date,
      providerGln: s.providerGln || provGln,
      responsibleGln: s.providerGln || provGln,
      side: (s.sideType as 0 | 1 | 2 | 3) ?? 0,
      serviceName: s.description || "",
      unit: s.unitPrice || 0,
      unitFactor: 1,
      externalFactor: s.externalFactor ?? 1,
      amount: s.total || 0,
      vatRate: 0,
      ignoreValidate: YesNo.Yes,
    }));

    const sumexDiagnoses: SumexDiagnosis[] = (diagnosisCodes || []).map((code: string) => ({
      type: DiagnosisType.ICD,
      code,
    }));

    const canton = provCanton;
    // Detect non-Swiss patient for address handling
    const patientCountry = patientData.country?.trim() || "";
    const isSwissPatient = !patientCountry || /^(ch|switzerland|suisse|schweiz|svizzera)$/i.test(patientCountry);
    // Map common country names to ISO 3166-1 alpha-2 codes
    const COUNTRY_NAME_TO_CODE: Record<string, string> = {
      france: "FR", frankreich: "FR", francia: "FR",
      germany: "DE", deutschland: "DE", allemagne: "DE", germania: "DE",
      italy: "IT", italien: "IT", italie: "IT", italia: "IT",
      austria: "AT", österreich: "AT", autriche: "AT",
      liechtenstein: "LI",
      spain: "ES", spanien: "ES", espagne: "ES", españa: "ES",
      portugal: "PT",
      belgium: "BE", belgien: "BE", belgique: "BE",
      netherlands: "NL", niederlande: "NL", "pays-bas": "NL",
      "united kingdom": "GB", uk: "GB", großbritannien: "GB", "royaume-uni": "GB",
      "united states": "US", usa: "US",
      luxembourg: "LU", luxemburg: "LU",
    };
    const resolveCountryCode = (c: string): string => {
      if (!c || isSwissPatient) return "";
      if (c.length === 2) return c.toUpperCase();
      return COUNTRY_NAME_TO_CODE[c.toLowerCase()] || "";
    };
    const patientCountryCode = resolveCountryCode(patientCountry);
    const patientCountryName = isSwissPatient ? "" : patientCountry;

    console.log(`[SendInvoice] Building Sumex1 invoice: id=${invoiceNumber}, patient=${patientData.first_name} ${patientData.last_name}, services=${services.length}, total=${total}, country="${patientCountry}", isSwiss=${isSwissPatient}, countryCode="${patientCountryCode}", countryName="${patientCountryName}"`);

    // For non-Swiss patients without SSN, use the unknownSSN per Sumex CHM docs
    const patientSsn = avsNumber || insuranceData?.avs_number || (!isSwissPatient ? "7569999999991" : "");

    const sumexInput: SumexInvoiceInput = {
      language: language || 2,
      roleType: RoleType.Physician,
      placeType: PlaceType.Practice,
      requestType: RequestType.Invoice,
      requestSubtype: RequestSubtype.Normal,
      tiersMode: mapSumexTiers(billingType),
      vatNumber: billingEntity?.vatuid || "",
      invoiceId: invoiceNumber,
      invoiceDate,
      reminderLevel: reminderLevel || 0,
      lawType: mapSumexLaw(lawType),
      insuredId: insuranceData?.card_number || "",
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
        stateCode: canton,
      },
      providerGln: pickValidGln(staffEntity?.gln, invoiceRecord?.doctor_gln, provGln),
      providerZsr: staffEntity?.zsr || invoiceRecord?.doctor_zsr || provZsr || undefined,
      providerAddress: {
        familyName: staffEntity?.name || invoiceRecord?.doctor_name || consultationData?.doctor_name || provName,
        givenName: "",
        salutation: staffEntity?.salutation || billingEntity?.salutation || "",
        title: staffEntity?.title || billingEntity?.title || "",
        street: staffEntity?.street ? `${staffEntity.street}${staffEntity.street_no ? " " + staffEntity.street_no : ""}` : provStreet,
        zip: staffEntity?.zip_code || provZip,
        city: staffEntity?.city || provCity,
        stateCode: staffEntity?.canton || canton,
      },
      insuranceGln: resolvedInsurerGln,
      insuranceAddress: resolvedInsurerGln ? {
        companyName: swissInsurer?.name || resolvedInsurerName,
        street: swissInsurer?.address_street || "N/A",
        zip: swissInsurer?.address_postal_code || "0000",
        city: swissInsurer?.address_city || "N/A",
        stateCode: swissInsurer?.address_canton || canton,
      } : undefined,
      patientSex: mapSumexSex(patientData.gender || "male"),
      patientBirthdate: patientData.dob || "1990-01-01",
      patientSsn,
      patientAddress: {
        familyName: patientData.last_name,
        givenName: patientData.first_name,
        street: patientData.street_address || "",
        zip: patientData.postal_code || "",
        city: patientData.town || "",
        stateCode: isSwissPatient ? canton : "",
        country: patientCountryName || undefined,
        countryCode: patientCountryCode || undefined,
        email: patientData.email || undefined,
        phone: patientData.phone || undefined,
      },
      guarantorAddress: {
        familyName: patientData.last_name,
        givenName: patientData.first_name,
        street: patientData.street_address || "",
        zip: patientData.postal_code || "",
        city: patientData.town || "",
        stateCode: isSwissPatient ? canton : "",
        country: patientCountryName || undefined,
        countryCode: patientCountryCode || undefined,
        email: patientData.email || undefined,
        phone: patientData.phone || undefined,
      },
      treatmentCanton: canton,
      treatmentDateBegin: treatmentDate,
      treatmentDateEnd: treatmentDate,
      ...(accidentDate ? { acid: accidentDate } : {}),
      ...(caseNumber ? { apid: caseNumber } : {}),
      diagnoses: sumexDiagnoses,
      services: sumexServices,
      transportFrom: senderGln || provGln,
      transportViaGln: MEDIDATA_INTERMEDIATE_GLN,
      // Per MediData (Vladimir): TG uses GLN 2000000000008 (no direct transmission to insurance)
      transportTo: billingType === 'TG' ? TG_NO_TRANSMISSION_GLN : resolvedReceiverGln,
      // Per MediData feedback: TP invoices must include print_copy_to_guarantor for patient copy
      printCopyToGuarantor: billingType === 'TP' ? YesNo.Yes : (invoiceRecord?.copy_to_guarantor ? YesNo.Yes : YesNo.No),
    };

    // Generate XML + PDF via Sumex1 server (no fallback — this is the only path)
    const sumexResult = await buildInvoiceRequest(sumexInput, { generatePdf: true });

    if (!sumexResult.success || !sumexResult.xmlContent) {
      console.error(`[SendInvoice] Sumex1 XML generation FAILED for ${invoiceNumber}: error=${sumexResult.error}, abort=${sumexResult.abortInfo}, validErr=${sumexResult.validationError}`);
      return NextResponse.json(
        {
          error: "Sumex1 XML generation failed",
          details: sumexResult.error,
          abortInfo: sumexResult.abortInfo,
          validationError: sumexResult.validationError,
        },
        { status: 500 }
      );
    }

    const xmlContent = sumexResult.xmlContent;
    console.log(`[SendInvoice] Sumex1 XML generated: schema=${sumexResult.usedSchema}, validErr=${sumexResult.validationError}, pdfSize=${sumexResult.pdfContent?.length ?? 0}`);

    // Upload PDF to Supabase storage if generated
    let pdfStoragePath: string | null = null;
    if (sumexResult.pdfContent) {
      const pdfFileName = `invoice-sumex-${invoiceNumber}-${Date.now()}.pdf`;
      const pdfPath = `${patientData.id}/${pdfFileName}`;
      const { error: pdfUploadErr } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .upload(pdfPath, sumexResult.pdfContent, {
          contentType: "application/pdf",
          cacheControl: "3600",
          upsert: true,
        });
      if (pdfUploadErr) {
        console.warn(`[SendInvoice] PDF upload to storage failed: ${pdfUploadErr.message}`);
      } else {
        pdfStoragePath = pdfPath;
        console.log(`[SendInvoice] PDF uploaded to storage: ${pdfPath}`);
      }
    }

    // Create submission record
    const { data: submission, error: submissionError } = await supabaseAdmin
      .from("medidata_submissions")
      .insert({
        invoice_id: resolvedInvoiceId,
        patient_id: patientData.id,
        insurer_id: insuranceData?.insurer_id || null,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        invoice_amount: total,
        billing_type: billingType,
        law_type: lawType,
        xml_content: xmlContent,
        xml_version: '5.00',
        status: 'draft',
        created_by: null,
      })
      .select()
      .single();

    if (submissionError) {
      console.error("Error creating submission:", submissionError);
      return NextResponse.json(
        { error: "Failed to create invoice submission" },
        { status: 500 }
      );
    }

    // Record initial status in history
    await supabaseAdmin.from("medidata_submission_history").insert({
      submission_id: submission.id,
      previous_status: null,
      new_status: 'draft',
      changed_by: null,
    });

    // Send XML to MediData via proxy
    let medidataTransmissionStatus = 'draft';
    let medidataTransmissionError: string | null = null;
    let medidataTransmissionRef: string | null = null;

    const canTransmit = !!process.env.MEDIDATA_PROXY_API_KEY;

    if (canTransmit) {
      try {
        console.log(`[SendInvoice] Uploading to MediData proxy: invoice=${invoiceNumber}`);

        const uploadReceiverGln = billingType === 'TG' ? TG_NO_TRANSMISSION_GLN : resolvedReceiverGln;
        const uploadResult = await uploadInvoiceXml(
          xmlContent,
          `${invoiceNumber}.xml`,
          {
            source: "aestheticclinic",
            invoiceNumber,
            senderGln: senderGln || provGln,
            receiverGln: uploadReceiverGln,
            lawType,
            billingType,
          },
        );

        if (uploadResult.success) {
          medidataTransmissionStatus = 'pending';
          medidataTransmissionRef = uploadResult.transmissionReference;

          // Update submission with transmission details
          await supabaseAdmin
            .from("medidata_submissions")
            .update({
              status: 'pending',
              medidata_message_id: uploadResult.transmissionReference,
              medidata_transmission_date: new Date().toISOString(),
              medidata_response_code: String(uploadResult.statusCode),
            })
            .eq("id", submission.id);

          // Record status change
          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submission.id,
            previous_status: 'draft',
            new_status: 'pending',
            response_code: String(uploadResult.statusCode),
            changed_by: null,
            notes: `Transmitted via proxy. Ref: ${uploadResult.transmissionReference || 'unknown'}`,
          });

          console.log(`[SendInvoice] Invoice ${invoiceNumber} transmitted. Ref: ${uploadResult.transmissionReference}`);

          // ── Send patient copy for TP invoices (LAMal Art. 42 para. 3) ──
          if (billingType === "TP") {
            try {
              const copyInput: SumexInvoiceInput = {
                ...sumexInput,
                requestSubtype: RequestSubtype.Copy,
              };
              const copyResult = await buildInvoiceRequest(copyInput, { generatePdf: false });
              if (copyResult.success && copyResult.xmlContent) {
                const copyUpload = await uploadInvoiceXml(copyResult.xmlContent, `${invoiceNumber}-copy.xml`, {
                  source: "send-invoice-patient-copy",
                  invoiceNumber,
                  senderGln: senderGln || provGln,
                  receiverGln: resolvedReceiverGln,
                  requestSubtype: "copy",
                });
                if (copyUpload.success) {
                  console.log(`[SendInvoice] Patient copy sent for ${invoiceNumber}: ref=${copyUpload.transmissionReference}`);
                } else {
                  console.warn(`[SendInvoice] Patient copy upload failed for ${invoiceNumber}: ${copyUpload.errorMessage}`);
                }
              } else {
                console.warn(`[SendInvoice] Patient copy XML failed for ${invoiceNumber}: ${copyResult.error}`);
              }
            } catch (copyErr) {
              console.warn(`[SendInvoice] Patient copy error for ${invoiceNumber}:`, copyErr);
            }
          }
        } else {
          medidataTransmissionError = uploadResult.errorMessage || `Proxy upload failed (${uploadResult.statusCode})`;
          console.error("[SendInvoice] Proxy transmission failed:", medidataTransmissionError, uploadResult.rawResponse);

          // Record the error in history
          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submission.id,
            previous_status: 'draft',
            new_status: 'draft',
            response_code: String(uploadResult.statusCode),
            changed_by: null,
            notes: `Transmission failed: ${medidataTransmissionError}`,
          });
        }
      } catch (error) {
        medidataTransmissionError = `Proxy error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("[SendInvoice] Proxy transmission error:", error);

        // Record the error in history
        await supabaseAdmin.from("medidata_submission_history").insert({
          submission_id: submission.id,
          previous_status: 'draft',
          new_status: 'draft',
          changed_by: null,
          notes: `Proxy error: ${medidataTransmissionError}`,
        });
      }
    } else {
      console.warn("[SendInvoice] MEDIDATA_PROXY_API_KEY not set — skipping transmission");
    }

    return NextResponse.json({
      success: true,
      submission: {
        id: submission.id,
        invoiceNumber,
        status: medidataTransmissionStatus,
        messageId: medidataTransmissionRef,
        xmlGenerated: true,
        xmlVersion: '5.00',
        sumex1Schema: sumexResult.usedSchema,
        pdfGenerated: !!pdfStoragePath,
        pdfStoragePath,
        transmitted: medidataTransmissionStatus === 'pending',
        transmissionError: medidataTransmissionError,
        total,
        services: services.map(s => ({
          code: s.code,
          description: s.description,
          quantity: s.quantity,
          total: s.total,
        })),
      },
    });
  } catch (error) {
    console.error("Error in MediData send-invoice:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

// Helper to extract duration from content
function extractDurationFromContent(content: string | null): number {
  if (!content) return 15; // Default 15 minutes

  const durationMatch = content.match(/Duration[:\s]*(\d+)\s*min/i) ||
    content.match(/Durée[:\s]*(\d+)\s*min/i) ||
    content.match(/(\d+)\s*minutes?/i);

  return durationMatch ? parseInt(durationMatch[1]) : 15;
}
