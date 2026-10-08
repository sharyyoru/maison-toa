import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function shiftPendingReminders(appointmentId: string, deltaMs: number) {
  const { data: reminders } = await supabase
    .from("scheduled_emails")
    .select("id, scheduled_for")
    .eq("appointment_id", appointmentId)
    .eq("status", "pending");
  for (const reminder of reminders ?? []) {
    const scheduledFor = new Date(reminder.scheduled_for);
    if (Number.isNaN(scheduledFor.getTime())) continue;
    await supabase
      .from("scheduled_emails")
      .update({ scheduled_for: new Date(scheduledFor.getTime() + deltaMs).toISOString() })
      .eq("id", reminder.id);
  }
}

/**
 * CAL-018: when a manually linked appointment is rescheduled, shift its
 * counterpart(s) by the same time difference so the pair stays synchronized.
 * The link is symmetric: both the appointment's own target and any
 * appointments pointing at it are shifted. Cancelled counterparts are left
 * untouched.
 */
export async function shiftManualLinkedAppointments(
  appointmentId: string,
  deltaMs: number,
  ownTargetId?: string | null,
): Promise<string[]> {
  if (!deltaMs) return [];
  const shifted: string[] = [];
  try {
    const { data: inbound } = await supabase
      .from("appointments")
      .select("id, start_time, end_time, status")
      .eq("manual_linked_appointment_id", appointmentId);

    let counterparts = inbound ?? [];
    let targetId = ownTargetId;
    if (targetId === undefined) {
      const { data: self } = await supabase
        .from("appointments")
        .select("manual_linked_appointment_id")
        .eq("id", appointmentId)
        .maybeSingle();
      targetId = self?.manual_linked_appointment_id ?? null;
    }
    if (targetId) {
      const { data: target } = await supabase
        .from("appointments")
        .select("id, start_time, end_time, status")
        .eq("id", targetId)
        .maybeSingle();
      if (target && !counterparts.some((c) => c.id === target.id)) {
        counterparts = [...counterparts, target];
      }
    }

    for (const counterpart of counterparts) {
      if (["cancelled", "no_show"].includes(String(counterpart.status || "").toLowerCase())) continue;
      const newStart = new Date(new Date(counterpart.start_time).getTime() + deltaMs);
      const newEnd = new Date(new Date(counterpart.end_time).getTime() + deltaMs);
      const { error: shiftError } = await supabase
        .from("appointments")
        .update({ start_time: newStart.toISOString(), end_time: newEnd.toISOString() })
        .eq("id", counterpart.id);
      if (!shiftError) {
        shifted.push(counterpart.id);
        try {
          await shiftPendingReminders(counterpart.id, deltaMs);
        } catch (reminderErr) {
          console.error("Failed to sync reminders for linked appointment:", reminderErr);
        }
      }
    }
  } catch (err) {
    console.error("Failed to shift manually linked appointments:", err);
  }
  return shifted;
}
