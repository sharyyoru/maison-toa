import { randomUUID } from "crypto";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { executeWorkflowAction } from "./actions";
import { evaluateCondition } from "./conditions";
import { addWorkflowDelay } from "./delay";
import type { WorkflowEvent, WorkflowGraph, WorkflowGraphNode } from "./types";

type ClaimedJob = { id: string; job_type: string; event_id?: string | null; run_id?: string | null; node_id?: string | null; attempts: number; max_attempts: number };
const terminal = new Set(["completed", "failed", "cancelled", "stopped", "shadow"]);

async function enqueueNode(runId: string, nodeId: string, availableAt = new Date()) {
  await supabaseAdmin.from("workflow_jobs").upsert({ job_type: "execute_node", run_id: runId, node_id: nodeId, available_at: availableAt.toISOString(), idempotency_key: `node:${runId}:${nodeId}` }, { onConflict: "idempotency_key", ignoreDuplicates: true });
}

async function nextNode(graph: WorkflowGraph, nodeId: string, branch: "next" | "yes" | "no" = "next") {
  return graph.edges.find((edge) => edge.source === nodeId && edge.branch === branch)?.target;
}

async function processEvent(eventId: string) {
  const { data: eventRow } = await supabaseAdmin.from("workflow_events").select("*").eq("id", eventId).single();
  if (!eventRow) throw new Error("Workflow event not found");
  const { data: workflows, error } = await supabaseAdmin.from("workflows").select("id, published_version_id, migration_status").eq("active", true).eq("engine_version", 2).eq("trigger_type", eventRow.event_type).not("published_version_id", "is", null);
  if (error) throw error;
  for (const workflow of workflows || []) {
    const shadow = process.env.WORKFLOW_ENGINE_V2_MODE !== "live" || workflow.migration_status === "shadow";
    const { data: run, error: runError } = await supabaseAdmin.from("workflow_runs_v2").upsert({ workflow_id: workflow.id, workflow_version_id: workflow.published_version_id, event_id: eventId, patient_id: eventRow.patient_id, subject_type: eventRow.subject_type, subject_id: eventRow.subject_id, status: shadow ? "shadow" : "queued", context: { event: eventRow.payload } }, { onConflict: "workflow_version_id,event_id", ignoreDuplicates: true }).select("id").maybeSingle();
    if (runError) throw runError;
    if (!run || shadow) continue;
    const { data: version } = await supabaseAdmin.from("workflow_versions").select("graph").eq("id", workflow.published_version_id).single();
    const graph = version?.graph as WorkflowGraph; const trigger = graph?.nodes.find((node) => node.type === "trigger");
    if (trigger) await enqueueNode(run.id, trigger.id);
  }
  await supabaseAdmin.from("workflow_events").update({ status: "processed", processed_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", eventId);
}

async function executeNode(runId: string, nodeId: string) {
  const { data: run } = await supabaseAdmin.from("workflow_runs_v2").select("*").eq("id", runId).single();
  if (!run || terminal.has(run.status)) return;
  const [{ data: version }, { data: eventRow }] = await Promise.all([
    supabaseAdmin.from("workflow_versions").select("graph").eq("id", run.workflow_version_id).single(),
    supabaseAdmin.from("workflow_events").select("*").eq("id", run.event_id).single(),
  ]);
  const graph = version?.graph as WorkflowGraph; const node = graph?.nodes.find((item) => item.id === nodeId) as WorkflowGraphNode | undefined;
  if (!node || !eventRow) throw new Error("Workflow node or event not found");
  const event: WorkflowEvent = { id: eventRow.id, type: eventRow.event_type, subjectType: eventRow.subject_type, subjectId: eventRow.subject_id, patientId: eventRow.patient_id, occurredAt: eventRow.occurred_at, payload: eventRow.payload, dedupeKey: eventRow.dedupe_key };
  const idempotencyKey = `${runId}:${nodeId}`;
  const { data: existing } = await supabaseAdmin.from("workflow_step_runs_v2").select("id, status, branch, scheduled_for").eq("idempotency_key", idempotencyKey).maybeSingle();
  if (existing?.status === "completed") {
    if (node.type === "exit") return;
    const branch = (existing.branch || "next") as "next" | "yes" | "no";
    const target = await nextNode(graph, node.id, branch);
    if (target) await enqueueNode(runId, target, existing.scheduled_for ? new Date(existing.scheduled_for) : new Date());
    return;
  }
  const { data: step, error: stepError } = existing
    ? await supabaseAdmin.from("workflow_step_runs_v2").update({ status: "running", attempt: 1, updated_at: new Date().toISOString() }).eq("id", existing.id).select("id").single()
    : await supabaseAdmin.from("workflow_step_runs_v2").insert({ run_id: runId, node_id: nodeId, node_type: node.type, status: "running", attempt: 1, idempotency_key: idempotencyKey }).select("id").single();
  if (stepError || !step) throw stepError || new Error("Could not create step run");
  await supabaseAdmin.from("workflow_runs_v2").update({ status: "running", started_at: run.started_at || new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", runId);

  let branch: "next" | "yes" | "no" = "next"; let result: Record<string, unknown> = {};
  if (node.type === "condition") {
    const evaluation = await evaluateCondition(node.data.expression, { runId, workflowId: run.workflow_id, patientId: run.patient_id, event });
    branch = evaluation.matched ? "yes" : "no"; result = { matched: evaluation.matched, details: evaluation.details };
  } else if (node.type === "delay") {
    const anchor = node.data.anchor === "event_time" ? new Date(event.occurredAt) : node.data.anchor === "appointment_time" && event.payload.start_time ? new Date(String(event.payload.start_time)) : new Date();
    const due = addWorkflowDelay(anchor, node.data); const target = await nextNode(graph, node.id, "next");
    await supabaseAdmin.from("workflow_step_runs_v2").update({ status: "completed", branch: "next", scheduled_for: due.toISOString(), executed_at: new Date().toISOString(), result: { due_at: due.toISOString() } }).eq("id", step.id);
    if (target) {
      await enqueueNode(runId, target, due);
      await supabaseAdmin.from("workflow_runs_v2").update({ status: "waiting" }).eq("id", runId);
    } else {
      await supabaseAdmin.from("workflow_runs_v2").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId);
    }
    return;
  } else if (node.type === "action") {
    const action = await executeWorkflowAction(node, { runId, patientId: run.patient_id, event }); result = action.result;
    if (action.stop) {
      await supabaseAdmin.from("workflow_step_runs_v2").update({ status: "completed", executed_at: new Date().toISOString(), result }).eq("id", step.id);
      await supabaseAdmin.from("workflow_runs_v2").update({ status: "stopped", completed_at: new Date().toISOString() }).eq("id", runId); return;
    }
  } else if (node.type === "exit") {
    await supabaseAdmin.from("workflow_step_runs_v2").update({ status: "completed", executed_at: new Date().toISOString(), result: node.data }).eq("id", step.id);
    await supabaseAdmin.from("workflow_runs_v2").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId); return;
  }
  await supabaseAdmin.from("workflow_step_runs_v2").update({ status: "completed", branch, executed_at: new Date().toISOString(), result }).eq("id", step.id);
  const target = await nextNode(graph, node.id, branch);
  if (target) await enqueueNode(runId, target); else await supabaseAdmin.from("workflow_runs_v2").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", runId);
}

export async function processWorkflowJobs(limit = 25) {
  if ((process.env.WORKFLOW_ENGINE_V2_MODE || "off") === "off") return { claimed: 0, completed: 0, failed: 0, disabled: true };
  const workerId = `vercel:${randomUUID()}`;
  const { data, error } = await supabaseAdmin.rpc("claim_workflow_jobs", { p_worker_id: workerId, p_limit: limit });
  if (error) throw error;
  const jobs = (data || []) as ClaimedJob[]; const results = { claimed: jobs.length, completed: 0, failed: 0 };
  for (const job of jobs) {
    try {
      if (job.job_type === "process_event" && job.event_id) await processEvent(job.event_id);
      else if (job.job_type === "execute_node" && job.run_id && job.node_id) await executeNode(job.run_id, job.node_id);
      await supabaseAdmin.from("workflow_jobs").update({ status: "completed", completed_at: new Date().toISOString(), locked_at: null, locked_by: null }).eq("id", job.id); results.completed++;
    } catch (error) {
      const exhausted = job.attempts >= job.max_attempts;
      const retryAt = new Date(Date.now() + Math.min(60, 2 ** job.attempts) * 60_000).toISOString();
      await supabaseAdmin.from("workflow_jobs").update({ status: "failed", available_at: retryAt, locked_at: null, locked_by: null, last_error: error instanceof Error ? error.message : String(error) }).eq("id", job.id);
      if (exhausted && job.run_id) await supabaseAdmin.from("workflow_runs_v2").update({ status: "failed", error_message: error instanceof Error ? error.message : String(error), completed_at: new Date().toISOString() }).eq("id", job.run_id);
      results.failed++;
    }
  }
  return results;
}
