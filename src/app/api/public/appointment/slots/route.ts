import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSwissDayOfWeek, getSwissDayRange, getSwissHourMinute } from "@/lib/swissTimezone";
import { MULTI_CAPACITY_DOCTORS, nameToSlug } from "@/lib/doctorAvailability";
import { parseSwissDate } from "@/lib/swissTimezone";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function generateTimeSlotsFromAvailability(start: string, end: string): string[] {
  const slots: string[] = [];
  const [startHour, startMin] = start.split(":").map(Number);
  const [endHour, endMin] = end.split(":").map(Number);

  let h = startHour;
  let m = startMin;
  while (h < endHour || (h === endHour && m < endMin)) {
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m = 0; h += 1; }
  }
  return slots;
}

// Returns all 30-min Swiss-time slot keys an appointment occupies (e.g. ["09:00","09:30"])
function getOccupiedSwissSlots(startTimeIso: string, endTimeIso: string): string[] {
  const aptStart = new Date(startTimeIso);
  const aptEnd = new Date(endTimeIso);
  const { hour: startH, minute: startM } = getSwissHourMinute(aptStart);
  const { hour: endH, minute: endM } = getSwissHourMinute(aptEnd);

  const slots: string[] = [];
  let h = startH;
  let m = Math.floor(startM / 30) * 30;

  while (h < endH || (h === endH && m < endM)) {
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m = 0; h++; }
  }
  return slots;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const doctorSlug = searchParams.get("doctorSlug");
  const doctorName = searchParams.get("doctorName");
  const date = searchParams.get("date"); // YYYY-MM-DD
  const excludeId = searchParams.get("excludeId"); // current appointment to exclude

  if (!doctorSlug || !date) {
    return NextResponse.json({ error: "Missing doctorSlug or date" }, { status: 400 });
  }

  const parsedDate = parseSwissDate(date);
  const dayOfWeek = getSwissDayOfWeek(parsedDate);

  // Look up the provider by slug to get their name
  const { data: providers } = await supabase
    .from("providers")
    .select("id, name")
    .limit(50);

  const provider = providers?.find(p => nameToSlug(p.name) === doctorSlug);
  const providerId = provider?.id ?? null;
  const providerName = provider?.name || doctorName;

  // Fetch availability from database (always Lausanne)
  let allSlots: string[] = [];
  let dbScheduleFound = false; // true when the DB has a saved schedule for this doctor

  if (providerName) {
    try {
      const availRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/public/doctor-availability?doctorName=${encodeURIComponent(providerName)}`
      );

      if (availRes.ok) {
        const availData = await availRes.json();
        if (availData.availability && Object.keys(availData.availability).length > 0) {
          dbScheduleFound = true; // DB has a schedule — don't fall back to hardcoded
          if (availData.availability[dayOfWeek] && availData.availability[dayOfWeek].available !== false) {
            const dayAvail = availData.availability[dayOfWeek];
            allSlots = generateTimeSlotsFromAvailability(dayAvail.start, dayAvail.end);
            console.log(`[Slots API] Using database availability for ${providerName} on day ${dayOfWeek}: ${allSlots.length} slots`);
          } else {
            console.log(`[Slots API] Day ${dayOfWeek} disabled in DB for ${providerName} — no slots`);
          }
        }
      }
    } catch (err) {
      console.error("[Slots API] Error fetching doctor availability:", err);
    }
  }

  // Only fall back to hardcoded when the DB has NO schedule for this doctor at all.
  // If the DB has a schedule but the day is disabled, allSlots stays [] intentionally.
  if (!dbScheduleFound) {
    const { generateTimeSlots } = await import("@/lib/doctorAvailability");
    allSlots = generateTimeSlots(doctorSlug, "lausanne", dayOfWeek);
    console.log(`[Slots API] Using hardcoded availability fallback: ${allSlots.length} slots`);
  }

  if (allSlots.length === 0) {
    return NextResponse.json({ bookedSlots: [], availableSlots: [] });
  }

  // Use overlap detection so multi-day blocking events (VACANCES/STOP) are caught
  // regardless of whether they started before this specific day.
  const { start, end } = getSwissDayRange(date);
  const { data: existingAppointments } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, provider_id, reason, no_patient")
    .lt("start_time", end)
    .gt("end_time", start)
    .neq("status", "cancelled");

  const maxCapacity = MULTI_CAPACITY_DOCTORS.includes(doctorSlug) ? 3 : 1;
  const doctorSlugPattern = new RegExp(`\\[Doctor:\\s*${doctorSlug.replace(/-/g, "[ -]?")}`, "i");

  const isThisDoctor = (apt: { provider_id: string | null; reason: string | null }) =>
    (providerId && apt.provider_id === providerId) ||
    !!(apt.reason?.match(doctorSlugPattern));

  const patientApts = (existingAppointments ?? []).filter(
    apt => !apt.no_patient && isThisDoctor(apt) && !(excludeId && apt.id === excludeId)
  );
  const blockingApts = (existingAppointments ?? []).filter(
    apt => apt.no_patient && isThisDoctor(apt)
  );

  // Count bookings per Swiss-time slot key using getSwissHourMinute so the
  // comparison is always in Swiss time (no UTC offset confusion).
  const slotCounts: Record<string, number> = {};
  for (const apt of patientApts) {
    const occupied = getOccupiedSwissSlots(apt.start_time, apt.end_time);
    for (const slotKey of occupied) {
      slotCounts[slotKey] = (slotCounts[slotKey] ?? 0) + 1;
    }
  }

  const bookedSlotSet = new Set<string>(
    Object.entries(slotCounts)
      .filter(([, count]) => count >= maxCapacity)
      .map(([slot]) => slot)
  );

  // Blocking appointments block every Swiss slot they cover
  for (const apt of blockingApts) {
    for (const slotKey of getOccupiedSwissSlots(apt.start_time, apt.end_time)) {
      bookedSlotSet.add(slotKey);
    }
  }

  const bookedSlots = [...bookedSlotSet];
  const availableSlots = allSlots.filter(s => !bookedSlotSet.has(s));

  return NextResponse.json({ availableSlots, bookedSlots });
}
