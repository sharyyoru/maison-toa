import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { ConditionExpression, WorkflowEvent } from "./types";

type RunContext = { runId: string; workflowId: string; patientId: string | null; event: WorkflowEvent };

async function latestConsent(patientId: string, channel: string) {
  const { data } = await supabaseAdmin.from("patient_consents").select("granted").eq("patient_id", patientId).eq("channel", channel).order("changed_at", { ascending: false }).limit(1).maybeSingle();
  return data?.granted ?? false;
}

async function appointmentTreatment(context: RunContext) {
  const payloadServiceIds = Array.isArray(context.event.payload.service_ids)
    ? context.event.payload.service_ids.map(String)
    : context.event.payload.service_id
      ? [String(context.event.payload.service_id)]
      : [];
  let serviceIds = payloadServiceIds;
  let fallbackName = String(context.event.payload.treatment_name || context.event.payload.service || context.event.payload.reason || "");

  if (context.event.subjectType === "appointment" && context.event.subjectId) {
    const { data: appointment } = await supabaseAdmin
      .from("appointments")
      .select("service_ids, reason")
      .eq("id", context.event.subjectId)
      .maybeSingle();
    if (serviceIds.length === 0 && Array.isArray(appointment?.service_ids)) serviceIds = appointment.service_ids.map(String);
    if (!fallbackName && appointment?.reason) fallbackName = String(appointment.reason);
  }

  if (serviceIds.length === 0) {
    return { serviceIds, names: fallbackName ? [fallbackName] : [], categories: [] as string[] };
  }
  const { data: services } = await supabaseAdmin
    .from("services")
    .select("id, name, category:service_categories(name)")
    .in("id", serviceIds);
  const rows = (services || []) as unknown as Array<{ id: string; name: string; category?: { name?: string } | Array<{ name?: string }> | null }>;
  const categoryName = (category: (typeof rows)[number]["category"]) => Array.isArray(category) ? category[0]?.name : category?.name;
  return {
    serviceIds,
    names: rows.map((service) => service.name).filter(Boolean),
    categories: rows.map((service) => categoryName(service.category)).filter((name): name is string => Boolean(name)),
  };
}

