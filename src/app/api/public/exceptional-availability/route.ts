import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { formatSwissYmd } from "@/lib/swissTimezone";

export async function GET(request: NextRequest) {
  const doctorSlug = request.nextUrl.searchParams.get("doctorSlug")?.trim();
  const treatmentId = request.nextUrl.searchParams.get("treatmentId")?.trim();
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");

  if (!doctorSlug || !treatmentId) {
    return NextResponse.json({ error: "doctorSlug and treatmentId are required" }, { status: 400 });
  }

  const { data: doctor, error: doctorError } = await supabaseAdmin
    .from("booking_doctors")
    .select("id")
    .eq("slug", doctorSlug)
    .eq("enabled", true)
    .maybeSingle();

  if (doctorError) return NextResponse.json({ error: doctorError.message }, { status: 500 });
  if (!doctor) return NextResponse.json({ windows: [] });

  let query = supabaseAdmin
    .from("exceptional_booking_availability")
    .select("id, exception_date, start_time, end_time, treatment_ids, label")
    .eq("booking_doctor_id", doctor.id)
    .eq("enabled", true)
    .order("exception_date")
    .order("start_time");

  query = query.gte("exception_date", from || formatSwissYmd(new Date()));
  if (to) query = query.lte("exception_date", to);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ windows: data || [] });
}
