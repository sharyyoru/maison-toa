import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendEmail } from "@/lib/email";
import type { ActionNode, WorkflowEvent } from "./types";

type ActionContext = { runId: string; patientId: string | null; event: WorkflowEvent };

function getPath(source: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => value && typeof value === "object" ? (value as Record<string, unknown>)[key] : undefined, source);
}

function render(template: string, context: unknown) {
  return template.replace(/{{\s*([^}]+)\s*}}/g, (_match, path) => String(getPath(context, String(path).trim()) ?? ""));
}

async function getPatient(patientId: string | null) {
  if (!patientId) return null;
  const { data } = await supabaseAdmin.from("patients").select("*").eq("id", patientId).maybeSingle();
  return data;
}

async function hasMarketingConsent(patientId: string) {
  const { data } = await supabaseAdmin.from("patient_consents").select("granted").eq("patient_id", patientId).eq("channel", "email_marketing").order("changed_at", { ascending: false }).limit(1).maybeSingle();
  return data?.granted === true;
}

export async function executeWorkflowAction(node: ActionNode, context: ActionContext): Promise<{ result: Record<string, unknown>; stop?: boolean }> {
  const config = node.data.config as Record<string, any>;
  const patient = await getPatient(context.patientId);
  const templateContext = { patient, event: context.event.payload };

  if (node.data.actionType === "stop_workflow") return { result: { reason: config.reason || "Stopped by workflow" }, stop: true };
  if (!context.patientId && ["send_email", "create_task", "add_internal_note", "add_tag", "remove_tag", "update_patient_property"].includes(node.data.actionType)) throw new Error("Action requires a patient");

  if (node.data.actionType === "send_email") {
    if (!patient?.email) throw new Error("Patient has no email address");
    const classification = config.classification === "transactional" ? "transactional" : "marketing";
    if (classification === "marketing" && !(await hasMarketingConsent(context.patientId!))) return { result: { skipped: true, reason: "marketing_consent_required" } };
    let subject = config.subject || ""; let html = config.body_html_template || config.body_template || "";
    if (config.template_id) {
      const { data: template } = await supabaseAdmin.from("email_templates").select("subject_template, html_content, body_template").eq("id", config.template_id).maybeSingle();
      subject = template?.subject_template || subject; html = template?.html_content || template?.body_template || html;
    }
    subject = render(subject, templateContext); html = render(html, templateContext);
    const idempotencyKey = `workflow-${context.runId}-${node.id}`;
    const delivery = await sendEmail({ to: patient.email, subject, html, tags: [{ name: "workflow_run_id", value: context.runId }], idempotencyKey });
    if (!delivery.success) throw new Error(delivery.error || "Email delivery failed");
    const { data: email } = await supabaseAdmin.from("emails").upsert({ patient_id: context.patientId, to_address: patient.email, subject, body: html, status: "sent", direction: "outbound", sent_at: new Date().toISOString(), workflow_idempotency_key: idempotencyKey }, { onConflict: "workflow_idempotency_key" }).select("id").single();
    return { result: { email_id: email?.id, provider_message_id: delivery.messageId, classification } };
  }

  if (node.data.actionType === "create_task") {
    const title = render(config.title || "Workflow Task", templateContext);
    const due = new Date(Date.now() + Number(config.due_days || 1) * 86_400_000).toISOString();
    const assigneeId = Array.isArray(config.assign_to_users) ? config.assign_to_users[0] : config.assign_to || null;
    const { data, error } = await supabaseAdmin.from("tasks").insert({ patient_id: context.patientId, name: title, content: render(config.content || "Created by workflow", templateContext), status: "not_started", priority: config.priority || "medium", type: config.type || "todo", activity_date: due, assigned_user_id: assigneeId }).select("id").single();
    if (error) throw error; return { result: { task_id: data.id } };
  }

  if (node.data.actionType === "add_internal_note") {
    const { data, error } = await supabaseAdmin.from("patient_notes").insert({ patient_id: context.patientId, body: render(config.body || config.note || "Workflow note", templateContext), author_name: "Workflow" }).select("id").single();
    if (error) throw error; return { result: { note_id: data.id } };
  }

  if (node.data.actionType === "add_tag" || node.data.actionType === "remove_tag") {
    let tagId = config.tag_id as string | undefined;
    if (!tagId && config.tag_name) {
      const { data } = await supabaseAdmin.from("patient_tags").upsert({ name: String(config.tag_name).trim() }, { onConflict: "name" }).select("id").single(); tagId = data?.id;
    }
    if (!tagId) throw new Error("Tag is required");
    if (node.data.actionType === "add_tag") await supabaseAdmin.from("patient_tag_assignments").upsert({ patient_id: context.patientId, tag_id: tagId });
    else await supabaseAdmin.from("patient_tag_assignments").delete().eq("patient_id", context.patientId).eq("tag_id", tagId);
    return { result: { tag_id: tagId, operation: node.data.actionType } };
  }

  if (node.data.actionType === "update_patient_property") {
    let definitionId = config.definition_id as string | undefined;
    if (!definitionId && config.property_key) {
      const { data } = await supabaseAdmin.from("patient_property_definitions").select("id").eq("key", config.property_key).maybeSingle(); definitionId = data?.id;
    }
    if (!definitionId) throw new Error("Patient property is required");
    const value = typeof config.value === "string" ? render(config.value, templateContext) : config.value;
    const { error } = await supabaseAdmin.from("patient_property_values").upsert({ patient_id: context.patientId, definition_id: definitionId, value });
    if (error) throw error; return { result: { definition_id: definitionId, value } };
  }

  if (node.data.actionType === "notify_staff" || node.data.actionType === "send_notification") {
    const recipients: string[] = config.recipient_user_ids || config.user_ids || (config.user_id ? [config.user_id] : []);
    if (!recipients.length) throw new Error("At least one staff recipient is required");
    const rows = recipients.map((recipient_user_id) => ({ run_id: context.runId, patient_id: context.patientId, recipient_user_id, title: render(config.title || "Workflow notification", templateContext), body: render(config.body || "", templateContext) }));
    const { error } = await supabaseAdmin.from("workflow_staff_notifications").insert(rows); if (error) throw error;
    return { result: { recipients } };
  }

  throw new Error(`Action ${node.data.actionType} is not supported by workflow engine v2`);
}