async function resolveField(field: string, context: RunContext, expected?: unknown): Promise<unknown> {
  const patientId = context.patientId;
  if (!patientId) return null;
  if (field.startsWith("patient.")) {
    if (field === "patient.marketing_consent") return latestConsent(patientId, "email_marketing");
    if (field === "patient.social_media_consent") return latestConsent(patientId, "social_media");
    if (field === "patient.membership") {
      const { data } = await supabaseAdmin.from("patient_memberships").select("membership_type").eq("patient_id", patientId).eq("status", "active").limit(1).maybeSingle();
      return data?.membership_type ?? null;
    }
    if (field === "patient.custom_property") {
      const key = typeof expected === "object" && expected ? String((expected as Record<string, unknown>).key || "") : String(expected || "").split("=")[0];
      if (!key) return null;
      const { data: definition } = await supabaseAdmin.from("patient_property_definitions").select("id").eq("key", key).maybeSingle();
      if (!definition) return null;
      const { data: property } = await supabaseAdmin.from("patient_property_values").select("value").eq("patient_id", patientId).eq("definition_id", definition.id).maybeSingle();
      return property?.value ?? null;
    }
    const column = ({ "patient.vip": "is_vip", "patient.language": "language_preference", "patient.age": "dob" } as Record<string, string>)[field] || field.split(".")[1];
    const { data } = await supabaseAdmin.from("patients").select(column).eq("id", patientId).maybeSingle();
    const value = data ? (data as unknown as Record<string, unknown>)[column] : null;
    if (field === "patient.age" && typeof value === "string") {
      const born = new Date(`${value}T12:00:00Z`); const now = new Date();
      let age = now.getUTCFullYear() - born.getUTCFullYear();
      if (now.getUTCMonth() < born.getUTCMonth() || (now.getUTCMonth() === born.getUTCMonth() && now.getUTCDate() < born.getUTCDate())) age--;
      return age;
    }
    return value;
  }
  if (field.startsWith("appointment.")) {
    if (field === "appointment.status" || field === "appointment.date") return field === "appointment.status" ? context.event.payload.status : context.event.payload.start_time;
    const query = supabaseAdmin.from("appointments").select("id, reason, provider_id").eq("patient_id", patientId).gt("start_time", new Date().toISOString()).not("status", "in", '("cancelled","no_show")');
    if (field === "appointment.future_same_service_exists" && context.event.payload.service) query.eq("reason", context.event.payload.service);
    if (field === "appointment.future_same_practitioner_exists" && context.event.payload.provider_id) query.eq("provider_id", context.event.payload.provider_id);
    const { data } = await query.limit(1);
    return Boolean(data?.length);
  }
  if (field.startsWith("treatment.")) {
    if (context.event.subjectType === "appointment" && ["treatment.name", "treatment.category"].includes(field)) {
      const treatment = await appointmentTreatment(context);
      if (field === "treatment.name") {
        const expectsServiceId = typeof expected === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(expected);
        return expectsServiceId ? treatment.serviceIds : treatment.names;
      }
      return treatment.categories;
    }
    let query = supabaseAdmin.from("patient_treatments").select("treatment_name, treatment_category, performed_at", { count: "exact" }).eq("patient_id", patientId).in("status", ["performed", "completed"]);
    const configuredName = typeof expected === "string" && expected ? expected : context.event.payload.treatment_name;
    if (configuredName && !["treatment.name", "treatment.category"].includes(field)) query = query.eq("treatment_name", configuredName);
    const { data, count } = await query.order("performed_at", { ascending: false });
    if (field === "treatment.count") return count || 0;
    if (field === "treatment.last_date") return data?.[0]?.performed_at ?? null;
    if (field === "treatment.never_performed") return !data?.length;
    if (field === "treatment.already_performed") return Boolean(data?.length);
    if (field === "treatment.name") {
      const expectsServiceId = typeof expected === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(expected);
      return expectsServiceId ? context.event.payload.service_id : context.event.payload.treatment_name;
    }
    return context.event.payload.treatment_category;
  }
  if (field.startsWith("billing.")) {
    const { data } = await supabaseAdmin.from("invoices").select("total_amount, paid_amount, status, due_date").eq("patient_id", patientId);
    if (field === "billing.total_spent" || field === "billing.revenue") return (data || []).reduce((sum, invoice) => sum + Number(invoice.paid_amount || 0), 0);
    if (field === "billing.invoice_paid") return (data || []).some((invoice) => invoice.status === "paid" || Number(invoice.paid_amount) >= Number(invoice.total_amount));
    if (field === "billing.invoice_overdue") return (data || []).some((invoice) => invoice.due_date && new Date(invoice.due_date) < new Date() && invoice.status !== "paid");
    return Boolean(context.event.payload.deposit_paid);
  }
  if (field.startsWith("consultation.")) {
    if (field === "consultation.type") return context.event.payload.consultation_type || context.event.payload.record_type || context.event.payload.title;
    if (field === "consultation.completed") return ["consultation_completed", "consultation_without_treatment"].includes(context.event.type);
    if (field === "consultation.surgery_booked") {
      const { count } = await supabaseAdmin.from("patient_surgeries").select("id", { count: "exact", head: true }).eq("patient_id", patientId).in("status", ["scheduled", "completed"]); return Boolean(count);
    }
    if (field === "consultation.treatment_booked") {
      const { count } = await supabaseAdmin.from("appointments").select("id", { count: "exact", head: true }).eq("patient_id", patientId).gt("start_time", new Date().toISOString()).not("status", "in", '("cancelled","no_show")'); return Boolean(count);
    }
    if (field === "consultation.quote_accepted") {
      const { count } = await supabaseAdmin.from("patient_quotes").select("id", { count: "exact", head: true }).eq("patient_id", patientId).eq("status", "accepted"); return Boolean(count);
    }
  }
  if (field.startsWith("history.")) {
    if (field === "history.workflow_already_completed") {
      const { count } = await supabaseAdmin.from("workflow_runs_v2").select("id", { count: "exact", head: true }).eq("workflow_id", context.workflowId).eq("patient_id", patientId).eq("status", "completed").neq("id", context.runId);
      return Boolean(count);
    }
    const { data } = await supabaseAdmin.from("emails").select("sent_at, subject").eq("patient_id", patientId).eq("status", "sent").order("sent_at", { ascending: false });
    if (field === "history.email_already_sent") return Boolean(data?.length);
    if (field === "history.email_never_sent") return !data?.length;
    return data?.[0]?.sent_at ?? null;
  }
  return context.event.payload[field] ?? null;
}

