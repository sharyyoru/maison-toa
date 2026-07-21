import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSwissDayOfWeek, getSwissDayRange, getSwissHourMinute } from "@/lib/swissTimezone";
import { MULTI_CAPACITY_DOCTORS, nameToSlug } from "@/lib/doctorAvailability";
import { createSwissDateTime, parseSwissDate } from "@/lib/swissTimezone";
import { resolveBookingDoctorCalendar } from "@/lib/bookingDoctorCalendar";
import { hasCapacityConflict, intervalOverlaps, type BookingInterval } from "@/lib/exactBookingAvailability";

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

function normalizeDoctorSlug(value: string): string {
  return nameToSlug(value.replace(/^Dr\.?\s+/i, "")).replace(/^dr-/, "");
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

  const normalizedDoctorSlug = normalizeDoctorSlug(doctorSlug);
  const parsedDate = parseSwissDate(date);
  const dayOfWeek = getSwissDayOfWeek(parsedDate);

  const calendarLink = await resolveBookingDoctorCalendar(supabase, doctorSlug);
  let providerId = calendarLink?.providerId ?? null;
  let providerName = calendarLink?.providerName || calendarLink?.bookingDoctorName || doctorName;

  // Legacy fallback for booking doctors that are not mapped yet.
  if (!providerId) {
    const { data: providers } = await supabase
      .from("providers")
      .select("id, name")
      .in("role", ["doctor", "nurse", "technician"])
      .limit(50);
    const provider = providers?.find(p => normalizeDoctorSlug(p.name) === normalizedDoctorSlug);
    providerId = provider?.id ?? null;
    providerName = provider?.name || providerName;
  }

  // Fetch availability from database (always Lausanne)
  let allSlots: string[] = [];
  let dbScheduleFound = false; // true when the DB has a saved schedule for this doctor

  if (providerName) {
    try {
      const availRes = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/public/doctor-availability?doctorSlug=${encodeURIComponent(doctorSlug)}&doctorName=${encodeURIComponent(providerName)}`
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
    allSlots = generateTimeSlots(normalizedDoctorSlug, "lausanne", dayOfWeek);
    console.log(`[Slots API] Using hardcoded availability fallback: ${allSlots.length} slots`);
  }

  if (allSlots.length === 0) {
    return NextResponse.json({ bookedSlots: [], availableSlots: [] });
  }

  // Use overlap detection so multi-day blocking events (VACANCES/STOP) are caught
  // regardless of whether they started before this specific day.
  const { start, end } = getSwissDayRange(date);
  const { data: existingAppointments, error: existingAppointmentsError } = await supabase
    .from("appointments")
    .select("id, start_time, end_time, provider_id, reason, no_patient")
    .lt("start_time", end)
    .gt("end_time", start)
    .neq("status", "cancelled");

  if (existingAppointmentsError) {
    console.error("[Slots API] Failed to load doctor calendar:", existingAppointmentsError);
    return NextResponse.json({ error: "Failed to verify calendar availability" }, { status: 500 });
  }

  const maxCapacity = MULTI_CAPACITY_DOCTORS.includes(normalizedDoctorSlug) ? 3 : 1;
  const doctorSlugPattern = new RegExp(`\\[Doctor:\\s*${normalizedDoctorSlug.replace(/-/g, "[ -]?")}`, "i");

  const isThisDoctor = (apt: { provider_id: string | null; reason: string | null }) => {
    // A persisted calendar assignment is authoritative. Only fall back to
    // the reason tag for legacy appointments without a provider_id.
    if (providerId && apt.provider_id) return apt.provider_id === providerId;

    const doctorMatch = apt.reason?.match(/\[Doctor:\s*(.+?)\s*\]/i);
    if (doctorMatch && normalizeDoctorSlug(doctorMatch[1]) === normalizedDoctorSlug) return true;

    return !!(apt.reason?.match(doctorSlugPattern));
  };

  const patientApts = (existingAppointments ?? []).filter(
    apt => !apt.no_patient && isThisDoctor(apt) && !(excludeId && apt.id === excludeId)
  );
  const blockingApts = (existingAppointments ?? []).filter(
    apt => apt.no_patient && isThisDoctor(apt)
  );

  let scheduleStartMinutes = 0;
  let scheduleEndMinutes = 24 * 60;
  if (excludeId && allSlots.length > 0) {
    const [firstHour, firstMinute] = allSlots[0].split(":").map(Number);
    const [lastHour, lastMinute] = allSlots[allSlots.length - 1].split(":").map(Number);
    scheduleStartMinutes = firstHour * 60 + firstMinute;
    scheduleEndMinutes = lastHour * 60 + lastMinute + 30;
    for (const appointment of [...patientApts, ...blockingApts]) {
      const { hour, minute } = getSwissHourMinute(new Date(appointment.end_time));
      const endMinutes = hour * 60 + minute;
      if (endMinutes >= scheduleStartMinutes && endMinutes < scheduleEndMinutes) {
        allSlots.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
      }
    }
    allSlots = [...new Set(allSlots)].sort((a, b) => a.localeCompare(b));
  }

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
  let availableSlots = allSlots.filter(s => !bookedSlotSet.has(s));

  // Self-service rescheduling uses excludeId. If the appointment owns a
  // linked calendar record, filter the same candidate starts against that
  // calendar while excluding the existing linked record itself.
  if (excludeId) {
    const { data: currentAppointment, error: currentAppointmentError } = await supabase
      .from("appointments")
      .select("id, start_time, end_time")
      .eq("id", excludeId)
      .maybeSingle();

    if (currentAppointmentError || !currentAppointment) {
      console.error("[Slots API] Failed to load rescheduled appointment:", currentAppointmentError);
      return NextResponse.json({ error: "Failed to verify appointment availability" }, { status: 500 });
    }

    const primaryDurationMs = Math.max(
      60_000,
      new Date(currentAppointment.end_time).getTime() - new Date(currentAppointment.start_time).getTime(),
    );

    const patientIntervals: BookingInterval[] = patientApts.map((appointment) => ({
      start: new Date(appointment.start_time),
      end: new Date(appointment.end_time),
      groupId: appointment.id,
    }));
    const blockingIntervals: BookingInterval[] = blockingApts.map((appointment) => ({
      start: new Date(appointment.start_time),
      end: new Date(appointment.end_time),
      groupId: appointment.id,
    }));
    availableSlots = availableSlots.filter((time) => {
      const [hour, minute] = time.split(":").map(Number);
      const candidateMinutes = hour * 60 + minute;
      if (candidateMinutes < scheduleStartMinutes
        || candidateMinutes + primaryDurationMs / 60_000 > scheduleEndMinutes) return false;
      const candidateStart = createSwissDateTime(date, hour, minute);
      const candidateEnd = new Date(candidateStart.getTime() + primaryDurationMs);
      return !hasCapacityConflict(candidateStart, candidateEnd, patientIntervals, maxCapacity)
        && !blockingIntervals.some((interval) => intervalOverlaps(candidateStart, candidateEnd, interval));
    });

    const { data: linkedAppointment, error: linkedAppointmentError } = await supabase
      .from("appointments")
      .select("id, provider_id, start_time, end_time")
      .eq("linked_parent_appointment_id", excludeId)
      .maybeSingle();

    if (linkedAppointmentError) {
      console.error("[Slots API] Failed to load mirrored appointment:", linkedAppointmentError);
      return NextResponse.json({ error: "Failed to verify additional calendar" }, { status: 500 });
    }

    if (linkedAppointment?.provider_id) {
      const linkedDurationMs = Math.max(
        60_000,
        new Date(linkedAppointment.end_time).getTime() - new Date(linkedAppointment.start_time).getTime(),
      );
      const { data: linkedCalendarAppointments, error: linkedCalendarError } = await supabase
        .from("appointments")
        .select("id, start_time, end_time")
        .eq("provider_id", linkedAppointment.provider_id)
        .neq("id", linkedAppointment.id)
        .lt("start_time", end)
        .gt("end_time", start)
        .not("status", "in", "(cancelled,no_show)");

      if (linkedCalendarError) {
        console.error("[Slots API] Failed to load mirrored calendar:", linkedCalendarError);
        return NextResponse.json({ error: "Failed to verify additional calendar" }, { status: 500 });
      }

      availableSlots = availableSlots.filter((time) => {
        const [hour, minute] = time.split(":").map(Number);
        const candidateStart = createSwissDateTime(date, hour, minute);
        const candidateEnd = new Date(candidateStart.getTime() + linkedDurationMs);
        return !(linkedCalendarAppointments || []).some(
          (appointment) => new Date(appointment.start_time) < candidateEnd && new Date(appointment.end_time) > candidateStart,
        );
      });
    }
  }

  return NextResponse.json({ availableSlots, bookedSlots });
}
