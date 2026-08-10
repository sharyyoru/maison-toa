import type { WorkflowActionType, WorkflowTriggerType } from "./types";

export type CatalogOption<T extends string> = {
  value: T;
  label: string;
  category: string;
  description: string;
};

const humanize = (value: string) => value.split("_").map((part) => part[0].toUpperCase() + part.slice(1)).join(" ");

const triggerGroups = {
  Patient: ["patient_created", "patient_updated", "birthday", "marketing_consent_changed", "social_media_consent_changed", "vip_activated", "vip_removed", "membership_purchased", "membership_renewed", "membership_expired"],
  Appointment: ["appointment_created", "appointment_updated", "appointment_rescheduled", "appointment_cancelled", "appointment_completed", "appointment_no_show", "appointment_confirmed", "first_appointment", "future_appointment_created"],
  Consultation: ["consultation_started", "consultation_completed", "consultation_without_treatment", "quote_created", "quote_accepted", "quote_declined"],
  Treatment: ["treatment_performed", "treatment_completed", "treatment_category_completed"],
  Surgery: ["surgery_consultation_completed", "surgery_scheduled", "surgery_completed", "surgery_cancelled"],
  Billing: ["invoice_created", "invoice_paid", "invoice_overdue", "deposit_requested", "deposit_paid", "deposit_refunded"],
  Package: ["package_purchased", "package_completed", "remaining_sessions"],
  Membership: ["membership_activated", "membership_renewed", "membership_expired"],
} satisfies Record<string, WorkflowTriggerType[]>;

const triggerOptions: CatalogOption<WorkflowTriggerType>[] = Object.entries(triggerGroups).flatMap(
  ([category, values]) => values.map((value) => ({ value, category, label: humanize(value), description: `When ${humanize(value).toLowerCase()}` })),
);
export const WORKFLOW_TRIGGERS = triggerOptions.filter((option, index) => triggerOptions.findIndex((candidate) => candidate.value === option.value) === index);

export const WORKFLOW_ACTIONS: CatalogOption<WorkflowActionType>[] = [
  ["send_email", "Send Email"], ["create_task", "Create Task"], ["add_internal_note", "Add Internal Note"],
  ["add_tag", "Add Tag"], ["remove_tag", "Remove Tag"], ["update_patient_property", "Update Patient Property"],
  ["notify_staff", "Notify Staff"], ["stop_workflow", "Stop Workflow"],
].map(([value, label]) => ({ value: value as WorkflowActionType, label, category: "Action", description: label }));

export const CONDITION_FIELDS = [
  "patient.gender", "patient.age", "patient.language", "patient.country", "patient.vip", "patient.membership",
  "patient.marketing_consent", "patient.social_media_consent", "patient.email", "appointment.status",
  "appointment.date", "appointment.future_exists", "appointment.future_same_service_exists",
  "appointment.future_same_practitioner_exists", "treatment.name", "treatment.category",
  "treatment.already_performed", "treatment.never_performed", "treatment.last_date", "treatment.count",
  "consultation.type", "consultation.completed", "consultation.surgery_booked", "consultation.treatment_booked",
  "consultation.quote_accepted", "billing.revenue", "billing.total_spent", "billing.deposit_paid",
  "billing.invoice_paid", "billing.invoice_overdue", "history.email_already_sent", "history.email_never_sent",
  "history.last_email_sent", "history.workflow_already_completed", "patient.custom_property",
].map((value) => ({ value, label: humanize(value.replace(".", " ")) }));