function compare(actual: unknown, operator: string, expected: unknown) {
  if (Array.isArray(actual)) {
    if (operator === "is_empty") return actual.length === 0;
    if (operator === "is_not_empty") return actual.length > 0;
    if (operator === "equals") return actual.some((value) => String(value ?? "").toLowerCase() === String(expected ?? "").toLowerCase());
    if (operator === "not_equals") return actual.every((value) => String(value ?? "").toLowerCase() !== String(expected ?? "").toLowerCase());
    if (operator === "contains") return actual.some((value) => String(value ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase()));
  }
  if (operator === "is_empty") return actual === null || actual === undefined || actual === "";
  if (operator === "is_not_empty") return actual !== null && actual !== undefined && actual !== "";
  if (operator === "is_true") return actual === true;
  if (operator === "is_false") return actual === false;
  if (operator === "equals") return String(actual ?? "").toLowerCase() === String(expected ?? "").toLowerCase();
  if (operator === "not_equals") return String(actual ?? "").toLowerCase() !== String(expected ?? "").toLowerCase();
  if (operator === "contains") return String(actual ?? "").toLowerCase().includes(String(expected ?? "").toLowerCase());
  if (operator === "in_last" || operator === "not_in_last") {
    const timestamp = actual ? new Date(String(actual)).getTime() : Number.NaN;
    const inside = Number.isFinite(timestamp) && timestamp >= Date.now() - Number(expected || 0) * 86_400_000;
    return operator === "in_last" ? inside : !inside;
  }
  const left = actual instanceof Date ? actual.getTime() : typeof actual === "string" && !Number.isNaN(Date.parse(actual)) ? Date.parse(actual) : Number(actual);
  const right = expected instanceof Date ? expected.getTime() : typeof expected === "string" && !Number.isNaN(Date.parse(expected)) ? Date.parse(expected) : Number(expected);
  if (operator === "greater_than" || operator === "after") return left > right;
  if (operator === "greater_than_or_equal") return left >= right;
  if (operator === "less_than" || operator === "before") return left < right;
  if (operator === "less_than_or_equal") return left <= right;
  return false;
}

export async function evaluateCondition(expression: ConditionExpression, context: RunContext): Promise<{ matched: boolean; details: unknown }> {
  if (expression.kind === "rule") {
    const actual = await resolveField(expression.field, context, expression.value);
    const expected = expression.field === "patient.custom_property" && typeof expression.value === "object" && expression.value
      ? (expression.value as Record<string, unknown>).value
      : expression.field === "patient.custom_property" && typeof expression.value === "string" && expression.value.includes("=")
        ? expression.value.slice(expression.value.indexOf("=") + 1) : expression.value;
    return { matched: compare(actual, expression.operator, expected), details: { field: expression.field, operator: expression.operator, expected, actual } };
  }
  if (expression.kind === "not") {
    const child = await evaluateCondition(expression.child, context);
    return { matched: !child.matched, details: { not: child.details } };
  }
  const children = await Promise.all(expression.children.map((child) => evaluateCondition(child, context)));
  return { matched: expression.operator === "and" ? children.every((child) => child.matched) : children.some((child) => child.matched), details: children.map((child) => child.details) };
}
