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
    let canonicalDoctorName = doctorName?.replace(/^Dr\.\s*/i, "").trim() || "";
    let providerId: string | null = null;
    if (doctorSlug) {
      const calendarLink = await resolveBookingDoctorCalendar(supabase, doctorSlug);
      if (calendarLink) {
        canonicalDoctorName = calendarLink.bookingDoctorName.replace(/^Dr\.\s*/i, "").trim();
        providerId = calendarLink.providerId;
      }
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

    const bookingContext = await resolveBookingSecondaryCalendar(supabase, {
      treatmentId,
      categorySlug,
      patientType,
    });
    const secondaryCalendar = bookingContext.secondaryCalendar;
    const primaryDurationMinutes = bookingContext.primaryDurationMinutes;
    const doctorStartOffsetMinutes = secondaryCalendar?.position === "end"
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
    let query = supabase
      .from("appointments")
      .select("id, start_time, end_time, status, reason, no_patient, provider_id")
      .lt("start_time", end)   // appointment starts before the range ends
      .gt("end_time", start)   // appointment ends after the range starts
      .neq("status", "cancelled");

    if (providerId && canonicalDoctorName) {
      query = query.or(
        `provider_id.eq.${providerId},and(provider_id.is.null,reason.ilike.%${canonicalDoctorName}%)`
      );
    } else if (canonicalDoctorName) {
      query = query.ilike("reason", `%${canonicalDoctorName}%`);
    }

    const { data: appointments, error } = await query;

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
      const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);

      // Count patient appointments that OVERLAP this window.
      // Using overlap (not just start-in-window) so a 14:00-15:00 appointment
      // correctly blocks both the 14:00 and 14:30 slots.
      const patientCount = patientAppointments.filter((apt) => {
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
        return aptStart < slotEnd && aptEnd > slotStart;
      }).length;

      if (patientCount > 0) {
        slotCounts[slotStart.toISOString()] = patientCount;
      }

      // Check if any blocking appointment overlaps this slot
      const isBlocked = blockingAppointments.some((apt) => {
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
        return aptStart < slotEnd && aptEnd > slotStart;
      });

      if (patientCount >= maxCapacity || isBlocked) {
        fullSlots.push(slotStart.toISOString());
      }
    });

    // ── Machine availability: mark slots as full if machine is at capacity ──
    let machineIntervals: BookingInterval[] = [];
    let machineMax = 1;
    if (treatmentId && treatmentId !== "none") {
      console.log(`[CheckAvailability] Checking machine for treatmentId=${treatmentId}`);
      
      const { data: treatmentRow, error: treatmentError } = await supabase
        .from("booking_treatments")
        .select("id, name, machine_id, linked_service_id")
        .eq("id", treatmentId)
        .single();

      if (treatmentError) {
        console.log(`[CheckAvailability] Treatment lookup error: ${treatmentError.message}`);
      }
      console.log(`[CheckAvailability] Treatment found: ${JSON.stringify(treatmentRow)}`);

      let machineId: string | null = null;
      let machineName = "";

      // First check direct machine_id on booking_treatments
      if (treatmentRow?.machine_id) {
        machineId = treatmentRow.machine_id;
        const { data: machine } = await supabase
          .from("machines")
          .select("max_concurrent, name")
          .eq("id", machineId)
          .single();
        if (machine) {
          machineMax = machine.max_concurrent ?? 1;
          machineName = machine.name;
          console.log(`[CheckAvailability] Machine found: ${machineName}, max=${machineMax}`);
        }
      } 
      // Fallback: check linked_service_id → service_machines
      else if (treatmentRow?.linked_service_id) {
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

      // If a machine is required, check its availability for each slot
      if (machineId) {
        console.log(`[CheckAvailability] Checking machine ${machineName} (${machineId}) availability`);
        
        const { data: machineAppts, error: machineError } = await supabase
          .from("appointments")
          .select("id, appointment_group_id, start_time, end_time, status")
          .contains("machine_ids", [machineId])
          .lt("start_time", end)
          .gt("end_time", start)
          .not("status", "in", "(cancelled,no_show)");

        console.log(`[CheckAvailability] Found ${machineAppts?.length || 0} machine appointments in range`);
        if (machineError) {
          console.log(`[CheckAvailability] Machine query error: ${machineError.message}`);
        }
        if (machineAppts && machineAppts.length > 0) {
          machineIntervals = machineAppts.map((appointment) => ({
            start: new Date(appointment.start_time),
            end: new Date(appointment.end_time),
            groupId: appointment.appointment_group_id || appointment.id,
          }));
          console.log(`[CheckAvailability] Machine appointments: ${JSON.stringify(machineAppts)}`);
          
          let slotsBlockedByMachine = 0;
          allSlots.forEach((slotStart) => {
            const slotIso = slotStart.toISOString();
            if (fullSlots.includes(slotIso)) return; // already full
            const slotEnd = new Date(slotStart.getTime() + 30 * 60 * 1000);
            const overlapping = machineAppts.filter((a) => {
              return new Date(a.start_time) < slotEnd && new Date(a.end_time) > slotStart;
            });
            const uniqueUses = new Set(overlapping.map((a) => a.appointment_group_id || a.id));
            if (uniqueUses.size >= machineMax) {
              fullSlots.push(slotIso);
              slotsBlockedByMachine++;
            }
          });
          console.log(`[CheckAvailability] Blocked ${slotsBlockedByMachine} slots due to machine capacity`);
        }
      } else {
        console.log(`[CheckAvailability] No machine required for this treatment`);
      }
    }

    let secondaryAppointments: Array<{ start_time: string; end_time: string }> = [];
    if (secondaryCalendar && secondaryCalendar.providerId !== providerId) {
      const { data: resourceAppointments, error: resourceError } = await supabase
        .from("appointments")
        .select("start_time, end_time")
        .eq("provider_id", secondaryCalendar.providerId)
        .lt("start_time", end)
        .gt("end_time", start)
        .not("status", "in", "(cancelled,no_show)");
      if (resourceError) {
        console.error("Error checking secondary calendar availability:", resourceError);
        return NextResponse.json({ error: "Failed to check secondary calendar availability" }, { status: 500 });
      }
      secondaryAppointments = resourceAppointments || [];
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
      addReleaseBoundary(candidateMap, interval.end, 0, rangeStart, rangeEnd);
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
