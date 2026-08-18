import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import { generateInvoiceEmailContent } from "@/lib/invoiceEmailContent";

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
    const { subject, html: bodyHtml, pdfFilePrefix } = generateInvoiceEmailContent({
      invoiceNumber: invoice.invoice_number,
      providerName,
      patientName,
      documentType,
      status: invoice.status,
      totalAmount: Number(invoice.total_amount) || 0,
      paidAmount: Number(invoice.paid_amount) || 0,
    });

    // Convert PDF blob to base64 for Resend attachment
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
