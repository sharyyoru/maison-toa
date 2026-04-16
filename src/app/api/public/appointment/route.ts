import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { formatSwissDateWithWeekday, formatSwissTimeAmPm, formatSwissYmd, getSwissHourMinute } from "@/lib/swissTimezone";
import { nameToSlug } from "@/lib/doctorAvailability";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function parseServiceFromReason(reason: string | null): string {
  if (!reason) return "";
  return reason
    .replace(/\s*\[Doctor:[^\]]*\]/gi, "")
    .replace(/\s*\[Online Booking\]/gi, "")
    .replace(/\s*\[Lang:[^\]]*\]/gi, "")
    .replace(/\s*-\s*$/, "")
    .trim();
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing appointment id" }, { status: 400 });
  }

  const { data: appt, error } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, status, reason, location, patient_id, provider_id")
    .eq("id", id)
    .single();

  if (error || !appt) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appt.status === "cancelled") {
    return NextResponse.json({ error: "This appointment has already been cancelled." }, { status: 410 });
  }

  // Fetch provider name
  let doctorName = "";
  let doctorSlug = "";
  if (appt.provider_id) {
    const { data: provider } = await supabase
      .from("providers")
      .select("name")
      .eq("id", appt.provider_id)
      .single();
    if (provider?.name) {
      doctorName = provider.name;
      doctorSlug = nameToSlug(provider.name);
    }
  }

  // Fallback: extract doctor name from reason field
  if (!doctorName && appt.reason) {
    const match = appt.reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
    if (match) {
      doctorName = match[1];
      doctorSlug = nameToSlug(match[1]);
    }
  }

  const startDate = new Date(appt.start_time);
  const { hour, minute } = getSwissHourMinute(startDate);
  const rawDate = formatSwissYmd(startDate);
  const rawTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;

  return NextResponse.json({
    id: appt.id,
    doctorName,
    doctorSlug,
    formattedDate: formatSwissDateWithWeekday(startDate),
    formattedTime: formatSwissTimeAmPm(startDate),
    rawDate,
    rawTime,
    service: parseServiceFromReason(appt.reason),
    location: appt.location || "Lausanne",
    status: appt.status,
  });
}
