import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

  if (!start || !end) {
    return NextResponse.json(
      { error: "start and end query parameters are required" },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // If doctor name is provided, first look up the provider ID
    let providerId: string | null = null;
    if (doctorName) {
      const doctorNameClean = doctorName.replace(/^Dr\.\s*/i, "").trim();
      
      // Try to find provider by name
      const { data: provider } = await supabase
        .from("providers")
        .select("id")
        .or(`name.ilike.*${doctorNameClean}*,name.ilike.*${doctorNameClean.split(" ")[0]}*`)
        .limit(1)
        .single();
      
      if (provider) {
        providerId = provider.id;
      }
    }

    // Fetch appointments that OVERLAP the date range (not just those starting within it).
    // This correctly catches multi-day blocking events (VACANCES, STOP) that started
    // before the queried day but still cover it.
    let query = supabase
      .from("appointments")
      .select("id, start_time, end_time, status, reason, no_patient, provider_id")
      .lt("start_time", end)   // appointment starts before the range ends
      .gt("end_time", start)   // appointment ends after the range starts
      .neq("status", "cancelled");

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

    const doctorNameLower = doctorName ? doctorName.toLowerCase().replace(/^dr\.\s*/i, "") : "";

    const matchesDoctor = (apt: { provider_id: string | null; reason: string | null }) => {
      if (!doctorName) return true;
      if (providerId && apt.provider_id === providerId) return true;
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
    const allSlots: Date[] = [];

    let currentSlot = new Date(rangeStart);
    // Round to nearest 30 minutes
    currentSlot.setMinutes(Math.floor(currentSlot.getMinutes() / 30) * 30, 0, 0);

    while (currentSlot < rangeEnd) {
      allSlots.push(new Date(currentSlot));
      currentSlot = new Date(currentSlot.getTime() + 30 * 60 * 1000);
    }

    // Get the max capacity for this doctor
    const maxCapacity = getMaxCapacity(doctorSlug);

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
      let machineMax = 1;
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

    return NextResponse.json({
      appointments: patientAppointments,
      slotCounts,
      fullSlots,
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
