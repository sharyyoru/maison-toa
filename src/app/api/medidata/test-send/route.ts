import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { uploadInvoiceXml } from "@/lib/medidataProxy";
import {
  buildInvoiceRequest,
  type SumexInvoiceInput,
  type InvoiceServiceInput as SumexServiceInput,
  RoleType,
  PlaceType,
  RequestType,
  RequestSubtype,
  LawType,
  TiersMode,
  EsrType,
  SexType,
  YesNo,
} from "@/lib/sumexInvoice";

const MEDIDATA_INTERMEDIATE_GLN = "7601001304307";
const SIMULATOR_GLN = "2099988876514";
// Per MediData: TG invoices must use this GLN as transport "To" (no transmission to insurance)
const TG_NO_TRANSMISSION_GLN = "2000000000008";

/**
 * POST /api/medidata/test-send
 * Send existing invoices to the MediData response simulator.
 *
 * Body:
 * - invoiceIds: string[] — UUIDs of invoices to send (required)
 * - simulatorFlag: string — e.g. "ClinicalDatasetMissing" (pending), "InvalidSchema" (rejected), "" (accepted)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const {
      invoiceIds,
      simulatorFlag = "",
    } = body as { invoiceIds?: string[]; simulatorFlag?: string };

    if (!invoiceIds || invoiceIds.length === 0) {
      return NextResponse.json(
        { error: "invoiceIds[] is required" },
        { status: 400 },
      );
    }

    // Get clinic config
    const { data: configData } = await supabaseAdmin
      .from("medidata_config")
      .select("*")
      .limit(1)
      .single();

    const config = configData || {
      clinic_gln: "7601003000115",
      clinic_zsr: "H123456",
      clinic_name: "Aesthetics Clinic XT SA",
      clinic_address_street: "chemin Rieu 18",
      clinic_address_postal_code: "1208",
      clinic_address_city: "Genève",
      clinic_canton: "GE",
    };

    const results: Array<{
      invoiceId: string;
      invoiceNumber: string;
      doctor: string;
      success: boolean;
      transmissionRef?: string | null;
      error?: string;
      submissionId?: string;
    }> = [];

    for (const invoiceId of invoiceIds) {
      try {
        // ── 1. Fetch the invoice ──
        const { data: inv, error: invErr } = await supabaseAdmin
          .from("invoices")
          .select("*")
          .eq("id", invoiceId)
          .single();

        if (invErr || !inv) {
          results.push({ invoiceId, invoiceNumber: "?", doctor: "?", success: false, error: `Invoice not found: ${invErr?.message}` });
          continue;
        }

        // Get patient
        const { data: patient } = await supabaseAdmin
          .from("patients")
          .select("first_name, last_name, dob, gender, street_address, postal_code, town, email, phone")
          .eq("id", inv.patient_id)
          .single();

        if (!patient) {
          results.push({ invoiceId, invoiceNumber: inv.invoice_number, doctor: inv.doctor_name || "?", success: false, error: "Patient not found" });
          continue;
        }

        // Set simulator as receiver if no insurance GLN
        const receiverGln = inv.insurance_gln || SIMULATOR_GLN;
        const insuranceName = inv.insurance_name || "Versicherung mit Antwortsimulator";

        // Update the invoice with simulator GLN if it was missing
        if (!inv.insurance_gln) {
          await supabaseAdmin.from("invoices").update({
            insurance_gln: SIMULATOR_GLN,
            insurance_name: "Versicherung mit Antwortsimulator",
          }).eq("id", invoiceId);
        }

        // ── 2. Fetch line items (or create a default one) ──
        let { data: lineItems } = await supabaseAdmin
          .from("invoice_line_items")
          .select("*")
          .eq("invoice_id", invoiceId)
          .order("sort_order");

        if (!lineItems || lineItems.length === 0) {
          // Create a default line item based on the invoice total
          const { data: newItem } = await supabaseAdmin.from("invoice_line_items").insert({
            invoice_id: invoiceId,
            sort_order: 1,
            code: "00.0010",
            name: "Konsultation, erste 5 Min.",
            quantity: 1,
            unit_price: inv.total_amount,
            total_price: inv.total_amount,
            tariff_code: 1,
            date_begin: inv.treatment_date || new Date().toISOString(),
            provider_gln: inv.doctor_gln || inv.provider_gln || config.clinic_gln,
            responsible_gln: inv.doctor_gln || inv.provider_gln || config.clinic_gln,
            billing_role: "both",
            session_number: 1,
            tp_al: inv.total_amount,
            tp_tl: 0,
            tp_al_value: 1,
            tp_tl_value: 1,
            price_al: inv.total_amount,
            price_tl: 0,
          }).select("*");
          lineItems = newItem || [];
        }

        // ── 3. Build Sumex1 XML ──
        const doctorGln = inv.doctor_gln || inv.provider_gln || config.clinic_gln;
        const doctorZsr = inv.doctor_zsr || inv.provider_zsr || config.clinic_zsr;
        const canton = inv.treatment_canton || config.clinic_canton || "GE";
        const invoiceDate = typeof inv.invoice_date === "string" ? inv.invoice_date.split("T")[0] : new Date().toISOString().split("T")[0];
        const treatmentDate = inv.treatment_date ? new Date(inv.treatment_date).toISOString().split("T")[0] : invoiceDate;
        const treatmentDateEnd = inv.treatment_date_end ? new Date(inv.treatment_date_end).toISOString().split("T")[0] : treatmentDate;

        const sumexServices: SumexServiceInput[] = lineItems.map((li: any, idx: number) => {
          // Use stored tariff_type, or derive from tariff_code (zero-padded to 3 digits)
          const tariffType = li.tariff_type || (li.tariff_code ? String(li.tariff_code).padStart(3, "0") : "999");
          // When tp_al is populated, use it with the real unitFactor.
          // When tp_al is 0, total_price already includes the factor → use unitFactor=1.
          const hasTpAl = Number(li.tp_al) > 0;
          const unit = hasTpAl ? Number(li.tp_al) : Number(li.total_price) || 0;
          const unitFactor = hasTpAl ? (Number(li.tp_al_value) || 1) : 1;
          const extFactor = Number(li.external_factor_mt) || 1;
          const amount = Number(li.total_price) || 0;
          return {
            tariffType,
            code: li.code || li.tardoc_code || "00.0010",
            quantity: Number(li.quantity) || 1,
            sessionNumber: li.session_number || idx + 1,
            dateBegin: li.date_begin ? new Date(li.date_begin).toISOString().split("T")[0] : treatmentDate,
            providerGln: li.provider_gln || doctorGln,
            responsibleGln: li.responsible_gln || li.provider_gln || doctorGln,
            serviceName: li.name || "Service",
            unit,
            unitFactor,
            externalFactor: extFactor,
            amount,
            vatRate: 0,
            ignoreValidate: YesNo.Yes,
          };
        });

        const lawMap: Record<string, LawType> = { KVG: LawType.KVG, UVG: LawType.UVG, IVG: LawType.IVG, MVG: LawType.MVG, VVG: LawType.VVG };
        const lawType = lawMap[inv.health_insurance_law || "KVG"] ?? LawType.KVG;

        // Per MediData (Vladimir): TG invoices use GLN 2000000000008 as transport "To"
        // (indicates no direct transmission to insurance). The insurance GLN is still in the XML body.
        const requestedTG = inv.billing_type === "TG";
        if (requestedTG) {
          console.log(`[test-send] TG mode requested for ${inv.invoice_number} — using transport To=${TG_NO_TRANSMISSION_GLN}`);
        }
        const tiersMode = requestedTG ? TiersMode.Garant : TiersMode.Payant;
        const transportToGln = requestedTG ? TG_NO_TRANSMISSION_GLN : receiverGln;

        const diagnoses = Array.isArray(inv.diagnosis_codes) && inv.diagnosis_codes.length > 0
          ? inv.diagnosis_codes.map((d: any) => ({ type: d.type === "ICD" ? 0 : 3, code: d.code || "Z00.0" }))
          : [{ type: 0, code: "Z00.0" }];

        const patientSex = patient.gender === "male" ? SexType.Male : SexType.Female;

        const sumexInput: SumexInvoiceInput = {
          language: 2,
          roleType: RoleType.Physician,
          placeType: PlaceType.Practice,
          requestType: RequestType.Invoice,
          requestSubtype: RequestSubtype.Normal,
          tiersMode,
          invoiceId: inv.invoice_number,
          invoiceDate,
          reminderLevel: inv.reminder_level || 0,
          lawType,
          insuredId: inv.patient_card_number || "80756012345678901",
          esrType: EsrType.QR,
          iban: inv.provider_iban || "CH0930788000050249289",
          paymentPeriod: 30,
          billerGln: config.clinic_gln,
          billerZsr: config.clinic_zsr || undefined,
          billerAddress: {
            companyName: config.clinic_name,
            street: config.clinic_address_street || "",
            zip: config.clinic_address_postal_code || "",
            city: config.clinic_address_city || "",
            stateCode: canton,
          },
          providerGln: doctorGln,
          providerZsr: doctorZsr,
          providerAddress: {
            familyName: (inv.doctor_name || "").split(" ").slice(-1)[0] || config.clinic_name,
            givenName: (inv.doctor_name || "").split(" ").slice(0, -1).join(" "),
            street: config.clinic_address_street || "",
            zip: config.clinic_address_postal_code || "",
            city: config.clinic_address_city || "",
            stateCode: canton,
          },
          insuranceGln: receiverGln,
          insuranceAddress: {
            companyName: insuranceName,
            street: "Teststrasse 1",
            zip: "8001",
            city: "Zürich",
            stateCode: "ZH",
          },
          patientSex,
          patientBirthdate: patient.dob || "1990-01-01",
          patientSsn: inv.patient_ssn || "",
          patientAddress: {
            familyName: patient.last_name || "Unknown",
            givenName: patient.first_name || "",
            street: patient.street_address || "",
            zip: patient.postal_code || "",
            city: patient.town || "",
            stateCode: canton,
            email: patient.email || undefined,
            phone: patient.phone || undefined,
          },
          guarantorAddress: {
            familyName: patient.last_name || "Unknown",
            givenName: patient.first_name || "",
            street: patient.street_address || "",
            zip: patient.postal_code || "",
            city: patient.town || "",
            stateCode: canton,
            email: patient.email || undefined,
            phone: patient.phone || undefined,
          },
          treatmentCanton: canton,
          treatmentDateBegin: treatmentDate,
          treatmentDateEnd: treatmentDateEnd,
          ...(inv.accident_date ? { acid: inv.accident_date } : {}),
          ...(inv.medical_case_number ? { apid: inv.medical_case_number } : {}),
          diagnoses,
          services: sumexServices,
          transportFrom: config.clinic_gln,
          transportViaGln: MEDIDATA_INTERMEDIATE_GLN,
          transportTo: transportToGln,
          // Per MediData feedback: TP invoices must include print_copy_to_guarantor for patient copy
          printCopyToGuarantor: tiersMode === TiersMode.Payant ? YesNo.Yes : (inv.copy_to_guarantor ? YesNo.Yes : YesNo.No),
        };

        let xmlContent: string;
        let pdfContent: Buffer | null = null;
        try {
          const sumexResult = await buildInvoiceRequest(sumexInput, { generatePdf: true });
          if (!sumexResult.success || !sumexResult.xmlContent) {
            results.push({
              invoiceId, invoiceNumber: inv.invoice_number, doctor: inv.doctor_name || "?",
              success: false, error: `Sumex XML failed: ${sumexResult.error || sumexResult.abortInfo || "unknown"}`,
            });
            continue;
          }
          xmlContent = sumexResult.xmlContent;
          pdfContent = sumexResult.pdfContent || null;
        } catch (sumexErr) {
          results.push({
            invoiceId, invoiceNumber: inv.invoice_number, doctor: inv.doctor_name || "?",
            success: false, error: `Sumex server error: ${sumexErr instanceof Error ? sumexErr.message : String(sumexErr)}`,
          });
          continue;
        }

        // Store invoice PDF in Supabase storage
        let pdfPath: string | null = null;
        if (pdfContent) {
          const pdfFileName = `invoice-sumex-${inv.invoice_number}-${Date.now()}.pdf`;
          const storagePath = `${inv.patient_id}/${pdfFileName}`;
          const { error: pdfUploadErr } = await supabaseAdmin.storage
            .from("invoice-pdfs")
            .upload(storagePath, pdfContent, {
              contentType: "application/pdf",
              cacheControl: "3600",
              upsert: true,
            });
          if (!pdfUploadErr) {
            pdfPath = storagePath;
            // Update invoice with PDF path
            await supabaseAdmin.from("invoices").update({
              pdf_path: storagePath,
              pdf_generated_at: new Date().toISOString(),
            }).eq("id", invoiceId);
          } else {
            console.warn(`[test-send] PDF upload failed for ${inv.invoice_number}:`, pdfUploadErr.message);
          }
        }

        // Inject simulator flag comment
        if (simulatorFlag) {
          const declEnd = xmlContent.indexOf("?>");
          if (declEnd >= 0) {
            xmlContent =
              xmlContent.slice(0, declEnd + 2) +
              `\n<!-- invoiceresponsegenerator:${simulatorFlag} -->\n` +
              xmlContent.slice(declEnd + 2);
          }
        }

        // ── 4. Create medidata_submissions record ──
        const { data: submission, error: subErr } = await supabaseAdmin
          .from("medidata_submissions")
          .insert({
            invoice_id: invoiceId,
            patient_id: inv.patient_id,
            invoice_number: inv.invoice_number,
            invoice_date: invoiceDate,
            invoice_amount: inv.total_amount,
            billing_type: inv.billing_type || "TP",
            law_type: inv.health_insurance_law || "KVG",
            xml_content: xmlContent,
            xml_version: "5.00",
            status: "draft",
          })
          .select("id")
          .single();

        if (subErr || !submission) {
          results.push({
            invoiceId, invoiceNumber: inv.invoice_number, doctor: inv.doctor_name || "?",
            success: false, error: `Failed to create submission: ${subErr?.message}`,
          });
          continue;
        }

        // Link back
        await supabaseAdmin.from("invoices").update({ medidata_submission_id: submission.id }).eq("id", invoiceId);
        await supabaseAdmin.from("medidata_submission_history").insert({ submission_id: submission.id, previous_status: null, new_status: "draft" });

        // ── 5. Upload to MediData ──
        const uploadResult = await uploadInvoiceXml(xmlContent, `${inv.invoice_number}.xml`, {
          source: "test-send",
          invoiceNumber: inv.invoice_number,
          senderGln: config.clinic_gln,
          receiverGln: transportToGln,
          doctorGln: doctorGln,
          doctorName: inv.doctor_name,
          simulatorFlag: simulatorFlag || "none (accepted)",
        });

        if (uploadResult.success) {
          await supabaseAdmin.from("medidata_submissions").update({
            status: "pending",
            medidata_message_id: uploadResult.transmissionReference,
            medidata_transmission_date: new Date().toISOString(),
            medidata_response_code: String(uploadResult.statusCode),
          }).eq("id", submission.id);

          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submission.id, previous_status: "draft", new_status: "pending",
            response_code: String(uploadResult.statusCode),
          });

          // ── 6. Send patient copy for TP invoices (LAMal Art. 42 para. 3) ──
          let patientCopyRef: string | null = null;
          if (tiersMode === TiersMode.Payant) {
            try {
              const copyInput: SumexInvoiceInput = {
                ...sumexInput,
                requestSubtype: RequestSubtype.Copy,
              };
              const copyResult = await buildInvoiceRequest(copyInput, { generatePdf: false });
              if (copyResult.success && copyResult.xmlContent) {
                let copyXml = copyResult.xmlContent;
                if (simulatorFlag) {
                  const declEnd = copyXml.indexOf("?>");
                  if (declEnd >= 0) {
                    copyXml = copyXml.slice(0, declEnd + 2) +
                      `\n<!-- invoiceresponsegenerator:${simulatorFlag} -->\n` +
                      copyXml.slice(declEnd + 2);
                  }
                }
                const copyUpload = await uploadInvoiceXml(copyXml, `${inv.invoice_number}-copy.xml`, {
                  source: "test-send-patient-copy",
                  invoiceNumber: inv.invoice_number,
                  senderGln: config.clinic_gln,
                  receiverGln: receiverGln,
                  requestSubtype: "copy",
                });
                if (copyUpload.success) {
                  patientCopyRef = copyUpload.transmissionReference;
                  console.log(`[test-send] Patient copy sent for ${inv.invoice_number}: ref=${patientCopyRef}`);
                } else {
                  console.warn(`[test-send] Patient copy upload failed for ${inv.invoice_number}: ${copyUpload.errorMessage}`);
                }
              } else {
                console.warn(`[test-send] Patient copy XML generation failed for ${inv.invoice_number}: ${copyResult.error}`);
              }
            } catch (copyErr) {
              console.warn(`[test-send] Patient copy error for ${inv.invoice_number}:`, copyErr);
            }
          }

          // Store patient copy ref in submission record
          if (patientCopyRef) {
            await supabaseAdmin.from("medidata_submissions").update({
              patient_copy_ref: patientCopyRef,
            }).eq("id", submission.id);
          }

          results.push({
            invoiceId, invoiceNumber: inv.invoice_number, doctor: inv.doctor_name || "?",
            success: true, transmissionRef: uploadResult.transmissionReference, submissionId: submission.id,
            ...(patientCopyRef ? { patientCopyRef } : {}),
          });
        } else {
          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submission.id, previous_status: "draft", new_status: "draft",
            response_code: String(uploadResult.statusCode),
          });
          const rawErr = uploadResult.rawResponse ? JSON.stringify(uploadResult.rawResponse).slice(0, 500) : "no raw";
          console.error(`[test-send] Upload failed for ${inv.invoice_number}: status=${uploadResult.statusCode}, msg=${uploadResult.errorMessage}, raw=${rawErr}`);
          results.push({
            invoiceId, invoiceNumber: inv.invoice_number, doctor: inv.doctor_name || "?",
            success: false, error: `${uploadResult.errorMessage || 'Upload failed'} (${uploadResult.statusCode}) ${rawErr}`,
            submissionId: submission.id,
          });
        }
      } catch (err) {
        results.push({
          invoiceId, invoiceNumber: "N/A", doctor: "?",
          success: false, error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      success: results.every((r) => r.success),
      results,
      simulatorGln: SIMULATOR_GLN,
      simulatorFlag: simulatorFlag || "none (will be accepted)",
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[test-send] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}
