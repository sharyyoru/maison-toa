import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { Invoice } from "@/lib/invoiceTypes";

/**
 * Public API endpoint to fetch invoice data by payment token
 * This bypasses RLS to allow anonymous access via magic link
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json(
        { error: "Payment token is required" },
        { status: 400 }
      );
    }

    // Fetch invoice using admin client to bypass RLS
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, patient_id, invoice_number, invoice_date, total_amount, payment_method, doctor_name, status, pdf_path, payment_link_expires_at, payrexx_payment_link, title, notes")
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

    // Fetch patient data
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, email, phone")
      .eq("id", invoice.patient_id)
      .single();

    if (patientError) {
      console.error("Error fetching patient:", patientError);
    }

    // Fetch line items so the payment page can show a service breakdown
    const { data: lineItems } = await supabaseAdmin
      .from("invoice_line_items")
      .select("name, quantity, unit_price, total_price")
      .eq("invoice_id", invoice.id)
      .order("sort_order", { ascending: true });

    // Derive a clean service label: prefer the line-item name, fall back to
    // stripping the "Acompte 50% – " prefix from the invoice title, then notes.
    let serviceLabel: string | null = null;
    if (lineItems && lineItems.length > 0) {
      serviceLabel = lineItems[0].name ?? null;
    } else if (invoice.title) {
      serviceLabel = invoice.title
        .replace(/^Acompte\s*(?:50%\s*)?[–-]\s*/i, "")
        .trim() || null;
    } else if (invoice.notes) {
      serviceLabel = invoice.notes
        .replace(/^Service\s*(?:réservé en ligne)?\s*:\s*/i, "")
        .trim() || null;
    }

    // Return only necessary data for payment page
    return NextResponse.json({
      invoice: {
        id: invoice.id,
        invoice_number: invoice.invoice_number,
        invoice_date: invoice.invoice_date,
        total_amount: invoice.total_amount,
        payment_method: invoice.payment_method,
        doctor_name: invoice.doctor_name,
        status: invoice.status,
        pdf_path: invoice.pdf_path,
        payment_link_expires_at: invoice.payment_link_expires_at,
        payrexx_payment_link: invoice.payrexx_payment_link,
        title: invoice.title,
        notes: invoice.notes,
        service_label: serviceLabel,
        line_items: lineItems ?? [],
      },
      patient: patient ? {
        first_name: patient.first_name,
        last_name: patient.last_name,
        email: patient.email,
        phone: patient.phone,
      } : null,
    });
  } catch (error) {
    console.error("Error fetching invoice by token:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
