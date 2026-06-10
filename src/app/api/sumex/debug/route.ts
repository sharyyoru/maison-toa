import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { buildInvoiceRequest, RoleType, TiersMode, LawType } from "@/lib/sumexInvoice";
import type { Invoice, InvoiceLineItem } from "@/lib/invoiceTypes";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestUrl = process.env.SUMEX_INVOICE_REQUEST_URL;
  const effectiveUrl = requestUrl || "http://34.100.230.253:8080/generalInvoiceRequestManagerServer500";
  let reachable = false;
  let reachableError = "";
  try {
    const r = await fetch(`${effectiveUrl}/IGeneralInvoiceRequestManager/GetCreateGeneralInvoiceRequestManager`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    reachable = r.ok;
    reachableError = r.ok ? "" : `HTTP ${r.status}`;
  } catch (e: any) {
    reachableError = e.message;
  }

  return NextResponse.json({
    env: {
      SUMEX_INVOICE_REQUEST_URL: requestUrl ?? "(not set)",
      SUMEX_INVOICE_RESPONSE_URL: process.env.SUMEX_INVOICE_RESPONSE_URL ?? "(not set)",
      SUMEX_ACF_URL: process.env.SUMEX_ACF_URL ?? "(not set)",
      SUMEX_ACF_BASE_URL: process.env.SUMEX_ACF_BASE_URL ?? "(not set)",
      SUMEX_TARDOC_URL: process.env.SUMEX_TARDOC_URL ?? "(not set)",
    },
    effectiveRequestUrl: effectiveUrl,
    reachable,
    reachableError,
  });
}

// POST /api/sumex/debug?invoiceId=xxx — dumps full sumexInput for an invoice
export async function POST(request: NextRequest) {
  const { invoiceId } = await request.json();
  if (!invoiceId) return NextResponse.json({ error: "invoiceId required" }, { status: 400 });

  const { data: invoice, error: invoiceError } = await supabaseAdmin
    .from("invoices").select("*").eq("id", invoiceId).single();
  if (invoiceError || !invoice) return NextResponse.json({ error: "Invoice not found", invoiceError }, { status: 404 });

  const { data: lineItems } = await supabaseAdmin
    .from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order", { ascending: true });

  const { data: patient } = await supabaseAdmin
    .from("patients").select("first_name, last_name, dob, street_address, postal_code, town, gender, email, phone")
    .eq("id", invoice.patient_id).single();

  const { data: provider } = await supabaseAdmin
    .from("providers").select("id, name, specialty, gln, zsr, street, street_no, zip_code, city, canton, iban, salutation, title, role, qual_dignities")
    .eq("id", invoice.provider_id).single();

  // Build a minimal sumexInput to check what values come through
  const sumexInput = {
    roleType: RoleType.Physician,
    invoiceId: invoice.invoice_number?.toString() || invoice.id,
    invoiceDate: invoice.invoice_date || new Date().toISOString().split("T")[0],
    tiersMode: TiersMode.Payant,
    lawType: LawType.KVG,
    providerGln: provider?.gln || "(missing)",
    providerZsr: provider?.zsr || "(missing)",
    providerIban: provider?.iban || "(missing)",
    patientName: `${patient?.first_name} ${patient?.last_name}`,
    invoiceColumns: Object.keys(invoice),
    invoiceSample: {
      billing_type: invoice.billing_type,
      invoice_number: invoice.invoice_number,
      provider_id: invoice.provider_id,
      patient_id: invoice.patient_id,
      total_amount: invoice.total_amount,
      status: invoice.status,
    },
    providerSample: provider,
    lineItemCount: lineItems?.length || 0,
    firstLineItem: lineItems?.[0] || null,
  };

  return NextResponse.json(sumexInput);
}
