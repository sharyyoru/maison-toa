"use client";

import type { ConditionExpression, ConditionOperator, WorkflowTriggerType } from "@/lib/workflows/types";
import { CONDITION_FIELDS } from "@/lib/workflows/catalog";

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  ["equals", "Equals"], ["not_equals", "Does not equal"], ["contains", "Contains"],
  ["greater_than", "Greater than"], ["greater_than_or_equal", "At least"], ["less_than", "Less than"],
  ["less_than_or_equal", "At most"], ["is_empty", "Is empty"], ["is_not_empty", "Is not empty"],
  ["is_true", "Is true"], ["is_false", "Is false"], ["before", "Before"], ["after", "After"],
  ["in_last", "In the last (days)"], ["not_in_last", "Not in the last (days)"],
].map(([value, label]) => ({ value: value as ConditionOperator, label }));

const emptyRule = (): ConditionExpression => ({ kind: "rule", field: "patient.email", operator: "is_not_empty" });

const CONDITION_FIELD_GROUPS = [
  { prefix: "patient.", label: "Patient" },
  { prefix: "appointment.", label: "Appointment" },
  { prefix: "treatment.", label: "Treatment" },
  { prefix: "consultation.", label: "Consultation" },
  { prefix: "billing.", label: "Billing" },
  { prefix: "history.", label: "Workflow history" },
].map((group) => ({
  ...group,
  fields: CONDITION_FIELDS.filter((field) => field.value.startsWith(group.prefix)),
}));

const APPOINTMENT_TRIGGERS = new Set<WorkflowTriggerType>([
  "appointment_created", "appointment_status_changed", "appointment_rescheduled",
  "appointment_cancelled", "appointment_completed", "appointment_no_show", "appointment_confirmed",
]);
const CONSULTATION_TRIGGERS = new Set<WorkflowTriggerType>([
  "consultation_started", "consultation_completed", "consultation_without_treatment",
]);
const TREATMENT_TRIGGERS = new Set<WorkflowTriggerType>([
  "treatment_performed", "treatment_completed", "treatment_category_completed",
]);
const DEPOSIT_TRIGGERS = new Set<WorkflowTriggerType>([
  "deposit_requested", "deposit_paid", "deposit_refunded",
]);

const BOOLEAN_FIELDS = new Set([
  "patient.vip", "patient.marketing_consent", "patient.social_media_consent",
  "appointment.future_exists", "appointment.future_same_service_exists",
  "appointment.future_same_practitioner_exists", "treatment.already_performed",
  "treatment.never_performed", "consultation.completed", "consultation.surgery_booked",
  "consultation.treatment_booked", "consultation.quote_accepted", "billing.deposit_paid",
  "billing.invoice_paid", "billing.invoice_overdue", "history.email_already_sent",
  "history.email_never_sent", "history.workflow_already_completed",
]);

function fieldAvailableForTrigger(field: string, triggerType?: WorkflowTriggerType) {
  if (!triggerType) return false;
  if (["appointment.status", "appointment.date", "appointment.future_same_service_exists", "appointment.future_same_practitioner_exists"].includes(field)) {
    return APPOINTMENT_TRIGGERS.has(triggerType);
  }
  if (["treatment.name", "treatment.category"].includes(field)) {
    return TREATMENT_TRIGGERS.has(triggerType) || APPOINTMENT_TRIGGERS.has(triggerType);
  }
  if (["consultation.type", "consultation.completed"].includes(field)) return CONSULTATION_TRIGGERS.has(triggerType);
  if (field === "billing.deposit_paid") return DEPOSIT_TRIGGERS.has(triggerType);
  return true;
}

type ServiceOption = { id: string; name: string };

