export type WorkflowNodeKind = "trigger" | "condition" | "delay" | "action" | "exit";
export type WorkflowBranch = "next" | "yes" | "no";
export type WorkflowStatus = "draft" | "published" | "archived";
export type WorkflowRunStatus = "queued" | "running" | "waiting" | "completed" | "failed" | "cancelled" | "stopped";

export type WorkflowTriggerType =
  | "deal_stage_changed" | "appointment_status_changed" | "form_submitted" | "task_completed" | "manual"
  | "patient_created" | "patient_updated" | "birthday" | "marketing_consent_changed"
  | "social_media_consent_changed" | "vip_activated" | "vip_removed"
  | "membership_purchased" | "membership_renewed" | "membership_expired"
  | "appointment_created" | "appointment_updated" | "appointment_rescheduled"
  | "appointment_cancelled" | "appointment_completed" | "appointment_no_show"
  | "appointment_confirmed" | "first_appointment" | "future_appointment_created"
  | "consultation_started" | "consultation_completed" | "consultation_without_treatment"
  | "quote_created" | "quote_accepted" | "quote_declined"
  | "treatment_performed" | "treatment_completed" | "treatment_category_completed"
  | "surgery_consultation_completed" | "surgery_scheduled" | "surgery_completed" | "surgery_cancelled"
  | "invoice_created" | "invoice_paid" | "invoice_overdue" | "deposit_requested"
  | "deposit_paid" | "deposit_refunded" | "package_purchased" | "package_completed"
  | "remaining_sessions" | "membership_activated";

export type WorkflowActionType =
  | "send_email" | "create_task" | "add_internal_note" | "add_tag" | "remove_tag"
  | "update_patient_property" | "notify_staff" | "stop_workflow"
  // Kept for existing definitions during the v2 migration.
  | "send_whatsapp" | "send_notification" | "update_task" | "create_deal"
  | "update_deal" | "update_patient" | "webhook";

export type ConditionOperator =
  | "equals" | "not_equals" | "contains" | "greater_than" | "greater_than_or_equal"
  | "less_than" | "less_than_or_equal" | "is_empty" | "is_not_empty" | "is_true"
  | "is_false" | "before" | "after" | "in_last" | "not_in_last";

export type ConditionExpression =
  | { kind: "rule"; field: string; operator: ConditionOperator; value?: unknown }
  | { kind: "group"; operator: "and" | "or"; children: ConditionExpression[] }
  | { kind: "not"; child: ConditionExpression };

type BaseNode<T extends WorkflowNodeKind, D> = {
  id: string;
  type: T;
  data: D;
};

export type TriggerNode = BaseNode<"trigger", {
  triggerType: WorkflowTriggerType;
  config: Record<string, unknown>;
}>;

export type ConditionNode = BaseNode<"condition", {
  expression: ConditionExpression;
  label?: string;
}>;

export type DelayNode = BaseNode<"delay", {
  value: number;
  unit: "minutes" | "hours" | "days" | "weeks" | "months";
  anchor?: "reached_at" | "event_time" | "appointment_time";
}>;

export type ActionNode = BaseNode<"action", {
  actionType: WorkflowActionType;
  config: Record<string, unknown>;
}>;

export type ExitNode = BaseNode<"exit", { reason?: string }>;
export type WorkflowGraphNode = TriggerNode | ConditionNode | DelayNode | ActionNode | ExitNode;

export type WorkflowGraphEdge = {
  id: string;
  source: string;
  target: string;
  branch: WorkflowBranch;
};

export type WorkflowGraph = {
  schemaVersion: 2;
  nodes: WorkflowGraphNode[];
  edges: WorkflowGraphEdge[];
};

export type WorkflowEvent = {
  id: string;
  type: WorkflowTriggerType;
  subjectType: string;
  subjectId: string;
  patientId?: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
};
