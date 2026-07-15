import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: patientId } = await params;
  const { searchParams } = new URL(req.url);
  const upcoming = searchParams.get("upcoming") === "true";
  const status = searchParams.get("status"); // e.g. "scheduled"

  let query = supabaseAdmin
    .from("appointments")
    .select("id, start_time, end_time, status, reason, title, location")
    .eq("patient_id", patientId)
    .is("linked_parent_appointment_id", null)
    .eq("is_demo", false)
    .order("start_time", { ascending: true });

  if (status) {
    query = query.eq("status", status);
  }

  if (upcoming) {
    query = query.gte("start_time", new Date().toISOString());
  }

  const { data, error } = await query.limit(50);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ appointments: data || [] });
}
