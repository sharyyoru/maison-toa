import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Returns all deposit invoices (those with deposit_deadline_at set OR PARTIAL_PAID from prepayment flow)
// i.e. invoices created via "Créer facture acompte 50%" with an appointment linked
export async function GET() {
  const { data, error } = await supabaseAdmin
    .from("invoices")
    .select(`
      id,
      invoice_number,
      title,
      status,
      deposit_status,
      total_amount,
      paid_amount,
      paid_at,
      deposit_deadline_at,
      appointment_id,
      payment_link_token,
      created_at,
      patient:patient_id (
        id,
        first_name,
        last_name,
        email,
        phone
      ),
      appointment:appointment_id (
        id,
        start_time,
        status,
        reason,
        title
      )
    `)
    .not("appointment_id", "is", null)
    .eq("is_demo", false)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ invoices: data || [] });
}
