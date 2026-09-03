import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

async function loadOptions() {
  const [{ data: doctors, error: doctorError }, { data: treatments, error: treatmentError }] = await Promise.all([
    supabaseAdmin.from("booking_doctors").select("id, name, slug").eq("enabled", true).order("order_index"),
    supabaseAdmin.from("booking_treatments").select("id, name, category_id").eq("enabled", true).order("name"),
  ]);
  if (doctorError) throw new Error(doctorError.message);
  if (treatmentError) throw new Error(treatmentError.message);
  return { doctors: doctors || [], treatments: treatments || [] };
}

export async function GET() {
  try {
    const [{ data, error }, options] = await Promise.all([
      supabaseAdmin
        .from("exceptional_booking_availability")
        .select("id, booking_doctor_id, exception_date, start_time, end_time, treatment_ids, label, enabled, created_at, booking_doctors(name, slug)")
        .order("exception_date", { ascending: true })
        .order("start_time", { ascending: true }),
      loadOptions(),
    ]);
    if (error) throw new Error(error.message);
    return NextResponse.json({ configurations: data || [], ...options });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load exceptional availability" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const doctorId = typeof body.booking_doctor_id === "string" ? body.booking_doctor_id : "";
    const date = typeof body.exception_date === "string" ? body.exception_date : "";
    const startTime = typeof body.start_time === "string" ? body.start_time.slice(0, 5) : "";
    const endTime = typeof body.end_time === "string" ? body.end_time.slice(0, 5) : "";
    const treatmentIds = Array.isArray(body.treatment_ids)
      ? [...new Set(body.treatment_ids.filter((id: unknown): id is string => typeof id === "string" && id.length > 0))]
      : [];

    if (!doctorId || !DATE_PATTERN.test(date) || !TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) {
      return NextResponse.json({ error: "Doctor, date, start time, and end time are required" }, { status: 400 });
    }
    if (startTime >= endTime) return NextResponse.json({ error: "End time must be after start time" }, { status: 400 });
    if (treatmentIds.length === 0) return NextResponse.json({ error: "Select at least one treatment" }, { status: 400 });

    const [{ data: doctor }, { data: treatments }] = await Promise.all([
      supabaseAdmin.from("booking_doctors").select("id").eq("id", doctorId).eq("enabled", true).maybeSingle(),
      supabaseAdmin.from("booking_treatments").select("id").in("id", treatmentIds).eq("enabled", true),
    ]);
    if (!doctor || treatments?.length !== treatmentIds.length) {
      return NextResponse.json({ error: "The selected doctor or treatment is unavailable" }, { status: 400 });
    }

    const payload = {
      booking_doctor_id: doctorId,
      exception_date: date,
      start_time: startTime,
      end_time: endTime,
      treatment_ids: treatmentIds,
      label: typeof body.label === "string" ? body.label.trim() || null : null,
      enabled: body.enabled !== false,
      updated_at: new Date().toISOString(),
    };
    const operation = body.id
      ? supabaseAdmin.from("exceptional_booking_availability").update(payload).eq("id", body.id)
      : supabaseAdmin.from("exceptional_booking_availability").insert(payload);
    const { data, error } = await operation.select("id, booking_doctor_id, exception_date, start_time, end_time, treatment_ids, label, enabled, created_at").single();
    if (error) throw new Error(error.message);
    return NextResponse.json({ configuration: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save exceptional availability" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await supabaseAdmin.from("exceptional_booking_availability").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