export default function ConditionExpressionEditor({ expression, onChange, onRemove, serviceOptions = [], triggerType, depth = 0 }: {
  expression: ConditionExpression;
  onChange: (expression: ConditionExpression) => void;
  onRemove?: () => void;
  serviceOptions?: ServiceOption[];
  triggerType?: WorkflowTriggerType;
  depth?: number;
}) {
  const wrapNot = () => onChange({ kind: "not", child: expression });
  if (expression.kind === "not") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-rose-700">NOT</span><button type="button" className="text-xs text-rose-700 underline" onClick={() => onChange(expression.child)}>Remove NOT</button></div>
        <ConditionExpressionEditor expression={expression.child} onChange={(child) => onChange({ kind: "not", child })} onRemove={onRemove} serviceOptions={serviceOptions} triggerType={triggerType} depth={depth + 1} />
      </div>
    );
  }
  if (expression.kind === "group") {
    return (
      <div className="space-y-2 rounded-lg border border-purple-200 bg-purple-50/50 p-2">
        <div className="flex items-center gap-2">
          <select value={expression.operator} onChange={(event) => onChange({ ...expression, operator: event.target.value as "and" | "or" })} className="rounded border border-purple-200 bg-white px-2 py-1 text-xs font-semibold uppercase text-purple-800"><option value="and">AND</option><option value="or">OR</option></select>
          <button type="button" className="text-xs text-slate-600 underline" onClick={wrapNot}>Wrap in NOT</button>
          {onRemove && <button type="button" className="ml-auto text-xs text-red-600" onClick={onRemove}>Remove group</button>}
        </div>
        {expression.children.map((child, index) => (
          <ConditionExpressionEditor key={index} expression={child} depth={depth + 1} serviceOptions={serviceOptions} triggerType={triggerType} onChange={(next) => onChange({ ...expression, children: expression.children.map((item, childIndex) => childIndex === index ? next : item) })} onRemove={() => onChange({ ...expression, children: expression.children.filter((_, childIndex) => childIndex !== index) })} />
        ))}
        <div className="flex gap-2">
          <button type="button" className="rounded border border-purple-200 bg-white px-2 py-1 text-xs text-purple-700" onClick={() => onChange({ ...expression, children: [...expression.children, emptyRule()] })}>+ Rule</button>
          {depth < 3 && <button type="button" className="rounded border border-purple-200 bg-white px-2 py-1 text-xs text-purple-700" onClick={() => onChange({ ...expression, children: [...expression.children, { kind: "group", operator: "and", children: [emptyRule()] }] })}>+ Group</button>}
        </div>
      </div>
    );
  }
  const isTreatmentName = expression.field === "treatment.name";
  const isBooleanField = BOOLEAN_FIELDS.has(expression.field);
  const noValue = isBooleanField || ["is_empty", "is_not_empty", "is_true", "is_false"].includes(expression.operator);
  const availableOperators = isBooleanField
    ? OPERATORS.filter(({ value }) => ["is_true", "is_false"].includes(value))
    : isTreatmentName
    ? OPERATORS.filter(({ value }) => ["equals", "not_equals", "is_empty", "is_not_empty"].includes(value))
    : OPERATORS;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
      <select value={expression.field} onChange={(event) => {
        const field = event.target.value;
        onChange(BOOLEAN_FIELDS.has(field)
          ? { ...expression, field, operator: "is_true", value: undefined }
          : field === "treatment.name"
          ? { ...expression, field, operator: "equals", value: "" }
          : { ...expression, field, value: undefined });
      }} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs">
        {CONDITION_FIELD_GROUPS.map((group) => {
          const fields = group.fields.filter((field) => fieldAvailableForTrigger(field.value, triggerType));
          return fields.length > 0 && (
            <optgroup key={group.prefix} label={group.label}>
              {fields.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
            </optgroup>
          );
        })}
      </select>
      <div className="flex gap-2">
        <select value={expression.operator} onChange={(event) => onChange({ ...expression, operator: event.target.value as ConditionOperator })} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs">{availableOperators.map((operator) => <option key={operator.value} value={operator.value}>{operator.label}</option>)}</select>
        {!noValue && isTreatmentName && (
          <select value={String(expression.value ?? "")} onChange={(event) => onChange({ ...expression, value: event.target.value })} className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs">
            <option value="">Select service...</option>
            {serviceOptions.map((service) => <option key={service.id} value={service.id}>{service.name}</option>)}
          </select>
        )}
        {!noValue && !isTreatmentName && <input value={String(expression.value ?? "")} onChange={(event) => onChange({ ...expression, value: event.target.value })} placeholder="Value" className="min-w-0 flex-1 rounded border border-slate-200 px-2 py-1.5 text-xs" />}
      </div>
      {isTreatmentName && serviceOptions.length === 0 && <p className="text-[10px] text-amber-700">No active services are available.</p>}
      <div className="flex justify-between"><button type="button" className="text-[10px] text-slate-500 underline" onClick={wrapNot}>Wrap in NOT</button>{onRemove && <button type="button" className="text-[10px] text-red-600" onClick={onRemove}>Remove</button>}</div>
    </div>
  );
}
