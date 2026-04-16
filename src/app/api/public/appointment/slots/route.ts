import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSwissDayOfWeek, getSwissDayRange, getSwissHourMinute } from "@/lib/swissTimezone";
import { generateTimeSlots, MULTI_CAPACITY_DOCTORS, nameToSlug } from "@/lib/doctorAvailability";
import { parseSwissDate } from "@/lib/swissTimezone";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doctorSlug = searchParams.get("doctorSlug");
  const date = searchParams.get("date"); // YYYY-MM-DD
  const excludeId = searchParams.get("excludeId"); // current appointment to exclude

  if (!doctorSlug || !date) {
    return NextResponse.json({ error: "Missing doctorSlug or date" }, { status: 400 });
  }

  // Generate all theoretical slots for this doctor on this day
  const parsedDate = parseSwissDate(date);
  const dayOfWeek = getSwissDayOfWeek(parsedDate);
  const allSlots = generateTimeSlots(doctorSlug, "lausanne", dayOfWeek);

  if (allSlots.length === 0) {
    return NextResponse.json({ bookedSlots: allSlots.map(() => ""), availableSlots: [] });
  }

  // Look up the provider ID for this doctor slug
  const { data: providers } = await supabase
    .from("providers")
    .select("id, name")
    .limit(50);

  const provider = providers?.find(p => nameToSlug(p.name) === doctorSlug);
  const providerId = provider?.id ?? null;

  // Fetch existing appointments for this doctor on this date
  const { start, end } = getSwissDayRange(date);
  const query = supabase
    .from("appointments")
    .select("id, start_time, provider_id, reason")
    .gte("start_time", start)
    .lte("start_time", end)
    .neq("status", "cancelled");

  const { data: existingAppointments } = await query;

  const maxCapacity = MULTI_CAPACITY_DOCTORS.includes(doctorSlug) ? 3 : 1;

  // Count how many bookings exist per slot for this doctor
  const slotCounts: Record<string, number> = {};
  for (const apt of existingAppointments ?? []) {
    if (excludeId && apt.id === excludeId) continue;

    const isThisDoctor =
      (providerId && apt.provider_id === providerId) ||
      (!providerId && apt.reason?.match(new RegExp(`\\[Doctor:\\s*${doctorSlug.replace(/-/g, "[ -]?")}`, "i")));

    if (!isThisDoctor) continue;

    const { hour, minute } = getSwissHourMinute(new Date(apt.start_time));
    const slotKey = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
    slotCounts[slotKey] = (slotCounts[slotKey] ?? 0) + 1;
  }

  const bookedSlots = Object.entries(slotCounts)
    .filter(([, count]) => count >= maxCapacity)
    .map(([slot]) => slot);

  const availableSlots = allSlots.filter(s => !bookedSlots.includes(s));

  return NextResponse.json({ availableSlots, bookedSlots });
}
