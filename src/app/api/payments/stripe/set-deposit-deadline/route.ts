import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Sets deposit_deadline_at = now() + 48h on a prepayment invoice, but only if:
// 1. deposit_deadline_at is currently NULL (first trigger wins — copy or email)
// 2. The invoice has an appointment_id linked (only for deposit use case)
// 3. The invoice status is still OPEN
// This ensures regular invoices are never affected.
export async function POST(req: NextRequest) {
  try {
    const { invoiceId } = await req.json();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

    // Fetch the invoice to verify all conditions
    const { data: invoice, error: fetchErr } = await supabaseAdmin
      .from("invoices")
      .select("id, status, appointment_id, deposit_deadline_at")
      .eq("id", invoiceId)
      .single();

    if (fetchErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Only set deadline if: OPEN + has appointment + deadline not yet set
    if (
      invoice.status !== "OPEN" ||
      !invoice.appointment_id ||
      invoice.deposit_deadline_at !== null
    ) {
      return NextResponse.json({ skipped: true, reason: "Conditions not met" });
    }

    const deadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const { error: updateErr } = await supabaseAdmin
      .from("invoices")
      .update({ deposit_deadline_at: deadline })
      .eq("id", invoiceId)
      .is("deposit_deadline_at", null); // extra safety: only if still null

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, deposit_deadline_at: deadline });
  } catch (err: any) {
    console.error("[set-deposit-deadline]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
