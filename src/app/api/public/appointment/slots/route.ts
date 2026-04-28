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

  if (providerName) {
    try {
      const availRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/public/doctor-availability?doctorName=${encodeURIComponent(providerName)}`
      );

      if (availRes.ok) {
        const availData = await availRes.json();
        if (availData.availability && availData.availability[dayOfWeek] && availData.availability[dayOfWeek].available !== false) {
          const dayAvail = availData.availability[dayOfWeek];
          allSlots = generateTimeSlotsFromAvailability(dayAvail.start, dayAvail.end);
          console.log(`[Slots API] Using database availability for ${providerName} on day ${dayOfWeek}: ${allSlots.length} slots`);
        } else {
          console.log(`[Slots API] No availability in database for ${providerName} on day ${dayOfWeek}`);
        }
      }
    } catch (err) {
      console.error("[Slots API] Error fetching doctor availability:", err);
    }
  }

  // Fallback to hardcoded availability if database query fails
  if (allSlots.length === 0) {
    const { generateTimeSlots } = await import("@/lib/doctorAvailability");
    allSlots = generateTimeSlots(doctorSlug, "lausanne", dayOfWeek);
    console.log(`[Slots API] Using hardcoded availability fallback: ${allSlots.length} slots`);
  }

  if (allSlots.length === 0) {
    return NextResponse.json({ bookedSlots: [], availableSlots: [] });
  }

  // Use overlap detection (same as check-availability) so multi-day blocking
  // events (VACANCES, STOP with no_patient=true) are correctly caught.
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

  // Separate blocking (no_patient) from regular patient appointments
  const patientApts = (existingAppointments ?? []).filter(
    apt => !apt.no_patient && isThisDoctor(apt) && !(excludeId && apt.id === excludeId)
  );
  const blockingApts = (existingAppointments ?? []).filter(
    apt => apt.no_patient && isThisDoctor(apt)
  );

  // Build slot-level counts using overlap, then subtract blocked slots
  const bookedSlotSet = new Set<string>();

  for (const slot of allSlots) {
    const slotStart = new Date(`${date}T${slot}:00`);
    const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

    // Block if any blocking appointment overlaps this slot
    const isBlocked = blockingApts.some(apt => {
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      return aptStart < slotEnd && aptEnd > slotStart;
    });

    if (isBlocked) {
      bookedSlotSet.add(slot);
      continue;
    }

    // Count patient appointments that overlap this slot
    const count = patientApts.filter(apt => {
      const aptStart = new Date(apt.start_time);
      const aptEnd = new Date(apt.end_time);
      return aptStart < slotEnd && aptEnd > slotStart;
    }).length;

    if (count >= maxCapacity) {
      bookedSlotSet.add(slot);
    }
  }

  const bookedSlots = [...bookedSlotSet];
  const availableSlots = allSlots.filter(s => !bookedSlotSet.has(s));

  return NextResponse.json({ availableSlots, bookedSlots });
}
