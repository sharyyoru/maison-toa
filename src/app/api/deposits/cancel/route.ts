import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Manual cancellation of a deposit invoice + its linked appointment
export async function POST(req: NextRequest) {
  try {
    const { invoiceId, appointmentId } = await req.json();
    if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

    // Cancel invoice
    const { error: invErr } = await supabaseAdmin
      .from("invoices")
      .update({ status: "CANCELLED" })
      .eq("id", invoiceId)
      .eq("status", "OPEN"); // safety: only cancel if still OPEN

    if (invErr) return NextResponse.json({ error: invErr.message }, { status: 500 });

    // Cancel linked appointment if provided
    if (appointmentId) {
      await supabaseAdmin
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", appointmentId)
        .in("status", ["scheduled", "confirmed"]); // only cancel active appointments
    }

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[deposits/cancel]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
