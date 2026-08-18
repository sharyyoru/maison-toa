import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { resolveBookingDoctorCalendar } from "@/lib/bookingDoctorCalendar";
import { resolveBookingSecondaryCalendar } from "@/lib/bookingSecondaryCalendar";
import { getBookingCalendarIntervals } from "@/lib/bookingCalendarIntervals";
import {
  addReleaseBoundary,
  generateThirtyMinuteStarts,
  hasCapacityConflict,
  intervalOverlaps,
  type BookingInterval,
} from "@/lib/exactBookingAvailability";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Doctor-specific capacity: XT and CR can have 3 concurrent, others have 1
const MULTI_CAPACITY_DOCTORS = ["xavier-tenorio", "cesar-rodriguez"];

function getMaxCapacity(doctorSlug: string | null): number {
  if (!doctorSlug) return 1;
  return MULTI_CAPACITY_DOCTORS.includes(doctorSlug) ? 3 : 1;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get("start");
  const end = searchParams.get("end");
  const doctorName = searchParams.get("doctor"); // Optional: filter by doctor name
  const doctorSlug = searchParams.get("slug"); // Optional: doctor slug for capacity lookup
  const treatmentId = searchParams.get("treatmentId"); // Optional: for machine availability
  const categorySlug = searchParams.get("categorySlug");
  const patientType = searchParams.get("patientType");

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query parameters are required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Resolve the canonical booking doctor name first. Display names can be
    // shortened (for example "Claire"), while the provider record uses the
    // full name. The slug is the stable identifier shared by the booking flow.
    //
    // Doctor-calendar resolution and secondary-calendar/treatment resolution
    // are completely independent of each other, but were previously awaited
    // one after another — run them concurrently instead of paying for two
    // round trips back to back.
    const [calendarLink, bookingContext] = await Promise.all([
      doctorSlug ? resolveBookingDoctorCalendar(supabase, doctorSlug) : Promise.resolve(null),
      resolveBookingSecondaryCalendar(supabase, { treatmentId, categorySlug, patientType }),
    ]);

    let canonicalDoctorName = doctorName?.replace(/^Dr\.\s*/i, "").trim() || "";
    let providerId: string | null = null;
    if (calendarLink) {
      canonicalDoctorName = calendarLink.bookingDoctorName.replace(/^Dr\.\s*/i, "").trim();
      providerId = calendarLink.providerId;
    }

    // Legacy fallback for booking doctors that are not mapped yet.
    if (!providerId && canonicalDoctorName) {
      const nameParts = canonicalDoctorName
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean);
      const { data: providerCandidates } = await supabase
        .from("providers")
        .select("id, name")
        .in("role", ["doctor", "nurse", "technician"])
        .or(
          `name.ilike.%${canonicalDoctorName}%,name.ilike.%${nameParts[0] || canonicalDoctorName}%`
        )
        .limit(20);

      const provider =
        providerCandidates?.find((candidate) => {
          const candidateName = (candidate.name || "").toLowerCase();
          return nameParts.every((part) => candidateName.includes(part));
        }) ??
        (providerCandidates?.length === 1 ? providerCandidates[0] : null);

      if (provider?.id) {
        providerId = provider.id;
      }
    }

    const secondaryCalendar = bookingContext.secondaryCalendar;
    const primaryDurationMinutes = bookingContext.primaryDurationMinutes;
    const doctorStartOffsetMinutes = 0;
    const secondaryReleaseOffsetMinutes = secondaryCalendar?.position === "end"
      ? secondaryCalendar.durationMinutes - primaryDurationMinutes
      : 0;

    // Fetch appointments that OVERLAP the date range (not just those starting within it).
    // This correctly catches multi-day blocking events (VACANCES, STOP) that started
    // before the queried day but still cover it.
    //
    // Scope this to the requested doctor at the DB level instead of pulling every
    // appointment in the whole clinic and filtering in JS: for a realistic lookahead
    // window the clinic-wide table has thousands of rows (mostly other doctors'
    // appointments) versus a few hundred that actually matter here. Besides being
    // slow, the unfiltered query also risked silently hitting Supabase's default
    // row cap on wide date ranges. Legacy appointments with no provider_id are only
    // matched via a `[Doctor: Name]` tag in `reason`, so keep those in scope too.
    async function fetchAppointments() {
      let q = supabase
        .from("appointments")
        .select("id, start_time, end_time, status, reason, no_patient, provider_id")
        .lt("start_time", end)   // appointment starts before the range ends
        .gt("end_time", start)   // appointment ends after the range starts
        .neq("status", "cancelled");

      if (providerId && canonicalDoctorName) {
        q = q.or(
          `provider_id.eq.${providerId},and(provider_id.is.null,reason.ilike.%${canonicalDoctorName}%)`
        );
      } else if (canonicalDoctorName) {
        q = q.ilike("reason", `%${canonicalDoctorName}%`);
      }
      return await q;
    }

    // ── Machine availability: resolve which machine (if any) this treatment
    // requires, then check its bookings for the range. ──
    async function fetchMachineData() {
      if (!treatmentId || treatmentId === "none") return null;

      const { data: treatmentRow, error: treatmentError } = await supabase
        .from("booking_treatments")
        .select("id, name, machine_id, linked_service_id")
        .eq("id", treatmentId)
        .single();
      if (treatmentError) {
        console.log(`[CheckAvailability] Treatment lookup error: ${treatmentError.message}`);
      }

      let machineId: string | null = null;
      let machineMax = 1;

      if (treatmentRow?.machine_id) {
        machineId = treatmentRow.machine_id;
        const { data: machine } = await supabase
          .from("machines")
          .select("max_concurrent, name")
          .eq("id", machineId)
          .single();
        if (machine) machineMax = machine.max_concurrent ?? 1;
      } else if (treatmentRow?.linked_service_id) {
        const { data: machineMapping } = await supabase
          .from("service_machines")
          .select("machine_id, machines(max_concurrent)")
          .eq("service_id", treatmentRow.linked_service_id)
          .limit(1)
          .single();
        if (machineMapping) {
          machineId = machineMapping.machine_id;
          machineMax = (machineMapping.machines as any)?.max_concurrent ?? 1;
        }
      }

      if (!machineId) return null;

      const { data: machineAppts, error: machineError } = await supabase
        .from("appointments")
        .select("id, appointment_group_id, start_time, end_time, status")
        .contains("machine_ids", [machineId])
        .lt("start_time", end)
        .gt("end_time", start)
        .not("status", "in", "(cancelled,no_show)");
      if (machineError) {
        console.log(`[CheckAvailability] Machine query error: ${machineError.message}`);
        return null;
      }
      return { machineMax, machineAppts: machineAppts ?? [] };
    }

    async function fetchSecondaryAppointments() {
      if (!secondaryCalendar || secondaryCalendar.providerId === providerId) return [];
      const { data: resourceAppointments, error: resourceError } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("provider_id", secondaryCalendar.providerId)
        .lt("start_time", end)
        .gt("end_time", start)
        .not("status", "in", "(cancelled,no_show)");
      if (resourceError) {
        console.error("Error checking secondary calendar availability:", resourceError);
        throw new Error("secondary_calendar_failed");
      }
      return resourceAppointments || [];
    }

    // These three lookups don't depend on each other's results — run them
    // concurrently instead of one after another.
    let appointmentsResult: Awaited<ReturnType<typeof fetchAppointments>>;
    let machineData: Awaited<ReturnType<typeof fetchMachineData>>;
    let secondaryAppointments: Array<{ start_time: string; end_time: string }>;
    try {
      [appointmentsResult, machineData, secondaryAppointments] = await Promise.all([
        fetchAppointments(),
        fetchMachineData(),
        fetchSecondaryAppointments(),
      ]);
    } catch {
      return NextResponse.json({ error: "Failed to check secondary calendar availability" }, { status: 500 });
    }

    const { data: appointments, error } = appointmentsResult;
    if (error) {
      console.error("Error fetching appointments:", error);
      return NextResponse.json(
        { error: "Failed to check availability" },
        { status: 500 }
      );
    }

    // Separate blocking (no_patient) appointments from regular patient appointments.
    // no_patient appointments (e.g. VACANCES, STOP) block all overlapping slots via
    // overlap detection. Regular patient appointments count toward the doctor's capacity.
    const allAppointments = appointments || [];

    const doctorNameLower = canonicalDoctorName.toLowerCase();

    const matchesDoctor = (apt: { provider_id: string | null; reason: string | null }) => {
      if (!canonicalDoctorName) return true;
      // A persisted calendar assignment is authoritative. Only fall back to
      // the legacy reason tag when the appointment has no provider at all.
      if (providerId && apt.provider_id) return apt.provider_id === providerId;
      if (apt.reason) {
        const match = apt.reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
        if (match && match[1].toLowerCase().includes(doctorNameLower)) return true;
      }
      return false;
    };

    const patientAppointments = allAppointments.filter(
      (apt) => apt.no_patient !== true && matchesDoctor(apt)
    );
    const blockingAppointments = allAppointments.filter(
      (apt) => apt.no_patient === true && matchesDoctor(apt)
    );

    // Generate all 30-minute slots for the requested time range
    const rangeStart = new Date(start);
    const rangeEnd = new Date(end);
    const allSlots = generateThirtyMinuteStarts(rangeStart, rangeEnd);

    // Get the max capacity for this doctor
    const maxCapacity = getMaxCapacity(doctorSlug);
    // Parse each appointment's start/end once up front — these get reused
    // across every slot below instead of re-parsing the same date strings
    // thousands of times inside the O(slots × appointments) loop.
    const patientIntervals: BookingInterval[] = patientAppointments.map((appointment) => ({
      start: new Date(appointment.start_time),
      end: new Date(appointment.end_time),
      groupId: appointment.id,
    }));
    const blockingIntervals: BookingInterval[] = blockingAppointments.map((appointment) => ({
      start: new Date(appointment.start_time),
      end: new Date(appointment.end_time),
      groupId: appointment.id,
    }));

    // For each 30-minute slot determine if it's unavailable:
    // 1. Patient appointments that START within the window count toward capacity
    // 2. Blocking (no_patient) appointments that OVERLAP the window block it entirely
    const slotCounts: Record<string, number> = {};
    const fullSlots: string[] = [];

    allSlots.forEach((slotStart) => {
      const slotStartMs = slotStart.getTime();
      const slotEndMs = slotStartMs + 30 * 60 * 1000;

      // Count patient appointments that OVERLAP this window.
      // Using overlap (not just start-in-window) so a 14:00-15:00 appointment
      // correctly blocks both the 14:00 and 14:30 slots.
      let patientCount = 0;
      for (const interval of patientIntervals) {
        if (interval.start.getTime() < slotEndMs && interval.end.getTime() > slotStartMs) patientCount++;
      }

      if (patientCount > 0) {
        slotCounts[slotStart.toISOString()] = patientCount;
      }

      // Check if any blocking appointment overlaps this slot
      const isBlocked = blockingIntervals.some(
        (interval) => interval.start.getTime() < slotEndMs && interval.end.getTime() > slotStartMs
      );

      if (patientCount >= maxCapacity || isBlocked) {
        fullSlots.push(slotStart.toISOString());
      }
    });

    // ── Machine availability: mark slots as full if machine is at capacity ──
    let machineIntervals: BookingInterval[] = [];
    let machineMax = 1;
    if (machineData && machineData.machineAppts.length > 0) {
      machineMax = machineData.machineMax;
      const machineAppts = machineData.machineAppts;
      machineIntervals = machineAppts.map((appointment) => ({
        start: new Date(appointment.start_time),
        end: new Date(appointment.end_time),
        groupId: appointment.appointment_group_id || appointment.id,
      }));

      const fullSlotsSet = new Set(fullSlots);
      allSlots.forEach((slotStart) => {
        const slotIso = slotStart.toISOString();
        if (fullSlotsSet.has(slotIso)) return; // already full
        const slotStartMs = slotStart.getTime();
        const slotEndMs = slotStartMs + 30 * 60 * 1000;
        const uniqueUses = new Set<string>();
        for (const interval of machineIntervals) {
          if (interval.start.getTime() < slotEndMs && interval.end.getTime() > slotStartMs) {
            uniqueUses.add(interval.groupId as string);
          }
        }
        if (uniqueUses.size >= machineMax) {
          fullSlots.push(slotIso);
          fullSlotsSet.add(slotIso);
        }
      });
    }

    const secondaryIntervals: BookingInterval[] = secondaryAppointments.map((appointment, index) => ({
      start: new Date(appointment.start_time),
      end: new Date(appointment.end_time),
      groupId: `secondary-${index}`,
    }));
    const candidateMap = new Map<number, Date>(allSlots.map((slot) => [slot.getTime(), slot]));
    [...patientIntervals, ...blockingIntervals, ...machineIntervals].forEach((interval) => {
      addReleaseBoundary(
        candidateMap,
        interval.end,
        bookingContext.bufferBeforeMinutes - doctorStartOffsetMinutes,
        rangeStart,
        rangeEnd,
      );
    });
    secondaryIntervals.forEach((interval) => {
      addReleaseBoundary(candidateMap, interval.end, secondaryReleaseOffsetMinutes, rangeStart, rangeEnd);
    });

    const unavailableStarts = new Set<string>();
    const availableStarts: string[] = [];
    const candidates = [...candidateMap.values()].sort((a, b) => a.getTime() - b.getTime());
    for (const slotStart of candidates) {
      const intervals = getBookingCalendarIntervals({
        bookingStart: slotStart,
        primaryDurationMinutes,
        bufferBeforeMinutes: bookingContext.bufferBeforeMinutes,
        bufferAfterMinutes: bookingContext.bufferAfterMinutes,
        secondaryDurationMinutes: secondaryCalendar?.durationMinutes,
        secondaryPosition: secondaryCalendar?.position,
      });
      const sameCalendar = secondaryCalendar?.providerId === providerId;
      const primaryStart = sameCalendar && intervals.secondaryCalendarStart
        ? new Date(Math.min(intervals.doctorCalendarStart.getTime(), intervals.secondaryCalendarStart.getTime()))
        : intervals.doctorCalendarStart;
      const primaryEnd = sameCalendar && intervals.secondaryCalendarEnd
        ? new Date(Math.max(intervals.doctorCalendarEnd.getTime(), intervals.secondaryCalendarEnd.getTime()))
        : intervals.doctorCalendarEnd;
      const primaryBlocked = hasCapacityConflict(primaryStart, primaryEnd, patientIntervals, maxCapacity)
        || blockingIntervals.some((interval) => intervalOverlaps(primaryStart, primaryEnd, interval));
      const machineBlocked = machineIntervals.length > 0
        && hasCapacityConflict(primaryStart, primaryEnd, machineIntervals, machineMax);
      const secondaryBlocked = secondaryIntervals.some(
        (interval) => !!intervals.secondaryCalendarStart && !!intervals.secondaryCalendarEnd
          && intervalOverlaps(intervals.secondaryCalendarStart, intervals.secondaryCalendarEnd, interval),
      );
      if (primaryBlocked || machineBlocked || secondaryBlocked) {
        unavailableStarts.add(slotStart.toISOString());
      } else {
        availableStarts.push(slotStart.toISOString());
      }
    }

    return NextResponse.json({
      appointments: patientAppointments,
      slotCounts,
      fullSlots: [...new Set(fullSlots)],
      unavailableStarts: [...unavailableStarts],
      availableStarts,
      bookingWindow: {
        durationMinutes: primaryDurationMinutes,
        bufferBeforeMinutes: bookingContext.bufferBeforeMinutes,
        bufferAfterMinutes: bookingContext.bufferAfterMinutes,
        startOffsetMinutes: doctorStartOffsetMinutes,
      },
      maxConcurrent: maxCapacity
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    return NextResponse.json(
      { error: "Failed to check availability" },
      { status: 500 }
    );
  }
}
