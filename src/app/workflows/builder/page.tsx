"use client";

import React, { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import EmailTemplateBuilder from "@/components/EmailTemplateBuilder";
import UserSearchSelect from "@/components/UserSearchSelect";
import MultiUserSearchSelect from "@/components/MultiUserSearchSelect";
import { useAppointmentStatusOptions } from "@/lib/appointmentStatuses";
import WorkflowCanvas from "@/components/workflows/WorkflowCanvas";
import ConditionExpressionEditor from "@/components/workflows/ConditionExpressionEditor";
import type { ConditionExpression, WorkflowActionType, WorkflowTriggerType } from "@/lib/workflows/types";
import { WORKFLOW_ACTIONS, WORKFLOW_TRIGGERS, CONDITION_FIELDS as V2_CONDITION_FIELDS } from "@/lib/workflows/catalog";

// Types
type TriggerType = WorkflowTriggerType;

type ActionType = WorkflowActionType | "delay";

type ConditionOperator = "equals" | "not_equals" | "contains" | "greater_than" | "less_than" | "is_empty" | "is_not_empty";

type WorkflowNode = {
  id: string;
  type: "trigger" | "action" | "condition" | "delay" | "exit";
  data: TriggerNodeData | ActionNodeData | ConditionNodeData | DelayNodeData | ExitNodeData;
  nextNodeId?: string | null;
  trueBranchId?: string | null;
  falseBranchId?: string | null;
};

type TriggerNodeData = {
  triggerType: TriggerType;
  config: Record<string, unknown>;
};

type ActionNodeData = {
  actionType: ActionType;
  config: Record<string, unknown>;
};

type ConditionNodeData = {
  expression?: ConditionExpression;
  field: string;
  operator: ConditionOperator;
  value: string;
  selectedServices?: string[];
  serviceMatchMode?: "includes" | "excludes";
};

type DelayNodeData = {
  delayType: "minutes" | "hours" | "days" | "weeks" | "months" | "until_time";
  delayValue: number;
  delayAnchor?: "trigger_time" | "appointment_time";
  delayTime?: string;
};

type ExitNodeData = { reason?: string };

type DealStage = {
  id: string;
  name: string;
  type: string;
  sort_order: number;
};

// Trigger definitions
const TRIGGER_OPTIONS: { value: TriggerType; label: string; description: string; icon: string }[] = [
  { value: "deal_stage_changed", label: "Deal Stage Changed", description: "When a deal moves to a specific stage", icon: "📊" },
  { value: "patient_created", label: "Patient Created", description: "When a new patient is added", icon: "👤" },
  { value: "appointment_created", label: "Appointment Created", description: "When an appointment is scheduled", icon: "📅" },
  { value: "appointment_status_changed", label: "Appointment Status Changed", description: "When an appointment moves to a specific status", icon: "🔄" },
  { value: "appointment_completed", label: "Appointment Completed", description: "When an appointment is marked complete", icon: "✅" },
  { value: "form_submitted", label: "Form Submitted", description: "When a lead form is submitted", icon: "📝" },
  { value: "task_completed", label: "Task Completed", description: "When a task is marked complete", icon: "☑️" },
  { value: "manual", label: "Manual Trigger", description: "Triggered manually by user", icon: "🖱️" },
  ...WORKFLOW_TRIGGERS
    .filter((option) => !["patient_created", "appointment_created", "appointment_completed"].includes(option.value))
    .map((option) => ({ value: option.value, label: option.label, description: option.description, icon: "⚡" })),
];

// Action definitions
const ACTION_OPTIONS: { value: ActionType; label: string; description: string; icon: string; color: string }[] = [
  { value: "send_email", label: "Send Email", description: "Send an email to patient or staff", icon: "📧", color: "emerald" },
  { value: "send_whatsapp", label: "Send WhatsApp", description: "Send a WhatsApp message via deal owner's session", icon: "💬", color: "green" },
  { value: "send_notification", label: "Send Notification", description: "Send in-app notification to user", icon: "🔔", color: "blue" },
  { value: "create_task", label: "Create Task", description: "Create a new task for a user", icon: "📋", color: "purple" },
  { value: "update_task", label: "Update Task", description: "Update an existing task", icon: "✏️", color: "purple" },
  { value: "create_deal", label: "Create Deal", description: "Create a new deal for patient", icon: "💼", color: "amber" },
  { value: "update_deal", label: "Update Deal", description: "Update deal stage or properties", icon: "📈", color: "amber" },
  { value: "update_patient", label: "Update Patient", description: "Update patient information", icon: "👤", color: "cyan" },
  { value: "webhook", label: "Send Webhook", description: "Send data to external URL", icon: "🌐", color: "slate" },
  { value: "delay", label: "Add Delay", description: "Wait before next action", icon: "⏰", color: "orange" },
  ...WORKFLOW_ACTIONS
    .filter((option) => !["send_email", "create_task", "send_notification", "update_patient"].includes(option.value))
    .map((option) => ({ value: option.value, label: option.label, description: option.description, icon: "⚡", color: "emerald" })),
];

const CONDITION_FIELDS = [
  { value: "patient.email", label: "Patient Email" },
  { value: "patient.phone", label: "Patient Phone" },
  { value: "patient.source", label: "Patient Source" },
  { value: "deal.pipeline", label: "Deal Pipeline" },
  { value: "deal.value", label: "Deal Value" },
  { value: "deal.stage", label: "Deal Stage" },
  { value: "deal.service", label: "Deal Service" },
  { value: "appointment.type", label: "Appointment Type" },
  { value: "appointment.status", label: "Appointment Status" },
  { value: "appointment.provider", label: "Appointment Provider" },
  ...V2_CONDITION_FIELDS.filter((option) => !["patient.email", "appointment.status"].includes(option.value)),
];

const CONDITION_OPERATORS: { value: ConditionOperator; label: string }[] = [
  { value: "equals", label: "Equals" },
  { value: "not_equals", label: "Does not equal" },
  { value: "contains", label: "Contains" },
  { value: "greater_than", label: "Greater than" },
  { value: "less_than", label: "Less than" },
  { value: "is_empty", label: "Is empty" },
  { value: "is_not_empty", label: "Is not empty" },
];

function generateId(): string {
  return `node_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

export default function WorkflowBuilderPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("id");

  const [workflowName, setWorkflowName] = useState("New Workflow");
  const [workflowActive, setWorkflowActive] = useState(true);
  const [originalWorkflowActive, setOriginalWorkflowActive] = useState(false);
  const [nodes, setNodes] = useState<WorkflowNode[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [showEmailBuilder, setShowEmailBuilder] = useState(false);
  const [emailTemplates, setEmailTemplates] = useState<{ id: string; name: string; subject_template: string; html_content?: string | null }[]>([]);
  const [editingEmailNodeId, setEditingEmailNodeId] = useState<string | null>(null);
  const [previewEmailHtml, setPreviewEmailHtml] = useState<string | null>(null);
  const [previewEmailSubject, setPreviewEmailSubject] = useState<string | null>(null);
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [treatmentServices, setTreatmentServices] = useState<{ id: string; name: string }[]>([]);
  const appointmentStatuses = useAppointmentStatusOptions();

  // Load stages and email templates
  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        
        const [stagesRes, templatesRes, treatmentServicesRes] = await Promise.all([
          supabaseClient.from("deal_stages").select("id, name, type, sort_order").order("sort_order"),
          supabaseClient.from("email_templates").select("id, name, subject_template, html_content").order("created_at", { ascending: false }),
          supabaseClient.from("services").select("id, name").eq("is_active", true).order("name"),
        ]);

        if (stagesRes.data) setStages(stagesRes.data);
        if (templatesRes.data) setEmailTemplates(templatesRes.data);
        if (treatmentServicesRes.data) setTreatmentServices(treatmentServicesRes.data);

        // Load services from Hubspot category
        const { data: categoryData } = await supabaseClient
          .from("service_categories")
          .select("id")
          .eq("name", "Hubspot")
          .single();

        if (categoryData) {
          const { data: servicesData } = await supabaseClient
            .from("services")
            .select("id, name")
            .eq("category_id", categoryData.id)
            .order("name");
          if (servicesData) setServices(servicesData);
        }

        // Load existing workflow if editing
        if (editId) {
          const { data: sessionData } = await supabaseClient.auth.getSession();
          const response = await fetch(`/api/workflows/v2/${editId}`, {
            headers: { Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
          });
          const workflow = response.ok ? await response.json() : null;

          if (workflow) {
            setWorkflowName(workflow.name);
            setWorkflowActive(workflow.active);
            setOriginalWorkflowActive(workflow.active);
            
            // Parse nodes from config
            const loadedNodes = workflow.nodes as WorkflowNode[] | undefined;
            if (loadedNodes) {
              setNodes(loadedNodes);
            }
          }
        } else {
          // Initialize with default trigger node
          setNodes([
            {
              id: generateId(),
              type: "trigger",
              data: {
                triggerType: "deal_stage_changed",
                config: {},
              } as TriggerNodeData,
            },
          ]);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load data");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, [editId]);

  const selectedNode = nodes.find((n) => n.id === selectedNodeId);

  // Add new node after a specific node
  const addNodeAfter = useCallback((afterNodeId: string, nodeType: "action" | "condition" | "delay" | "exit", branch: "next" | "yes" | "no" = "next") => {
    const newNodeId = generateId();
    let newNode: WorkflowNode;

    if (nodeType === "action") {
      newNode = {
        id: newNodeId,
        type: "action",
        data: {
          actionType: "send_email",
          config: {},
        } as ActionNodeData,
      };
    } else if (nodeType === "condition") {
      newNode = {
        id: newNodeId,
        type: "condition",
        data: {
          expression: { kind: "group", operator: "and", children: [{ kind: "rule", field: "patient.email", operator: "is_not_empty" }] },
          field: "patient.email",
          operator: "is_not_empty",
          value: "",
        } as ConditionNodeData,
      };
    } else if (nodeType === "delay") {
      newNode = {
        id: newNodeId,
        type: "delay",
        data: {
          delayType: "hours",
          delayValue: 1,
          delayAnchor: "trigger_time",
        } as DelayNodeData,
      };
    } else {
      newNode = {
        id: newNodeId,
        type: "exit",
        data: { reason: "Workflow completed" } as ExitNodeData,
      };
    }

    setNodes((prev) => {
      const updated = [...prev];
      const afterIndex = updated.findIndex((n) => n.id === afterNodeId);
      if (afterIndex !== -1) {
        const pointer = branch === "yes" ? "trueBranchId" : branch === "no" ? "falseBranchId" : "nextNodeId";
        const currentNextId = updated[afterIndex][pointer];
        updated[afterIndex] = { ...updated[afterIndex], [pointer]: newNodeId };
        newNode.nextNodeId = currentNextId;
        updated.splice(afterIndex + 1, 0, newNode);
      } else {
        updated.push(newNode);
      }
      return updated;
    });

    setSelectedNodeId(newNodeId);
  }, []);

  // Delete a node
  const deleteNode = useCallback((nodeId: string) => {
    setNodes((prev) => {
      const nodeToDelete = prev.find((n) => n.id === nodeId);
      if (!nodeToDelete || nodeToDelete.type === "trigger") return prev;

      // Find the node that points to this one
      const parentNode = prev.find((n) => n.nextNodeId === nodeId || n.trueBranchId === nodeId || n.falseBranchId === nodeId);
      
      const updated = prev.filter((n) => n.id !== nodeId);
      
      // Update parent node to point to the deleted node's next
      if (parentNode) {
        const parentIndex = updated.findIndex((n) => n.id === parentNode.id);
        if (parentIndex !== -1) {
          if (parentNode.nextNodeId === nodeId) {
            updated[parentIndex] = { ...updated[parentIndex], nextNodeId: nodeToDelete.nextNodeId };
          } else if (parentNode.trueBranchId === nodeId) {
            updated[parentIndex] = { ...updated[parentIndex], trueBranchId: nodeToDelete.nextNodeId };
          } else if (parentNode.falseBranchId === nodeId) {
            updated[parentIndex] = { ...updated[parentIndex], falseBranchId: nodeToDelete.nextNodeId };
          }
        }
      }
      
      return updated;
    });
    setSelectedNodeId(null);
  }, []);

  // Update node data
  const updateNodeData = useCallback((nodeId: string, data: Partial<WorkflowNode["data"]>) => {
    setNodes((prev) =>
      prev.map((n) =>
        n.id === nodeId ? { ...n, data: { ...n.data, ...data } } : n
      )
    );
  }, []);

  // Save workflow
  const handleSave = async (publish: boolean) => {
    if (!workflowName.trim()) {
      setError("Please enter a workflow name");
      return;
    }

    const triggerNode = nodes.find((n) => n.type === "trigger");
    if (!triggerNode) {
      setError("Workflow must have a trigger");
      return;
    }
    const triggerData = triggerNode.data as TriggerNodeData;
    if (triggerData.triggerType === "appointment_status_changed") {
      const config = triggerData.config as {
        appointment_status?: string;
        appointment_statuses?: string[];
      };
      const selectedStatuses = config.appointment_statuses?.length
        ? config.appointment_statuses
        : config.appointment_status
          ? [config.appointment_status]
          : [];
      if (selectedStatuses.length === 0) {
        setError("Please select at least one appointment status");
        return;
      }
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      const currentTriggerConfig = triggerData.config as {
        only_future_appointments_from_activation_day?: boolean;
        future_appointments_activation_day?: string;
      };
      const restrictToFutureAppointments =
        currentTriggerConfig.only_future_appointments_from_activation_day === true;
      const activationDay = restrictToFutureAppointments && workflowActive
        ? (!originalWorkflowActive || !currentTriggerConfig.future_appointments_activation_day
            ? new Date().toLocaleDateString("en-CA", { timeZone: "Europe/Zurich" })
            : currentTriggerConfig.future_appointments_activation_day)
        : undefined;
      const savedTriggerConfig = {
        ...triggerData.config,
        future_appointments_activation_day: activationDay,
      };
      const savedNodes = nodes.map((node) =>
        node.id === triggerNode.id
          ? {
              ...node,
              data: {
                ...triggerData,
                config: savedTriggerConfig,
              },
            }
          : node
      );

      const workflowData = {
        name: workflowName,
        trigger_type: (triggerNode.data as TriggerNodeData).triggerType,
        active: workflowActive,
        config: {
          nodes: savedNodes,
          ...savedTriggerConfig,
        },
      };

      const { data: sessionData } = await supabaseClient.auth.getSession();
      const response = await fetch(editId ? `/api/workflows/v2/${editId}` : "/api/workflows/v2", {
        method: editId ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${sessionData.session?.access_token || ""}` },
        body: JSON.stringify({ name: workflowData.name, active: workflowData.active, nodes: savedNodes, publish }),
      });
      const result = await response.json();
      if (!response.ok) {
        const details = Array.isArray(result.issues) ? ` ${result.issues.map((issue: { message: string }) => issue.message).join(" ")}` : "";
        throw new Error(`${result.error || "Failed to save workflow"}${details}`);
      }

      setSuccess(publish ? "Workflow published successfully!" : "Draft saved successfully!");
      setTimeout(() => router.push("/workflows"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  };

  // Render configuration panel based on selected node type
  const renderConfigPanel = () => {
    if (!selectedNode) {
      return (
        <div className="flex h-full items-center justify-center text-sm text-slate-500">
          Select a step to configure it
        </div>
      );
    }

    if (selectedNode.type === "trigger") {
      const data = selectedNode.data as TriggerNodeData;
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Configure Trigger</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Trigger Type</label>
            <select
              value={data.triggerType}
              onChange={(e) => updateNodeData(selectedNode.id, { triggerType: e.target.value as TriggerType, config: {} })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {TRIGGER_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {data.triggerType === "deal_stage_changed" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">When deal moves to stage</label>
              <select
                value={(data.config as { to_stage_id?: string }).to_stage_id || ""}
                onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, to_stage_id: e.target.value } })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Select stage...</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>
          )}

          {data.triggerType === "appointment_status_changed" && (
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">When appointment status</label>
                <select
                  value={(data.config as { appointment_status_match_mode?: string }).appointment_status_match_mode || "includes"}
                  onChange={(e) => updateNodeData(selectedNode.id, {
                    config: { ...data.config, appointment_status_match_mode: e.target.value },
                  })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="includes">is any of</option>
                  <option value="excludes">is not any of</option>
                </select>
              </div>
              <fieldset>
                <legend className="block text-sm font-medium text-slate-700 mb-1.5">Statuses</legend>
                <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">
                  {appointmentStatuses.map((status) => {
                    const config = data.config as {
                      appointment_status?: string;
                      appointment_statuses?: string[];
                    };
                    const selectedStatuses = config.appointment_statuses ?? (
                      config.appointment_status ? [config.appointment_status] : []
                    );
                    const isChecked = selectedStatuses.includes(status.name);
                    return (
                      <label
                        key={status.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {
                            const nextStatuses = isChecked
                              ? selectedStatuses.filter((name) => name !== status.name)
                              : [...selectedStatuses, status.name];
                            updateNodeData(selectedNode.id, {
                              config: {
                                ...data.config,
                                appointment_status: undefined,
                                appointment_statuses: nextStatuses,
                              },
                            });
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-sky-600"
                        />
                        <span>{status.emoji ? `${status.emoji} ` : ""}{status.name}</span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={Boolean(
                    (data.config as {
                      run_once_per_patient_per_day?: boolean;
                      run_once_per_appointment?: boolean;
                    }).run_once_per_patient_per_day ??
                    (data.config as { run_once_per_appointment?: boolean }).run_once_per_appointment
                  )}
                  onChange={(e) => updateNodeData(selectedNode.id, {
                    config: {
                      ...data.config,
                      run_once_per_patient_per_day: e.target.checked,
                      run_once_per_appointment: undefined,
                    },
                  })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-700">Run only once per patient per day</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    If a patient has multiple appointments on the same day, only the first match will run this workflow.
                  </span>
                </span>
              </label>
              <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3">
                <input
                  type="checkbox"
                  checked={Boolean(
                    (data.config as { only_future_appointments_from_activation_day?: boolean })
                      .only_future_appointments_from_activation_day
                  )}
                  onChange={(e) => updateNodeData(selectedNode.id, {
                    config: {
                      ...data.config,
                      only_future_appointments_from_activation_day: e.target.checked,
                    },
                  })}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-700">Future appointments only</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Only run for appointments scheduled on or after the day this workflow becomes active.
                  </span>
                </span>
              </label>
            </div>
          )}
        </div>
      );
    }

    if (selectedNode.type === "action") {
      const data = selectedNode.data as ActionNodeData;
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Configure Action</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Action Type</label>
            <select
              value={data.actionType}
              onChange={(e) => updateNodeData(selectedNode.id, { actionType: e.target.value as ActionType, config: {} })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {ACTION_OPTIONS.filter(a => a.value !== "delay").map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {data.actionType === "send_email" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message classification</label>
                <select value={(data.config as { classification?: string }).classification || "marketing"} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, classification: e.target.value } })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                  <option value="marketing">Marketing — consent required</option>
                  <option value="transactional">Transactional — operational message</option>
                </select>
              </div>
              {/* Email Type */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Type</label>
                <select
                  value={(data.config as { email_type?: string }).email_type || "custom"}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, email_type: e.target.value } })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="custom">Custom email</option>
                  <option value="appointment_confirmation">Booking confirmation (built-in)</option>
                  <option value="appointment_reminder">Appointment reminder (built-in)</option>
                  <option value="doctor_notification">Doctor notification (built-in)</option>
                </select>
                <p className="mt-1 text-[10px] text-slate-500">Built-in types reproduce the branded Maison Tóā appointment emails (FR/EN, salutation, reschedule/cancel links) and only work with the &quot;Appointment Created&quot; trigger.</p>
              </div>

              {((data.config as { email_type?: string }).email_type && (data.config as { email_type?: string }).email_type !== "custom") ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  The content, subject, and recipient of this email are generated automatically from the appointment details. Configure when it sends using <strong>Sending Behavior</strong> below.
                </div>
              ) : (
              <>
              {/* Email Template Selection */}
              <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 space-y-3">
                <label className="block text-xs font-semibold text-sky-800 uppercase tracking-wide">Email Template</label>
                <select
                  value={(data.config as { template_id?: string }).template_id || ""}
                  onChange={(e) => {
                    const templateId = e.target.value;
                    const template = emailTemplates.find(t => t.id === templateId);
                    updateNodeData(selectedNode.id, { 
                      config: { 
                        ...data.config, 
                        template_id: templateId,
                        subject: template?.subject_template || (data.config as { subject?: string }).subject
                      } 
                    });
                  }}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Select a template...</option>
                  {emailTemplates.map((template) => (
                    <option key={template.id} value={template.id}>{template.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingEmailNodeId(selectedNode.id);
                      setShowEmailBuilder(true);
                    }}
                    className="flex-1 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700"
                  >
                    📧 Open Email Builder
                  </button>
                  {(data.config as { template_id?: string }).template_id && (
                    <>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingEmailNodeId(selectedNode.id);
                          setShowEmailBuilder(true);
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          const templateId = (data.config as { template_id?: string }).template_id;
                          const template = emailTemplates.find(t => t.id === templateId);
                          if (template) {
                            setPreviewEmailSubject(template.subject_template || "No subject");
                            setPreviewEmailHtml(template.html_content || "<p>No content</p>");
                          }
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                      >
                        👁 Preview
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Send to</label>
                <select
                  value={(data.config as { recipient?: string }).recipient || "patient"}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, recipient: e.target.value } })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="patient">Patient (from trigger)</option>
                  <option value="appointment_patient">Patient (from appointment)</option>
                  <option value="deal_patient">Patient (from deal)</option>
                  <option value="assigned_user">Assigned Staff</option>
                  <option value="specific_user">Specific User</option>
                  <option value="specific_email">Specific Email Address</option>
                </select>
              </div>

              {(data.config as { recipient?: string }).recipient === "specific_user" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Select User</label>
                  <UserSearchSelect
                    value={(data.config as { user_id?: string }).user_id || ""}
                    onChange={(userId) => updateNodeData(selectedNode.id, { config: { ...data.config, user_id: userId } })}
                    placeholder="Search for a user..."
                  />
                </div>
              )}

              {(data.config as { recipient?: string }).recipient === "specific_email" && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Address</label>
                  <input
                    type="email"
                    value={(data.config as { email_address?: string }).email_address || ""}
                    onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, email_address: e.target.value } })}
                    placeholder="Enter email address..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Email Subject</label>
                <textarea
                  value={(data.config as { subject?: string }).subject || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, subject: e.target.value } })}
                  placeholder="Enter subject..."
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 resize-y"
                />
                <p className="mt-1 text-[10px] text-slate-500">Use {"{{patient.first_name}}"} etc. for variables</p>
              </div>
              </>
              )}

              {/* Sending Behavior */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Sending Behavior</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode !== "delay" && (data.config as { send_mode?: string }).send_mode !== "recurring" && (data.config as { send_mode?: string }).send_mode !== "reminder_before"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "immediate" } })}
                      className="h-4 w-4 text-sky-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Send immediately</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode === "delay"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "delay" } })}
                      className="h-4 w-4 text-sky-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Delay</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode === "recurring"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "recurring" } })}
                      className="h-4 w-4 text-sky-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Recurring</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode === "reminder_before"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "reminder_before" } })}
                      className="h-4 w-4 text-sky-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Before appointment</span>
                  </label>
                </div>

                {(data.config as { send_mode?: string }).send_mode === "delay" && (
                  <div className="flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      min="0"
                      value={(data.config as { delay_minutes?: number }).delay_minutes || 0}
                      onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, delay_minutes: parseInt(e.target.value) || 0 } })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                    />
                    <span className="text-slate-600">minutes after trigger</span>
                  </div>
                )}

                {(data.config as { send_mode?: string }).send_mode === "recurring" && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-600">Every</span>
                    <input
                      type="number"
                      min="1"
                      value={(data.config as { recurring_days?: number }).recurring_days || 1}
                      onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, recurring_days: parseInt(e.target.value) || 1 } })}
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                    />
                    <span className="text-slate-600">days,</span>
                    <input
                      type="number"
                      min="1"
                      value={(data.config as { recurring_times?: number }).recurring_times || 1}
                      onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, recurring_times: parseInt(e.target.value) || 1 } })}
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                    />
                    <span className="text-slate-600">occurrences</span>
                  </div>
                )}

                {(data.config as { send_mode?: string }).send_mode === "reminder_before" && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-slate-600">Send</span>
                      <input
                        type="number"
                        min="1"
                        value={(data.config as { before_value?: number }).before_value || 24}
                        onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, before_value: parseInt(e.target.value) || 1 } })}
                        className="w-20 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                      />
                      <select
                        value={(data.config as { before_unit?: string }).before_unit || "hours"}
                        onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, before_unit: e.target.value } })}
                        className="rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                      >
                        <option value="hours">hours</option>
                        <option value="days">days</option>
                      </select>
                      <span className="text-slate-600">before the appointment</span>
                    </div>
                    <p className="text-[10px] text-slate-500">Requires the &quot;Appointment Created&quot; trigger. Queued and sent by the scheduled-email job. Skipped if the appointment is sooner than this window.</p>
                  </div>
                )}
              </div>

            </>
          )}

          {data.actionType === "send_whatsapp" && (
            <>
              <div className="rounded-lg border border-green-200 bg-green-50 p-3 space-y-3">
                <label className="block text-xs font-semibold text-green-800 uppercase tracking-wide">WhatsApp Message</label>
                <p className="text-xs text-green-700">Messages will be sent via the deal owner&apos;s WhatsApp session to the patient&apos;s phone number.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message Template</label>
                <textarea
                  id={`wa_msg_${selectedNode.id}`}
                  value={(data.config as { message_template?: string }).message_template || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, message_template: e.target.value } })}
                  placeholder="Hi {{patient.first_name}}, we wanted to follow up on your inquiry..."
                  rows={4}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <p className="mt-1.5 mb-1 text-[10px] font-medium text-slate-500">Click to insert variable:</p>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { label: "First Name", value: "{{patient.first_name}}" },
                    { label: "Last Name", value: "{{patient.last_name}}" },
                    { label: "Phone", value: "{{patient.phone}}" },
                    { label: "Email", value: "{{patient.email}}" },
                    { label: "Deal Title", value: "{{deal.title}}" },
                    { label: "Deal Notes", value: "{{deal.notes}}" },
                    { label: "Pipeline", value: "{{deal.pipeline}}" },
                    { label: "From Stage", value: "{{from_stage}}" },
                    { label: "To Stage", value: "{{to_stage}}" },
                  ].map((v) => (
                    <button
                      key={v.value}
                      type="button"
                      onClick={() => {
                        const el = document.getElementById(`wa_msg_${selectedNode.id}`) as HTMLTextAreaElement | null;
                        const current = (data.config as { message_template?: string }).message_template || "";
                        if (el) {
                          const start = el.selectionStart ?? current.length;
                          const end = el.selectionEnd ?? current.length;
                          const updated = current.slice(0, start) + v.value + current.slice(end);
                          updateNodeData(selectedNode.id, { config: { ...data.config, message_template: updated } });
                          setTimeout(() => { el.focus(); el.setSelectionRange(start + v.value.length, start + v.value.length); }, 0);
                        } else {
                          updateNodeData(selectedNode.id, { config: { ...data.config, message_template: current + v.value } });
                        }
                      }}
                      className="inline-flex items-center rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[10px] font-medium text-green-700 hover:bg-green-100 hover:border-green-300 transition-colors"
                    >
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Sending Behavior */}
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-3">
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wide">Sending Behavior</label>
                <div className="flex flex-wrap gap-4">
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`whatsapp_send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode !== "delay" && (data.config as { send_mode?: string }).send_mode !== "recurring"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "immediate" } })}
                      className="h-4 w-4 text-green-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Send immediately</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`whatsapp_send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode === "delay"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "delay" } })}
                      className="h-4 w-4 text-green-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Delay</span>
                  </label>
                  <label className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`whatsapp_send_mode_${selectedNode.id}`}
                      checked={(data.config as { send_mode?: string }).send_mode === "recurring"}
                      onChange={() => updateNodeData(selectedNode.id, { config: { ...data.config, send_mode: "recurring" } })}
                      className="h-4 w-4 text-green-600 border-slate-300"
                    />
                    <span className="text-sm text-slate-700">Recurring</span>
                  </label>
                </div>

                {(data.config as { send_mode?: string }).send_mode === "delay" && (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-slate-600">Wait</span>
                    <input
                      type="number"
                      min="1"
                      value={(data.config as { delay_hours?: number }).delay_hours || 24}
                      onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, delay_hours: parseInt(e.target.value) || 24 } })}
                      className="w-20 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                    />
                    <span className="text-slate-600">hours after trigger</span>
                  </div>
                )}

                {(data.config as { send_mode?: string }).send_mode === "recurring" && (
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-slate-600">Every</span>
                    <input
                      type="number"
                      min="1"
                      value={(data.config as { recurring_days?: number }).recurring_days || 1}
                      onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, recurring_days: parseInt(e.target.value) || 1 } })}
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                    />
                    <span className="text-slate-600">days,</span>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={(data.config as { recurring_times?: number }).recurring_times || 3}
                      onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, recurring_times: Math.min(parseInt(e.target.value) || 3, 30) } })}
                      className="w-16 rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
                    />
                    <span className="text-slate-600">times (max 30)</span>
                  </div>
                )}
              </div>
            </>
          )}

          {data.actionType === "send_notification" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Notify User</label>
                <UserSearchSelect
                  value={(data.config as { user_id?: string }).user_id || ""}
                  onChange={(userId) => updateNodeData(selectedNode.id, { config: { ...data.config, user_id: userId } })}
                  placeholder="Search for a user..."
                  includeAssigned
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Message</label>
                <textarea
                  value={(data.config as { message?: string }).message || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, message: e.target.value } })}
                  placeholder="Notification message..."
                  rows={3}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <p className="mt-1 text-[10px] text-slate-500">Use {"{{patient.first_name}}"}, {"{{deal.title}}"} etc. for variables</p>
              </div>
            </>
          )}

          {data.actionType === "create_task" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Task Title</label>
                <input
                  type="text"
                  value={(data.config as { title?: string }).title || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, title: e.target.value } })}
                  placeholder="e.g., Follow up with {{patient.first_name}}"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
                <p className="mt-1 text-[10px] text-slate-500">Use {"{{patient.first_name}}"}, {"{{patient.last_name}}"}, {"{{deal.title}}"} for variables</p>
              </div>
              <div className="relative">
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Assign to</label>
                <MultiUserSearchSelect
                  value={(data.config as { assign_to_users?: string[] }).assign_to_users || []}
                  onChange={(userIds) => updateNodeData(selectedNode.id, { config: { ...data.config, assign_to_users: userIds } })}
                  assignmentMode={(data.config as { assignment_mode?: "all" | "round_robin" }).assignment_mode || "all"}
                  onAssignmentModeChange={(mode) => updateNodeData(selectedNode.id, { config: { ...data.config, assignment_mode: mode } })}
                  placeholder="Search for users..."
                  includeAssigned
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Due in (days)</label>
                <input
                  type="number"
                  min="0"
                  value={(data.config as { due_days?: number }).due_days || 1}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, due_days: parseInt(e.target.value) } })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id={`assign-deal-owner-${selectedNode.id}`}
                  checked={(data.config as { assign_deal_owner?: boolean }).assign_deal_owner || false}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, assign_deal_owner: e.target.checked } })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-500 focus:ring-sky-500"
                />
                <label htmlFor={`assign-deal-owner-${selectedNode.id}`} className="text-sm text-slate-700">
                  Also assign as deal owner
                </label>
              </div>
              <p className="text-[10px] text-slate-500 -mt-2">When enabled, the task assignee will also be set as the deal owner</p>
            </>
          )}

          {data.actionType === "update_deal" && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Move to stage</label>
              <select
                value={(data.config as { new_stage_id?: string }).new_stage_id || ""}
                onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, new_stage_id: e.target.value } })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                <option value="">Select stage...</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>{stage.name}</option>
                ))}
              </select>
            </div>
          )}

          {data.actionType === "webhook" && (
            <>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Webhook URL</label>
                <input
                  type="url"
                  value={(data.config as { url?: string }).url || ""}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, url: e.target.value } })}
                  placeholder="https://..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1.5">Method</label>
                <select
                  value={(data.config as { method?: string }).method || "POST"}
                  onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, method: e.target.value } })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="POST">POST</option>
                  <option value="GET">GET</option>
                  <option value="PUT">PUT</option>
                </select>
              </div>
            </>
          )}

          {data.actionType === "add_internal_note" && (
            <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Note</label><textarea rows={5} value={(data.config as { body?: string }).body || ""} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, body: e.target.value } })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="Supports {{patient.first_name}}" /></div>
          )}
          {(data.actionType === "add_tag" || data.actionType === "remove_tag") && (
            <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Tag name</label><input value={(data.config as { tag_name?: string }).tag_name || ""} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, tag_name: e.target.value } })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
          )}
          {data.actionType === "update_patient_property" && (
            <>
              <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Property key</label><input value={(data.config as { property_key?: string }).property_key || ""} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, property_key: e.target.value } })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" placeholder="follow_up_status" /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Value</label><input value={(data.config as { value?: string }).value || ""} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, value: e.target.value } })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
            </>
          )}
          {data.actionType === "notify_staff" && (
            <>
              <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Recipients</label><MultiUserSearchSelect value={(data.config as { recipient_user_ids?: string[] }).recipient_user_ids || []} onChange={(ids) => updateNodeData(selectedNode.id, { config: { ...data.config, recipient_user_ids: ids } })} assignmentMode="all" onAssignmentModeChange={() => undefined} placeholder="Search staff..." /></div>
              <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Title</label><input value={(data.config as { title?: string }).title || ""} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, title: e.target.value } })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
            </>
          )}
          {data.actionType === "stop_workflow" && (
            <div><label className="mb-1.5 block text-sm font-medium text-slate-700">Reason</label><input value={(data.config as { reason?: string }).reason || ""} onChange={(e) => updateNodeData(selectedNode.id, { config: { ...data.config, reason: e.target.value } })} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" /></div>
          )}
        </div>
      );
    }

    if (selectedNode.type === "condition") {
      const data = selectedNode.data as ConditionNodeData;
      if (data.expression) {
        return (
          <div className="space-y-4">
            <h3 className="font-semibold text-slate-900">Configure Decision</h3>
            <p className="text-xs text-slate-500">The Yes branch runs when this expression matches; otherwise the No branch runs.</p>
            <ConditionExpressionEditor expression={data.expression} serviceOptions={treatmentServices} onChange={(expression) => updateNodeData(selectedNode.id, { expression })} />
          </div>
        );
      }
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Configure Condition</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Field</label>
            <select
              value={data.field}
              onChange={(e) => updateNodeData(selectedNode.id, { field: e.target.value })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {CONDITION_FIELDS.map((f) => (
                <option key={f.value} value={f.value}>{f.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Operator</label>
            <select
              value={data.operator}
              onChange={(e) => updateNodeData(selectedNode.id, { operator: e.target.value as ConditionOperator })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              {CONDITION_OPERATORS.map((op) => (
                <option key={op.value} value={op.value}>{op.label}</option>
              ))}
            </select>
          </div>

          {!["is_empty", "is_not_empty"].includes(data.operator) && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Value</label>
              {data.field === "deal.stage" ? (
                <select
                  value={data.value}
                  onChange={(e) => updateNodeData(selectedNode.id, { value: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                >
                  <option value="">Select stage...</option>
                  {stages.map((stage) => (
                    <option key={stage.id} value={stage.name}>{stage.name}</option>
                  ))}
                </select>
              ) : data.field === "deal.service" ? (
                <div className="space-y-3">
                  {/* Service Match Mode */}
                  <div className="flex gap-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`service_match_${selectedNode.id}`}
                        checked={(data as any).serviceMatchMode !== "excludes"}
                        onChange={() => updateNodeData(selectedNode.id, { serviceMatchMode: "includes" })}
                        className="h-4 w-4 text-sky-600 border-slate-300"
                      />
                      <span className="text-sm text-slate-700">Is one of</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`service_match_${selectedNode.id}`}
                        checked={(data as any).serviceMatchMode === "excludes"}
                        onChange={() => updateNodeData(selectedNode.id, { serviceMatchMode: "excludes" })}
                        className="h-4 w-4 text-sky-600 border-slate-300"
                      />
                      <span className="text-sm text-slate-700">Is not one of</span>
                    </label>
                  </div>

                  {/* Multi-select Services */}
                  <div className="space-y-2">
                    {/* Selected services tags */}
                    {((data as any).selectedServices || []).length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {((data as any).selectedServices || []).map((serviceName: string) => (
                          <span
                            key={serviceName}
                            className="inline-flex items-center gap-1 rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700"
                          >
                            {serviceName}
                            <button
                              type="button"
                              onClick={() => {
                                const current = (data as any).selectedServices || [];
                                updateNodeData(selectedNode.id, {
                                  selectedServices: current.filter((s: string) => s !== serviceName),
                                  value: current.filter((s: string) => s !== serviceName).join(", ")
                                });
                              }}
                              className="ml-0.5 rounded-full p-0.5 hover:bg-sky-200"
                            >
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Service dropdown */}
                    <select
                      value=""
                      onChange={(e) => {
                        if (!e.target.value) return;
                        const current = (data as any).selectedServices || [];
                        if (!current.includes(e.target.value)) {
                          const updated = [...current, e.target.value];
                          updateNodeData(selectedNode.id, {
                            selectedServices: updated,
                            value: updated.join(", ")
                          });
                        }
                      }}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                    >
                      <option value="">Add a service...</option>
                      {services
                        .filter((s) => !((data as any).selectedServices || []).includes(s.name))
                        .map((service) => (
                          <option key={service.id} value={service.name}>{service.name}</option>
                        ))}
                    </select>
                  </div>

                  {/* Help text */}
                  <p className="text-[10px] text-slate-500">
                    {(data as any).serviceMatchMode === "excludes" 
                      ? "Condition is true when service is NOT in the selected list"
                      : "Condition is true when service IS in the selected list"}
                  </p>
                </div>
              ) : (
                <input
                  type="text"
                  value={data.value}
                  onChange={(e) => updateNodeData(selectedNode.id, { value: e.target.value })}
                  placeholder="Enter value..."
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                />
              )}
            </div>
          )}

          <div className="rounded-lg bg-purple-50 p-3 text-xs text-purple-700">
            <strong>If/Else:</strong> When this condition is true, the workflow continues to the next step. 
            You can add different actions for true/false branches by adding nodes after this condition.
          </div>
        </div>
      );
    }

    if (selectedNode.type === "delay") {
      const data = selectedNode.data as DelayNodeData;
      const triggerType = (
        nodes.find((node) => node.type === "trigger")?.data as TriggerNodeData | undefined
      )?.triggerType;
      const supportsAppointmentAnchor =
        triggerType === "appointment_created" || triggerType === "appointment_status_changed";
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Configure Delay</h3>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Delay starts from</label>
            <select
              value={data.delayAnchor || "trigger_time"}
              onChange={(e) => updateNodeData(selectedNode.id, {
                delayAnchor: e.target.value as DelayNodeData["delayAnchor"],
              })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="trigger_time">Workflow trigger time</option>
              {supportsAppointmentAnchor && (
                <option value="appointment_time">Appointment time</option>
              )}
            </select>
            {data.delayAnchor === "appointment_time" && (
              <p className="mt-1 text-xs text-slate-500">
                The delay is added to the appointment&apos;s scheduled start time.
              </p>
            )}
          </div>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Delay Type</label>
            <select
              value={data.delayType}
              onChange={(e) => updateNodeData(selectedNode.id, { delayType: e.target.value as DelayNodeData["delayType"] })}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            >
              <option value="minutes">Minutes</option>
              <option value="hours">Hours</option>
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
              <option value="months">Months</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Wait for</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min="1"
                value={data.delayValue}
                onChange={(e) => updateNodeData(selectedNode.id, { delayValue: parseInt(e.target.value) || 1 })}
                className="w-24 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              />
              <span className="text-sm text-slate-600">{data.delayType}</span>
            </div>
          </div>
        </div>
      );
    }

    if (selectedNode.type === "exit") {
      const data = selectedNode.data as ExitNodeData;
      return (
        <div className="space-y-4">
          <h3 className="font-semibold text-slate-900">Configure Exit</h3>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">Reason</label>
            <input value={data.reason || ""} onChange={(event) => updateNodeData(selectedNode.id, { reason: event.target.value })} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900" />
          </div>
        </div>
      );
    }

    return null;
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <p className="text-slate-500">Loading...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        {/* Header */}
        <header className="mb-4 sm:mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 sm:gap-3 mb-1">
              <Link href="/workflows" className="text-slate-400 hover:text-slate-600 shrink-0">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <div className="relative group min-w-0 flex-1">
                <input
                  type="text"
                  value={workflowName}
                  onChange={(e) => setWorkflowName(e.target.value)}
                  className="text-lg sm:text-xl font-bold text-slate-900 bg-transparent border-b-2 border-transparent hover:border-slate-300 focus:border-sky-500 focus:outline-none transition-colors px-1 -mx-1 w-full truncate"
                  placeholder="Enter workflow name..."
                />
                <svg className="absolute right-0 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                </svg>
              </div>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 truncate">Build custom automations with triggers, actions, and conditions</p>
          </div>
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <label className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm text-slate-600">
              <input
                type="checkbox"
                checked={workflowActive}
                onChange={(e) => setWorkflowActive(e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-emerald-600"
              />
              Active
            </label>
            <button
              onClick={() => handleSave(false)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? "Saving..." : "Save Draft"}
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
            >
              {saving ? "Publishing..." : "Publish"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs sm:text-sm text-red-700">{error}</div>
        )}
        {success && (
          <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs sm:text-sm text-emerald-700">{success}</div>
        )}

        <div className="flex flex-col xl:flex-row gap-4 xl:gap-6">
          {/* Workflow Canvas */}
          <div className="flex-1 min-w-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm min-h-[640px] overflow-hidden">
            <h2 className="mb-4 text-base font-semibold text-slate-900">Workflow Tree</h2>
            <div className="h-[570px] min-w-[280px] overflow-hidden rounded-lg border border-slate-100">
              <WorkflowCanvas
                nodes={nodes as any}
                selectedNodeId={selectedNodeId}
                onSelect={setSelectedNodeId}
                onDelete={deleteNode}
                onAdd={(nodeId, branch, type) => addNodeAfter(nodeId, type, branch)}
              />
            </div>
          </div>

          {/* Configuration Panel */}
          <div className="w-full sm:w-[320px] lg:w-[360px] shrink-0 rounded-xl border border-slate-200 bg-white p-3 sm:p-4 shadow-sm sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="mb-3 text-base font-semibold text-slate-900">Configuration</h2>
            {renderConfigPanel()}
          </div>
        </div>
      </div>

      {/* Email Template Builder Modal */}
      <EmailTemplateBuilder
        open={showEmailBuilder}
        onClose={() => {
          setShowEmailBuilder(false);
          setEditingEmailNodeId(null);
        }}
        onSelectTemplate={(template) => {
          if (editingEmailNodeId) {
            const node = nodes.find(n => n.id === editingEmailNodeId);
            if (node && node.type === "action") {
              const data = node.data as ActionNodeData;
              updateNodeData(editingEmailNodeId, {
                config: {
                  ...data.config,
                  template_id: template.id,
                  subject: template.subject_template,
                }
              });
            }
          }
          // Refresh templates list
          supabaseClient
            .from("email_templates")
            .select("id, name, subject_template, html_content")
            .order("created_at", { ascending: false })
            .then(({ data }) => {
              if (data) setEmailTemplates(data);
            });
        }}
        initialTemplateId={
          editingEmailNodeId
            ? (nodes.find(n => n.id === editingEmailNodeId)?.data as ActionNodeData | undefined)?.config?.template_id as string | undefined
            : undefined
        }
      />

      {/* Email Preview Modal */}
      {previewEmailHtml && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 shrink-0">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Email Preview</h2>
                <p className="text-sm text-slate-500">Subject: {previewEmailSubject}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setPreviewEmailHtml(null);
                  setPreviewEmailSubject(null);
                }}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-slate-50">
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4">
                <iframe
                  srcDoc={previewEmailHtml}
                  className="w-full min-h-[500px] border-0"
                  title="Email Preview"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
