import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  generateStornoFromXMLSimple,
} from "@/lib/sumexInvoice";
import { uploadInvoiceXml } from "@/lib/medidataProxy";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      submissionId,
      reason = "Technical error - incorrect service data",
    } = body as {
      submissionId: string;
      reason?: string;
    };

    if (!submissionId) {
      return NextResponse.json(
        { error: "submissionId is required" },
        { status: 400 }
      );
    }

    // Get the original submission
    const { data: submission, error: subError } = await supabaseAdmin
      .from("medidata_submissions")
      .select("*")
      .eq("id", submissionId)
      .single();

    if (subError || !submission) {
      return NextResponse.json(
        { error: "Submission not found" },
        { status: 404 }
      );
    }

    // Check if already cancelled
    if (submission.status === "cancelled") {
      return NextResponse.json(
        { error: "Submission already cancelled" },
        { status: 400 }
      );
    }

    // Get the invoice
    const { data: invoice, error: invError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("invoice_number", submission.invoice_number)
      .single();

    if (invError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    console.log(`[CancelInvoice] Cancelling submission ${submissionId} for invoice ${submission.invoice_number}`);

    // Load the original XML to get all the details
    const originalXml = submission.xml_content;
    if (!originalXml) {
      return NextResponse.json(
        { error: "Original XML not found in submission" },
        { status: 400 }
      );
    }

    // Look up the current receiver_gln for this insurer. If the original
    // submission used a GLN that's no longer a valid MediData ELA participant
    // (UPLOAD:UNKNOWN-RECEIVER-ORGANIZATION), we rewrite <invoice:transport
    // to="…"> in the storno to route to the correct current receiver.
    let currentReceiverGln: string | null = null;
    if (submission.insurer_id) {
      const { data: insurerRow } = await supabaseAdmin
        .from("swiss_insurers")
        .select("gln, receiver_gln")
        .eq("id", submission.insurer_id)
        .single();
      if (insurerRow) {
        currentReceiverGln = insurerRow.receiver_gln || insurerRow.gln || null;
      }
    }

    // Generate Storno XML from the original (simple string replacement approach)
    console.log(`[CancelInvoice] Generating Storno XML from original (receiver override: ${currentReceiverGln || 'none'})`);
    const stornoResult = await generateStornoFromXMLSimple(originalXml, reason, {
      transportToGln: currentReceiverGln || undefined,
    });

    if (!stornoResult.success || !stornoResult.xmlContent) {
      console.error(`[CancelInvoice] Storno XML generation failed:`, stornoResult.error);
      return NextResponse.json(
        {
          error: "Storno XML generation failed",
          details: stornoResult.error,
        },
        { status: 500 }
      );
    }

    console.log(`[CancelInvoice] Storno XML generated successfully`);

    // Create cancellation submission record.
    // Link it to the original via parent_submission_id + is_storno so the
    // poll handler can flip the original to `cancelled` only once the storno
    // is actually accepted (not optimistically on upload).
    const { data: cancelSubmission, error: cancelError } = await supabaseAdmin
      .from("medidata_submissions")
      .insert({
        invoice_id: invoice.id,
        patient_id: submission.patient_id,
        insurer_id: submission.insurer_id,
        invoice_number: submission.invoice_number,
        invoice_date: submission.invoice_date,
        invoice_amount: submission.invoice_amount,
        billing_type: submission.billing_type,
        law_type: submission.law_type,
        xml_content: stornoResult.xmlContent,
        xml_version: submission.xml_version,
        status: 'draft',
        is_storno: true,
        parent_submission_id: submissionId,
        storno_reason: reason,
        created_by: null,
      })
      .select()
      .single();

    if (cancelError) {
      console.error("[CancelInvoice] Error creating cancellation submission:", cancelError);
      return NextResponse.json(
        { error: "Failed to create cancellation submission" },
        { status: 500 }
      );
    }

    // Record in history
    await supabaseAdmin.from("medidata_submission_history").insert({
      submission_id: cancelSubmission.id,
      previous_status: null,
      new_status: 'draft',
      changed_by: null,
      notes: `Storno created for original submission ${submissionId}`,
    });

    // Send to MediData
    const canTransmit = !!process.env.MEDIDATA_PROXY_API_KEY;
    let transmissionStatus = 'draft';
    let transmissionError: string | null = null;
    let transmissionRef: string | null = null;

    if (canTransmit) {
      try {
        console.log(`[CancelInvoice] Uploading Storno to MediData`);

        // Get sender GLN
        const { data: mdConfig } = await supabaseAdmin
          .from("medidata_config")
          .select("clinic_gln")
          .limit(1)
          .single();
        const senderGln = mdConfig?.clinic_gln || "";

        // Get receiver GLN from original submission
        const receiverGln = submission.insurance_gln || "";

        const uploadResult = await uploadInvoiceXml(
          stornoResult.xmlContent,
          `${submission.invoice_number}-STORNO.xml`,
          {
            source: "cancel-invoice",
            invoiceNumber: submission.invoice_number,
            senderGln,
            receiverGln,
            lawType: submission.law_type,
            billingType: submission.billing_type,
            isStorno: true,
          }
        );

        if (uploadResult.success) {
          transmissionStatus = 'pending';
          transmissionRef = uploadResult.transmissionReference;

          // Update cancellation submission
          await supabaseAdmin
            .from("medidata_submissions")
            .update({
              status: 'pending',
              medidata_message_id: uploadResult.transmissionReference,
              medidata_transmission_date: new Date().toISOString(),
              medidata_response_code: String(uploadResult.statusCode),
            })
            .eq("id", cancelSubmission.id);

          // NOTE: Do NOT flip the original submission to `cancelled` here.
          // The proxy returning 2xx only means the file was accepted for
          // further processing. MediData validates XSD asynchronously and may
          // reject the storno (e.g. UPLOAD:XML-NOT-VALID). The poll handler
          // will flip the original to `cancelled` only when this storno row
          // reaches `accepted`. Just record a history note on the original so
          // operators can see a storno is in flight.
          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: cancelSubmission.id,
            previous_status: 'draft',
            new_status: 'pending',
            response_code: String(uploadResult.statusCode),
            changed_by: null,
            notes: `Storno transmitted. Ref: ${uploadResult.transmissionReference || 'unknown'}`,
          });

          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: submissionId,
            previous_status: submission.status,
            new_status: submission.status, // unchanged — awaiting insurer confirmation
            changed_by: null,
            notes: `Storno submission ${cancelSubmission.id} transmitted to MediData (ref: ${uploadResult.transmissionReference || 'unknown'}). Awaiting insurer confirmation before marking as cancelled.`,
          });

          console.log(`[CancelInvoice] Storno transmitted successfully. Ref: ${uploadResult.transmissionReference}`);
        } else {
          transmissionError = uploadResult.errorMessage || `Transmission failed (${uploadResult.statusCode})`;
          console.error("[CancelInvoice] Storno transmission failed:", transmissionError);

          await supabaseAdmin.from("medidata_submission_history").insert({
            submission_id: cancelSubmission.id,
            previous_status: 'draft',
            new_status: 'draft',
            response_code: String(uploadResult.statusCode),
            changed_by: null,
            notes: `Transmission failed: ${transmissionError}`,
          });
        }
      } catch (error) {
        transmissionError = `Transmission error: ${error instanceof Error ? error.message : 'Unknown error'}`;
        console.error("[CancelInvoice] Transmission error:", error);

        await supabaseAdmin.from("medidata_submission_history").insert({
          submission_id: cancelSubmission.id,
          previous_status: 'draft',
          new_status: 'draft',
          changed_by: null,
          notes: transmissionError,
        });
      }
    } else {
      console.warn("[CancelInvoice] MEDIDATA_PROXY_API_KEY not set — skipping transmission");
    }

    return NextResponse.json({
      success: true,
      cancellation: {
        id: cancelSubmission.id,
        invoiceNumber: submission.invoice_number,
        originalSubmissionId: submissionId,
        status: transmissionStatus,
        messageId: transmissionRef,
        transmitted: transmissionStatus === 'pending',
        transmissionError,
      },
    });
  } catch (error) {
    console.error("Error in cancel-invoice:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
