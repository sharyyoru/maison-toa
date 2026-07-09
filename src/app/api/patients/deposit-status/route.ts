import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// GET /api/patients/deposit-status?patientId=xxx
// Returns the most recent deposit invoice for a patient.
// A deposit invoice is identified by any of:
//   - payment_link_token is set (created via "Acompte 50%" button)
//   - deposit_deadline_at is set (deadline was triggered)
//   - deposit_status is set (status was updated)
// Non-CANCELLED invoices are preferred. Returns the most recent one overall.
export async function GET(request: NextRequest) {
  const patientId = request.nextUrl.searchParams.get("patientId");
  if (!patientId) {
    return NextResponse.json({ error: "Missing patientId" }, { status: 400 });
  }

  // Single query: any invoice that looks like a deposit invoice, most recent first.
  // Using an OR filter: payment_link_token set OR deposit_deadline_at set OR deposit_status set.
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select(
      "id, invoice_number, total_amount, paid_at, deposit_status, status, deposit_deadline_at, appointment_id, payment_method, payment_link_token, " +
      "appointments!appointment_id(start_time, end_time, status, location, reason)"
    )
    .eq("patient_id", patientId)
    .eq("is_demo", false)
    .eq("is_archived", false)
    .neq("status", "CANCELLED")
    .or("payment_link_token.not.is.null,deposit_deadline_at.not.is.null,deposit_status.not.is.null")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ deposit: data ?? null });
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
