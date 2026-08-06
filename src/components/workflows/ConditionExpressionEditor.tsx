"use client";

import type { ConditionExpression, ConditionOperator } from "@/lib/workflows/types";
import { CONDITION_FIELDS } from "@/lib/workflows/catalog";

const OPERATORS: { value: ConditionOperator; label: string }[] = [
  ["equals", "Equals"], ["not_equals", "Does not equal"], ["contains", "Contains"],
  ["greater_than", "Greater than"], ["greater_than_or_equal", "At least"], ["less_than", "Less than"],
  ["less_than_or_equal", "At most"], ["is_empty", "Is empty"], ["is_not_empty", "Is not empty"],
  ["is_true", "Is true"], ["is_false", "Is false"], ["before", "Before"], ["after", "After"],
  ["in_last", "In the last (days)"], ["not_in_last", "Not in the last (days)"],
].map(([value, label]) => ({ value: value as ConditionOperator, label }));

const emptyRule = (): ConditionExpression => ({ kind: "rule", field: "patient.email", operator: "is_not_empty" });

type ServiceOption = { id: string; name: string };

export default function ConditionExpressionEditor({ expression, onChange, onRemove, serviceOptions = [], depth = 0 }: {
  expression: ConditionExpression;
  onChange: (expression: ConditionExpression) => void;
  onRemove?: () => void;
  serviceOptions?: ServiceOption[];
  depth?: number;
}) {
  const wrapNot = () => onChange({ kind: "not", child: expression });
  if (expression.kind === "not") {
    return (
      <div className="rounded-lg border border-rose-200 bg-rose-50 p-2">
        <div className="mb-2 flex items-center justify-between"><span className="text-xs font-bold text-rose-700">NOT</span><button type="button" className="text-xs text-rose-700 underline" onClick={() => onChange(expression.child)}>Remove NOT</button></div>
        <ConditionExpressionEditor expression={expression.child} onChange={(child) => onChange({ kind: "not", child })} onRemove={onRemove} serviceOptions={serviceOptions} depth={depth + 1} />
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
          <ConditionExpressionEditor key={index} expression={child} depth={depth + 1} serviceOptions={serviceOptions} onChange={(next) => onChange({ ...expression, children: expression.children.map((item, childIndex) => childIndex === index ? next : item) })} onRemove={() => onChange({ ...expression, children: expression.children.filter((_, childIndex) => childIndex !== index) })} />
        ))}
        <div className="flex gap-2">
          <button type="button" className="rounded border border-purple-200 bg-white px-2 py-1 text-xs text-purple-700" onClick={() => onChange({ ...expression, children: [...expression.children, emptyRule()] })}>+ Rule</button>
          {depth < 3 && <button type="button" className="rounded border border-purple-200 bg-white px-2 py-1 text-xs text-purple-700" onClick={() => onChange({ ...expression, children: [...expression.children, { kind: "group", operator: "and", children: [emptyRule()] }] })}>+ Group</button>}
        </div>
      </div>
    );
  }
  const noValue = ["is_empty", "is_not_empty", "is_true", "is_false"].includes(expression.operator);
  const isTreatmentName = expression.field === "treatment.name";
  const availableOperators = isTreatmentName
    ? OPERATORS.filter(({ value }) => ["equals", "not_equals", "is_empty", "is_not_empty"].includes(value))
    : OPERATORS;
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 bg-white p-2">
      <select value={expression.field} onChange={(event) => {
        const field = event.target.value;
        onChange(field === "treatment.name"
          ? { ...expression, field, operator: "equals", value: "" }
          : { ...expression, field, value: undefined });
      }} className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs">
        {CONDITION_FIELDS.map((field) => <option key={field.value} value={field.value}>{field.label}</option>)}
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
