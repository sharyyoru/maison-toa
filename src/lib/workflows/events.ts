import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { WorkflowTriggerType } from "./types";

export async function emitWorkflowEvent(input: {
  type: WorkflowTriggerType; subjectType: string; subjectId: string; patientId?: string | null;
  occurredAt?: string; payload?: Record<string, unknown>; dedupeKey: string;
}) {
  const { data, error } = await supabaseAdmin.from("workflow_events").upsert({
    event_type: input.type, subject_type: input.subjectType, subject_id: input.subjectId,
    patient_id: input.patientId || null, occurred_at: input.occurredAt || new Date().toISOString(),
    payload: input.payload || {}, dedupe_key: input.dedupeKey,
  }, { onConflict: "dedupe_key", ignoreDuplicates: true }).select("id").maybeSingle();
  if (error) throw error;
  let eventId = data?.id;
  if (!eventId) {
    const { data: existing } = await supabaseAdmin.from("workflow_events").select("id").eq("dedupe_key", input.dedupeKey).single(); eventId = existing?.id;
  }
  if (eventId) await supabaseAdmin.from("workflow_jobs").upsert({ job_type: "process_event", event_id: eventId, idempotency_key: `event:${eventId}` }, { onConflict: "idempotency_key", ignoreDuplicates: true });
  return eventId;
}

export async function generateScheduledWorkflowEvents(now = new Date()) {
  const swissDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [year, month, day] = swissDate.split("-");
  let emitted = 0;
  const { data: birthdayPatients } = await supabaseAdmin.from("patients").select("id, dob").not("dob", "is", null);
  for (const patient of birthdayPatients || []) {
    if (String(patient.dob).slice(5) !== `${month}-${day}`) continue;
    await emitWorkflowEvent({ type: "birthday", subjectType: "patient", subjectId: patient.id, patientId: patient.id, payload: { birthday: patient.dob, year: Number(year) }, dedupeKey: `birthday:${patient.id}:${year}` }); emitted++;
  }
  const { data: overdueInvoices } = await supabaseAdmin.from("invoices").select("id, patient_id, due_date, total_amount, paid_amount, status").lt("due_date", now.toISOString()).neq("status", "paid");
  for (const invoice of overdueInvoices || []) {
    if (Number(invoice.paid_amount || 0) >= Number(invoice.total_amount || 0)) continue;
    await emitWorkflowEvent({ type: "invoice_overdue", subjectType: "invoice", subjectId: invoice.id, patientId: invoice.patient_id, payload: invoice, dedupeKey: `invoice_overdue:${invoice.id}` }); emitted++;
  }
  const { data: expiredMemberships } = await supabaseAdmin.from("patient_memberships").select("*").eq("status", "active").lte("expires_at", now.toISOString());
  for (const membership of expiredMemberships || []) {
    await supabaseAdmin.from("patient_memberships").update({ status: "expired", updated_at: now.toISOString() }).eq("id", membership.id); emitted++;
  }
  return emitted;
}
