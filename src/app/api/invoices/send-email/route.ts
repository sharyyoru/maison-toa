import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";

// Map documentType to the corresponding pdf_path column
const DOC_TYPE_COLUMN: Record<string, string> = {
  tg: "pdf_path_tg",
  tp: "pdf_path_tp",
  reminder: "pdf_path_reminder",
  receipt: "pdf_path_receipt",
};

export async function POST(request: NextRequest) {
  try {
    const { invoiceId, recipientEmail, documentType } = (await request.json()) as {
      invoiceId?: string;
      recipientEmail?: string;
      /** Optional: "tg" | "tp" | "reminder" | "receipt". Falls back to pdf_path when omitted. */
      documentType?: string;
    };

    if (!invoiceId || !recipientEmail) {
      return NextResponse.json(
        { error: "Missing invoiceId or recipientEmail" },
        { status: 400 },
      );
    }

    // Fetch invoice — always pull all typed pdf_path columns
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_amount, status, patient_id, pdf_path, pdf_path_tg, pdf_path_tp, pdf_path_reminder, pdf_path_receipt, provider_name")
      .eq("id", invoiceId)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Resolve which PDF path to use
    const pdfPathToUse: string | null = documentType && DOC_TYPE_COLUMN[documentType]
      ? (invoice as Record<string, string | null>)[DOC_TYPE_COLUMN[documentType]] ?? invoice.pdf_path
      : invoice.pdf_path;

    if (!pdfPathToUse) {
      return NextResponse.json(
        { error: "Invoice PDF not generated yet. Please generate it first." },
        { status: 400 },
      );
    }

    // Fetch patient name
    let patientName = "Patient";
    if (invoice.patient_id) {
      const { data: patient } = await supabaseAdmin
        .from("patients")
        .select("first_name, last_name")
        .eq("id", invoice.patient_id)
        .single();
      if (patient) {
        patientName = [patient.first_name, patient.last_name].filter(Boolean).join(" ") || "Patient";
      }
    }

    // Download PDF from storage
    const { data: pdfBlob, error: dlErr } = await supabaseAdmin.storage
      .from("invoice-pdfs")
      .download(pdfPathToUse);

    if (dlErr || !pdfBlob) {
      return NextResponse.json(
        { error: "Failed to download invoice PDF" },
        { status: 500 },
      );
    }

    // Build email content
    const providerName = invoice.provider_name || "Maison TOA";
    const isPaid = invoice.status === "PAID" || invoice.status === "OVERPAID";
    const isPartial = invoice.status === "PARTIAL_PAID" || invoice.status === "PARTIAL_LOSS";
    const totalAmt = Number(invoice.total_amount) || 0;
    const paidAmt = Number(invoice.paid_amount) || 0;

    const isReminder = documentType === "reminder";
    const isReceipt = documentType === "receipt" || isPaid;
    let subject = `Invoice ${invoice.invoice_number} — ${providerName}`;
    if (isReceipt) subject = `Receipt ${invoice.invoice_number} — ${providerName}`;
    else if (isReminder) subject = `Payment Reminder — Invoice ${invoice.invoice_number} — ${providerName}`;
    else if (isPartial) subject = `Invoice ${invoice.invoice_number} (Partial Payment) — ${providerName}`;

    const docLabel = isReceipt ? "Payment Receipt" : isReminder ? "Payment Reminder" : "Invoice";
    const bodyHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #1e293b; font-size: 18px; margin-bottom: 16px;">${docLabel} ${invoice.invoice_number}</h2>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">Dear ${patientName},</p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">
          ${isReceipt
            ? `Please find attached the receipt for your fully paid invoice of <strong>CHF ${totalAmt.toFixed(2)}</strong>.`
            : isReminder
              ? `Please find attached a payment reminder for invoice <strong>${invoice.invoice_number}</strong> of <strong>CHF ${totalAmt.toFixed(2)}</strong>. Please arrange payment at your earliest convenience.`
              : isPartial
                ? `Please find attached your invoice. Amount paid so far: <strong>CHF ${paidAmt.toFixed(2)}</strong>. Remaining balance: <strong>CHF ${(totalAmt - paidAmt).toFixed(2)}</strong>.`
                : `Please find attached your invoice for <strong>CHF ${totalAmt.toFixed(2)}</strong>.`
          }
        </p>
        <p style="color: #475569; font-size: 14px; line-height: 1.6;">Thank you for your trust.</p>
        <p style="color: #94a3b8; font-size: 12px; margin-top: 24px;">Kind regards,<br/>${providerName}</p>
      </div>
    `;

    // Convert PDF blob to base64 for Resend attachment
    const pdfFilePrefix = isReceipt ? "receipt" : isReminder ? "reminder" : documentType === "tp" ? "invoice-tp" : "invoice";
    const pdfFileName = `${pdfFilePrefix}-${invoice.invoice_number}.pdf`;
    const pdfArrayBuffer = await pdfBlob.arrayBuffer();
    const pdfBase64 = Buffer.from(pdfArrayBuffer).toString("base64");

    // Send via Resend (the official Maison TOA sender)
    const result = await sendEmail({
      to: recipientEmail.trim(),
      subject,
      html: bodyHtml,
      attachments: [
        {
          filename: pdfFileName,
          content: pdfBase64,
          contentType: "application/pdf",
        },
      ],
    });

    if (!result.success) {
      console.error("[InvoiceSendEmail] Resend error:", result.error);
      return NextResponse.json(
        { error: "Failed to send email", details: result.error },
        { status: 500 },
      );
    }

    const nowIso = new Date().toISOString();
    const fromAddress = process.env.EMAIL_FROM_ADDRESS || "info@mail.maisontoa.com";

    // Log email to emails table for patient email history
    let emailId: string | null = null;
    try {
      const { data: insertedEmail } = await supabaseAdmin
        .from("emails")
        .insert({
          patient_id: invoice.patient_id,
          to_address: recipientEmail.trim(),
          from_address: fromAddress,
          subject,
          body: bodyHtml,
          direction: "outbound",
          status: "sent",
          sent_at: nowIso,
          message_id: result.messageId ?? null,
        })
        .select("id")
        .single();

      emailId = insertedEmail?.id || null;

      // Log the PDF attachment to email_attachments table
      if (emailId && pdfPathToUse) {
        try {
          await supabaseAdmin
            .from("email_attachments")
            .insert({
              email_id: emailId,
              file_name: pdfFileName,
              storage_path: `invoice-pdfs/${pdfPathToUse}`,
              mime_type: "application/pdf",
              file_size: pdfBlob.size,
            });
        } catch (attachErr) {
          console.error("[InvoiceSendEmail] Failed to log attachment:", attachErr);
          // Continue anyway
        }
      }
    } catch (emailLogErr) {
      console.error("[InvoiceSendEmail] Failed to log email:", emailLogErr);
      // Continue anyway — email was sent successfully
    }

    // Update email_sent_at timestamp on invoice
    try {
      await supabaseAdmin
        .from("invoices")
        .update({ email_sent_at: nowIso })
        .eq("id", invoiceId);
    } catch (updateErr) {
      console.error("[InvoiceSendEmail] Failed to update invoice timestamp:", updateErr);
      // Continue anyway — email was sent successfully
    }

    return NextResponse.json({
      success: true,
      sentTo: recipientEmail.trim(),
      messageId: result.messageId,
    });
  } catch (err) {
    console.error("[InvoiceSendEmail] Error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
