import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    // Only allow updating specific fields
    const allowedFields = [
      "end_time", "start_time", "status", "reason", "title", "notes", "location",
      "provider_id", "patient_id", "no_patient", "machine_ids",
    ];
    const updateData: Record<string, unknown> = {};
    
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updateData[field] = body[field];
      }
    }
    
    if (Object.keys(updateData).length === 0) {
      return NextResponse.json(
        { error: "No valid fields to update" },
        { status: 400 }
      );
    }

    const { data: currentAppointment, error: currentError } = await supabase
      .from("appointments")
      .select("id, provider_id, start_time, end_time, status, linked_parent_appointment_id, tracking_params")
      .eq("id", id)
      .single();

    if (currentError || !currentAppointment) {
      return NextResponse.json({ error: currentError?.message ?? "Appointment not found" }, { status: 404 });
    }

    const proposedStatus = typeof updateData.status === "string" ? updateData.status : currentAppointment.status;
    const proposedStart = new Date(
      typeof updateData.start_time === "string" ? updateData.start_time : currentAppointment.start_time,
    );
    const proposedEnd = new Date(
      typeof updateData.end_time === "string" ? updateData.end_time : currentAppointment.end_time,
    );

    if (
      (updateData.start_time !== undefined || updateData.end_time !== undefined) &&
      proposedStatus !== "cancelled" && proposedStatus !== "no_show"
    ) {
      const reservations: Array<{
        id: string;
        provider_id: string | null;
        start_time: string;
        end_time: string;
      }> = [];

      if (currentAppointment.linked_parent_appointment_id) {
        reservations.push({
          id: currentAppointment.id,
          provider_id: currentAppointment.provider_id,
          start_time: proposedStart.toISOString(),
          end_time: proposedEnd.toISOString(),
        });
      } else {
        const { data: linkedAppointments, error: linkedError } = await supabase
          .from("appointments")
          .select("id, provider_id, start_time, end_time")
          .eq("linked_parent_appointment_id", id);
        if (linkedError) {
          return NextResponse.json({ error: linkedError.message }, { status: 500 });
        }
        for (const linked of linkedAppointments || []) {
          const durationMs = new Date(linked.end_time).getTime() - new Date(linked.start_time).getTime();
          const startDeltaMs = proposedStart.getTime() - new Date(currentAppointment.start_time).getTime();
          const linkedStart = new Date(new Date(linked.start_time).getTime() + startDeltaMs);
          reservations.push({
            ...linked,
            start_time: linkedStart.toISOString(),
            end_time: new Date(linkedStart.getTime() + durationMs).toISOString(),
          });
        }
      }

      for (const reservation of reservations) {
        if (!reservation.provider_id) continue;
        const proposedProviderId = typeof updateData.provider_id === "string"
          ? updateData.provider_id
          : currentAppointment.provider_id;
        if (!currentAppointment.linked_parent_appointment_id && proposedProviderId === reservation.provider_id) {
          return NextResponse.json(
            { error: "The mirrored calendar must be different from the selected doctor calendar." },
            { status: 409 },
          );
        }
        const { data: conflicts, error: conflictError } = await supabase
          .from("appointments")
          .select("id")
          .eq("provider_id", reservation.provider_id)
          .lt("start_time", reservation.end_time)
          .gt("end_time", reservation.start_time)
          .not("status", "in", "(cancelled,no_show)")
          .neq("id", id)
          .neq("id", reservation.id)
          .limit(1);

        if (conflictError) {
          return NextResponse.json({ error: "Failed to verify the mirrored calendar." }, { status: 500 });
        }
        if (conflicts && conflicts.length > 0) {
          return NextResponse.json(
            { error: "The mirrored calendar is not available at the requested time." },
            { status: 409 },
          );
        }
      }
    }

    if (updateData.start_time !== undefined && !currentAppointment.linked_parent_appointment_id) {
      const trackingParams = (currentAppointment.tracking_params || {}) as Record<string, string>;
      if (trackingParams.patient_appointment_start) {
        const currentPatientStart = new Date(trackingParams.patient_appointment_start);
        if (!Number.isNaN(currentPatientStart.getTime())) {
          const startDeltaMs = proposedStart.getTime() - new Date(currentAppointment.start_time).getTime();
          updateData.tracking_params = {
            ...trackingParams,
            patient_appointment_start: new Date(currentPatientStart.getTime() + startDeltaMs).toISOString(),
          };
        }
      }
    }
    
    const { data, error } = await supabase
      .from("appointments")
      .update(updateData)
      .eq("id", id)
      .select("id, patient_id, no_patient, provider_id, start_time, end_time, status, reason, title, notes, location, machine_ids, linked_parent_appointment_id, patient:patients(id, first_name, last_name, email, phone, date_of_birth:dob, is_vip, language_preference), provider:providers(id, name)")
      .single();
    
    if (error) {
      console.error("Error updating appointment:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error in PATCH /api/appointments/[id]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { data: linkedAppointments, error: linkedAppointmentsError } = await supabase
      .from("appointments")
      .select("id")
      .eq("linked_parent_appointment_id", id);

    if (linkedAppointmentsError) {
      return NextResponse.json({ error: linkedAppointmentsError.message }, { status: 500 });
    }

    const { error } = await supabase.from("appointments").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      success: true,
      deletedAppointmentIds: [
        id,
        ...(linkedAppointments ?? []).map((appointment) => appointment.id),
      ],
    });
  } catch (err) {
    console.error("Error in DELETE /api/appointments/[id]:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const { data, error } = await supabase
      .from("appointments")
      .select(`
        *,
        patient:patients(id, first_name, last_name, email, phone),
        provider:providers(id, name, specialty)
      `)
      .eq("id", id)
      .single();
    
    if (error) {
      console.error("Error fetching appointment:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }
    
    if (!data) {
      return NextResponse.json(
        { error: "Appointment not found" },
        { status: 404 }
      );
    }
    
    return NextResponse.json(data);
  } catch (err) {
    console.error("Error in GET /api/appointments/[id]:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
