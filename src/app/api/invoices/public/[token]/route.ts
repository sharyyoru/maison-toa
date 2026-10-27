import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type PatientData = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
};

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    if (!token) {
      return NextResponse.json(
        { error: "Invalid payment link" },
        { status: 400 }
      );
    }

    // Fetch invoice by payment token using admin client (bypasses RLS)
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, patient_id, invoice_date, total_amount, payment_method, doctor_name, status, pdf_path, payment_link_expires_at, payrexx_payment_link")
      .eq("payment_link_token", token)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found or link has expired" },
        { status: 404 }
      );
    }

    // Check if payment link has expired
    if (invoice.payment_link_expires_at) {
      const expiresAt = new Date(invoice.payment_link_expires_at);
      if (expiresAt < new Date()) {
        return NextResponse.json(
          { error: "This payment link has expired" },
          { status: 410 }
        );
      }
    }

    // Fetch patient information
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, email, phone")
      .eq("id", invoice.patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    // Signed URL, not a public one.
    //
    // `invoice-pdfs` is a private bucket: an invoice PDF carries the patient's
    // name, the amount and the billed services, so it must not be reachable at
    // a guessable public path. getPublicUrl() still returns a nicely-formed URL
    // for a private bucket, but fetching it fails with "Bucket not found",
    // which is why the download button silently stopped working.
    //
    // The payment token has already been validated above, so issuing a
    // short-lived signed URL here is the authorisation boundary. Done with the
    // service role, so no storage policy is needed and the bucket stays shut.
    let pdfPublicUrl: string | null = null;
    if (invoice.pdf_path) {
      const { data: urlData, error: signErr } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .createSignedUrl(invoice.pdf_path, 60 * 60); // 1 hour
      if (signErr) {
        console.error("[invoices/public] failed to sign PDF URL:", signErr.message);
      }
      pdfPublicUrl = urlData?.signedUrl || null;
    }

    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        total_amount: invoice.total_amount,
        payment_method: invoice.payment_method,
        doctor_name: invoice.doctor_name,
        is_paid: invoice.status === "PAID" || invoice.status === "OVERPAID",
        status: invoice.status,
        pdf_url: pdfPublicUrl,
        payrexx_payment_link: invoice.payrexx_payment_link,
      },
      patient: patient as PatientData,
    });
  } catch (error) {
    console.error("Error fetching public invoice:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
