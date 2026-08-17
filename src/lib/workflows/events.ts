import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { WorkflowTriggerType } from "./types";

export async function emitWorkflowEvent(input: {
  type: WorkflowTriggerType; subjectType: string; subjectId: string; patientId?: string | null;
  occurredAt?: string; payload?: Record<string, unknown>; dedupeKey: string;
}) {
  const { data, error } = await supabaseAdmin.rpc("emit_workflow_event", {
    p_type: input.type,
    p_subject_type: input.subjectType,
    p_subject_id: input.subjectId,
    p_patient_id: input.patientId || null,
    p_payload: input.payload || {},
    p_dedupe_key: input.dedupeKey,
    p_occurred_at: input.occurredAt || new Date().toISOString(),
  });
  if (error) throw error;
  return data as string | null;
}

export async function generateScheduledWorkflowEvents(now = new Date()) {
  const { data, error } = await supabaseAdmin.rpc("generate_scheduled_workflow_events", {
    p_now: now.toISOString(),
  });
  if (error) throw error;
  return data as {
    birthdays: number;
    overdue_invoices: number;
    expired_memberships: number;
  };
}
