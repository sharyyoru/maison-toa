import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/patients/deposit-status?patientId=xxx
// Returns the most recent deposit invoice for a patient.
// A deposit invoice is identified by: deposit_deadline_at set OR deposit_status set OR
// (appointment_id set AND payment_method = 'online').
// Prefers non-CANCELLED invoices. Returns the most recent one overall.
export async function GET(request: NextRequest) {
  const patientId = request.nextUrl.searchParams.get("patientId");
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  // Fetch all deposit-like invoices for this patient, prefer non-CANCELLED
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select("id, invoice_number, total_amount, paid_at, deposit_status, status, deposit_deadline_at, appointment_id, payment_method")
    .eq("patient_id", patientId)
    .eq("is_demo", false)
    .eq("is_archived", false)
    .not("appointment_id", "is", null)
    .not("deposit_deadline_at", "is", null)
    .neq("status", "CANCELLED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // If no active deposit found, fall back to most recent non-cancelled deposit with deposit_status set
  if (!data) {
    const { data: fallback } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, total_amount, paid_at, deposit_status, status, deposit_deadline_at, appointment_id, payment_method")
      .eq("patient_id", patientId)
      .eq("is_demo", false)
      .eq("is_archived", false)
      .not("deposit_status", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return NextResponse.json({ deposit: fallback ?? null });
  }

  return NextResponse.json({ deposit: data });
}

// PATCH /api/patients/deposit-status
// Manually updates deposit_status on a specific invoice
// Allowed transitions after 'paid': applied | refunded
export async function PATCH(request: NextRequest) {
  const { invoiceId, deposit_status } = await request.json() as {
    invoiceId?: string;
    deposit_status?: string;
  };

  if (!invoiceId || !deposit_status) {
    return NextResponse.json({ error: "Missing invoiceId or deposit_status" }, { status: 400 });
  }

  const allowed = ["paid", "applied", "refunded"];
  if (!allowed.includes(deposit_status)) {
    return NextResponse.json({ error: "Invalid deposit_status" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("invoices")
    .update({ deposit_status })
    .eq("id", invoiceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, deposit_status });
}
