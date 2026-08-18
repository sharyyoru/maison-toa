import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { POST as runAppointmentWorkflow } from "@/app/api/workflows/appointment-created/route";
import { emitWorkflowEvent } from "@/lib/workflows/events";
import type { WorkflowTriggerType } from "@/lib/workflows/types";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function appointmentDisplayStatus(reason: unknown): string {
  if (typeof reason !== "string") return "Aucune sélection";
  return reason.match(/\[Status:\s*([^\]]+)\]/i)?.[1]?.trim() || "Aucune sélection";
}

async function synchronizePendingReminders(
  appointmentId: string,
  options: { startDeltaMs?: number; cancelled?: boolean },
) {
  if (options.cancelled) {
    const { error } = await supabase
      .from("scheduled_emails")
      .delete()
      .eq("appointment_id", appointmentId)
      .eq("status", "pending");
    if (error) throw error;
    return;
  }

  if (!options.startDeltaMs) return;
  const { data: reminders, error } = await supabase
    .from("scheduled_emails")
    .select("id, scheduled_for")
    .eq("appointment_id", appointmentId)
    .eq("status", "pending");
  if (error) throw error;
  for (const reminder of reminders ?? []) {
    const scheduledFor = new Date(reminder.scheduled_for);
    if (Number.isNaN(scheduledFor.getTime())) continue;
    const { error: updateError } = await supabase
      .from("scheduled_emails")
      .update({
        scheduled_for: new Date(scheduledFor.getTime() + options.startDeltaMs).toISOString(),
      })
      .eq("id", reminder.id);
    if (updateError) throw updateError;
  }
}

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
      .select("id, provider_id, start_time, end_time, status, reason, linked_parent_appointment_id, recurrence_series_id, tracking_params")
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
    const proposedProviderId = typeof updateData.provider_id === "string"
      ? updateData.provider_id
      : currentAppointment.provider_id;
    const scheduleChanged =
      proposedStart.getTime() !== new Date(currentAppointment.start_time).getTime() ||
      proposedEnd.getTime() !== new Date(currentAppointment.end_time).getTime() ||
      proposedProviderId !== currentAppointment.provider_id;

    const recurrenceScope = body.recurrence_scope;
    if (recurrenceScope === "this_and_future") {
      if (!currentAppointment.recurrence_series_id || currentAppointment.linked_parent_appointment_id) {
        return NextResponse.json({ error: "Appointment is not a recurring-series occurrence" }, { status: 400 });
      }
      const { data: futureAppointments, error: futureError } = await supabase
        .from("appointments")
        .select("id, provider_id, start_time, end_time, status, reason, machine_ids, tracking_params")
        .eq("recurrence_series_id", currentAppointment.recurrence_series_id)
        .is("linked_parent_appointment_id", null)
        .gte("start_time", currentAppointment.start_time)
        .order("start_time", { ascending: true });
      if (futureError) return NextResponse.json({ error: futureError.message }, { status: 500 });

      // The selected occurrence is an explicit user action, so it may be
      // changed even if its time has just passed. Other historical
      // occurrences are never changed automatically.
      const nowMs = Date.now();
      const targets = (futureAppointments ?? []).filter((appointment) =>
        appointment.id === id || new Date(appointment.start_time).getTime() >= nowMs
      );
      const targetIds = targets.map((appointment) => appointment.id);
      const startDeltaMs = proposedStart.getTime() - new Date(currentAppointment.start_time).getTime();
      const endDeltaMs = proposedEnd.getTime() - new Date(currentAppointment.end_time).getTime();

      // Validate the practitioner calendar for every affected occurrence before
      // writing any of them. Mirrored room calendars are validated by the
      // existing linked-reservation checks and kept in sync by the DB trigger.
      for (const target of targets) {
        const targetStart = new Date(new Date(target.start_time).getTime() + startDeltaMs);
        const targetEnd = new Date(new Date(target.end_time).getTime() + endDeltaMs);
        const { data: linkedReservations, error: linkedReservationsError } = await supabase
          .from("appointments")
          .select("id, provider_id, start_time, end_time")
          .eq("linked_parent_appointment_id", target.id);
        if (linkedReservationsError) return NextResponse.json({ error: "Failed to verify linked calendar availability" }, { status: 500 });
        for (const reservation of linkedReservations ?? []) {
          if (!reservation.provider_id) continue;
          const linkedStart = new Date(new Date(reservation.start_time).getTime() + startDeltaMs);
          const linkedEnd = new Date(new Date(reservation.end_time).getTime() + startDeltaMs);
          const { data: linkedConflicts, error: linkedConflictError } = await supabase
            .from("appointments")
            .select("id")
            .eq("provider_id", reservation.provider_id)
            .lt("start_time", linkedEnd.toISOString())
            .gt("end_time", linkedStart.toISOString())
            .not("status", "in", "(cancelled,no_show)")
            .neq("id", reservation.id)
            .limit(1);
          if (linkedConflictError) return NextResponse.json({ error: "Failed to verify linked calendar availability" }, { status: 500 });
          if (linkedConflicts?.length) {
            return NextResponse.json({ error: "A room or linked calendar is not available for one or more future appointments" }, { status: 409 });
          }
        }
        const targetProviderId = typeof updateData.provider_id === "string"
          ? updateData.provider_id
          : target.provider_id;
        if (!targetProviderId || proposedStatus === "cancelled" || proposedStatus === "no_show") continue;
        const { data: conflicts, error: conflictError } = await supabase
          .from("appointments")
          .select("id")
          .eq("provider_id", targetProviderId)
          .lt("start_time", targetEnd.toISOString())
          .gt("end_time", targetStart.toISOString())
          .not("status", "in", "(cancelled,no_show)")
          .not("id", "in", `(${targetIds.join(",")})`)
          .limit(1);
        if (conflictError) return NextResponse.json({ error: "Failed to verify practitioner availability" }, { status: 500 });
        if (conflicts?.length) {
          return NextResponse.json({ error: "A practitioner is not available for one or more future appointments" }, { status: 409 });
        }

        const targetMachineIds = Array.isArray(updateData.machine_ids)
          ? updateData.machine_ids.filter((machineId): machineId is string => typeof machineId === "string")
          : (target.machine_ids ?? []);
        for (const machineId of targetMachineIds) {
          const { data: machine, error: machineError } = await supabase
            .from("machines")
            .select("max_concurrent")
            .eq("id", machineId)
            .maybeSingle();
          if (machineError) return NextResponse.json({ error: "Failed to verify machine availability" }, { status: 500 });
          const { count, error: machineConflictError } = await supabase
            .from("appointments")
            .select("id", { count: "exact", head: true })
            .contains("machine_ids", [machineId])
            .lt("start_time", targetEnd.toISOString())
            .gt("end_time", targetStart.toISOString())
            .not("status", "in", "(cancelled,no_show)")
            .not("id", "in", `(${targetIds.join(",")})`);
          if (machineConflictError) return NextResponse.json({ error: "Failed to verify machine availability" }, { status: 500 });
          if ((count ?? 0) >= Math.max(1, Number(machine?.max_concurrent ?? 1))) {
            return NextResponse.json({ error: "A machine is not available for one or more future appointments" }, { status: 409 });
          }
        }
      }

      const sharedUpdates = { ...updateData };
      delete sharedUpdates.start_time;
      delete sharedUpdates.end_time;
      for (const target of targets) {
        const targetStart = new Date(new Date(target.start_time).getTime() + startDeltaMs);
        const targetEnd = new Date(new Date(target.end_time).getTime() + endDeltaMs);
        const trackingParams = (target.tracking_params || {}) as Record<string, string>;
        const logicalStart = trackingParams.patient_appointment_start
          ? new Date(trackingParams.patient_appointment_start)
          : null;
        const targetUpdate: Record<string, unknown> = {
          ...sharedUpdates,
          start_time: targetStart.toISOString(),
          end_time: targetEnd.toISOString(),
        };
        if (logicalStart && !Number.isNaN(logicalStart.getTime())) {
          targetUpdate.tracking_params = {
            ...trackingParams,
            patient_appointment_start: new Date(logicalStart.getTime() + startDeltaMs).toISOString(),
          };
        }
        const { error: updateError } = await supabase.from("appointments").update(targetUpdate).eq("id", target.id);
        if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

        await synchronizePendingReminders(target.id, {
          startDeltaMs,
          cancelled: proposedStatus === "cancelled" || proposedStatus === "no_show",
        });

        const previousDisplayStatus = appointmentDisplayStatus(target.reason);
        const nextDisplayStatus = appointmentDisplayStatus(targetUpdate.reason ?? target.reason);
        if (nextDisplayStatus !== previousDisplayStatus) {
          try {
            await runAppointmentWorkflow(new Request(request.url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                appointmentId: target.id,
                triggerType: "appointment_status_changed",
                appointmentStatus: nextDisplayStatus,
                previousAppointmentStatus: previousDisplayStatus,
              }),
            }));
          } catch (workflowError) {
            console.error("Failed to run recurring appointment status workflow:", workflowError);
          }
        }
      }

      const { data: selectedUpdated, error: selectedError } = await supabase
        .from("appointments")
        .select("id, patient_id, no_patient, provider_id, start_time, end_time, status, reason, title, notes, location, machine_ids, linked_parent_appointment_id, recurrence_series_id, recurrence_sequence, tracking_params, patient:patients(id, first_name, last_name, email, phone, date_of_birth:dob, is_vip, is_member, language_preference), provider:providers(id, name)")
        .eq("id", id)
        .single();
      if (selectedError) return NextResponse.json({ error: selectedError.message }, { status: 500 });
      return NextResponse.json({ appointment: selectedUpdated, affectedAppointmentIds: targetIds });
    }

    if (
      scheduleChanged &&
      proposedStatus !== "cancelled" && proposedStatus !== "no_show"
    ) {
      if (proposedProviderId) {
        const { data: providerConflicts, error: providerConflictError } = await supabase
          .from("appointments")
          .select("id")
          .eq("provider_id", proposedProviderId)
          .lt("start_time", proposedEnd.toISOString())
          .gt("end_time", proposedStart.toISOString())
          .not("status", "in", "(cancelled,no_show)")
          .neq("id", id)
          .limit(1);
        if (providerConflictError) return NextResponse.json({ error: "Failed to verify practitioner availability." }, { status: 500 });
        if (providerConflicts?.length) return NextResponse.json({ error: "The practitioner is not available at the requested time." }, { status: 409 });
      }

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
      .select("id, patient_id, no_patient, provider_id, start_time, end_time, status, reason, title, notes, location, machine_ids, linked_parent_appointment_id, recurrence_series_id, recurrence_sequence, tracking_params, patient:patients(id, first_name, last_name, email, phone, date_of_birth:dob, is_vip, is_member, language_preference), provider:providers(id, name)")
      .single();
    
    if (error) {
      console.error("Error updating appointment:", error);
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      );
    }

    await synchronizePendingReminders(id, {
      startDeltaMs: proposedStart.getTime() - new Date(currentAppointment.start_time).getTime(),
      cancelled: proposedStatus === "cancelled" || proposedStatus === "no_show",
    });

    const previousDisplayStatus = appointmentDisplayStatus(currentAppointment.reason);
    const nextDisplayStatus = appointmentDisplayStatus(data.reason);
    if (nextDisplayStatus !== previousDisplayStatus) {
      try {
        await runAppointmentWorkflow(new Request(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            appointmentId: id,
            triggerType: "appointment_status_changed",
            appointmentStatus: nextDisplayStatus,
            previousAppointmentStatus: previousDisplayStatus,
          }),
        }));
      } catch (workflowError) {
        console.error("Failed to run appointment status workflow:", workflowError);
      }
      try {
        const normalized = nextDisplayStatus.toLowerCase();
        const eventType: WorkflowTriggerType | null = normalized.includes("complete") ? "appointment_completed"
          : normalized.includes("cancel") ? "appointment_cancelled"
          : normalized.includes("no show") || normalized.includes("no_show") ? "appointment_no_show"
          : normalized.includes("confirm") || normalized.includes("approved") ? "appointment_confirmed"
          : normalized.includes("resched") ? "appointment_rescheduled" : null;
        if (eventType) await emitWorkflowEvent({ type: eventType, subjectType: "appointment", subjectId: data.id, patientId: data.patient_id, payload: { ...data, previous_display_status: previousDisplayStatus, display_status: nextDisplayStatus }, dedupeKey: `${eventType}:display:${data.id}:${nextDisplayStatus}:${data.start_time}` });
      } catch (workflowError) {
        console.error("Failed to emit workflow v2 appointment event:", workflowError);
      }
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

    const recurrenceScope = new URL(request.url).searchParams.get("recurrence_scope");
    if (recurrenceScope === "this_and_future") {
      const { data: selected, error: selectedError } = await supabase
        .from("appointments")
        .select("id, start_time, recurrence_series_id, linked_parent_appointment_id")
        .eq("id", id)
        .single();
      if (selectedError || !selected) return NextResponse.json({ error: selectedError?.message ?? "Appointment not found" }, { status: 404 });
      if (!selected.recurrence_series_id || selected.linked_parent_appointment_id) {
        return NextResponse.json({ error: "Appointment is not a recurring-series occurrence" }, { status: 400 });
      }
      const { data: targets, error: targetsError } = await supabase
        .from("appointments")
        .select("id, start_time")
        .eq("recurrence_series_id", selected.recurrence_series_id)
        .is("linked_parent_appointment_id", null)
        .gte("start_time", selected.start_time);
      if (targetsError) return NextResponse.json({ error: targetsError.message }, { status: 500 });
      // Keep appointment history intact: include the explicitly selected
      // occurrence plus future occurrences, but never other past rows.
      const nowMs = Date.now();
      const targetIds = (targets ?? [])
        .filter((appointment) => appointment.id === id || new Date(appointment.start_time).getTime() >= nowMs)
        .map((appointment) => appointment.id);
      const { data: linked } = await supabase.from("appointments").select("id").in("linked_parent_appointment_id", targetIds);
      const { error: deleteError } = await supabase.from("appointments").delete().in("id", targetIds);
      if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });
      return NextResponse.json({
        success: true,
        deletedAppointmentIds: [...targetIds, ...(linked ?? []).map((appointment) => appointment.id)],
      });
    }

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
        patient:patients(id, first_name, last_name, email, phone, is_vip, is_member),
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
