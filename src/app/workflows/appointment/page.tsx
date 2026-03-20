"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type DealStage = {
  id: string;
  name: string;
  type: string;
  sort_order: number;
};

type WorkflowStep = {
  id: string;
  type: "trigger" | "action" | "delay" | "condition";
  title: string;
  description: string;
  icon: string;
  config?: Record<string, unknown>;
};

const APPOINTMENT_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "trigger",
    type: "trigger",
    title: "Deal Stage Changed",
    description: "When a deal is moved to 'Appointment Set'",
    icon: "⚡",
  },
  {
    id: "action-modal",
    type: "action",
    title: "Show Appointment Modal",
    description: "Prompt user to select staff member and enter date/time",
    icon: "📅",
  },
  {
    id: "action-assign",
    type: "action",
    title: "Assign to Staff Calendar",
    description: "Add appointment to selected staff member's calendar",
    icon: "👤",
  },
  {
    id: "action-patient-email",
    type: "action",
    title: "Send Patient Email",
    description: "Confirmation email with appointment details",
    icon: "📧",
  },
  {
    id: "action-user-email",
    type: "action",
    title: "Send Staff Email",
    description: "Notification email to the assigned staff member",
    icon: "👤",
  },
  {
    id: "delay-reminder",
    type: "delay",
    title: "Wait Until 1 Day Before",
    description: "Schedule reminder for 24 hours before appointment",
    icon: "⏰",
  },
  {
    id: "action-reminder-patient",
    type: "action",
    title: "Send Patient Reminder",
    description: "Reminder email to patient about upcoming appointment",
    icon: "🔔",
  },
  {
    id: "action-reminder-user",
    type: "action",
    title: "Send Staff Reminder",
    description: "Reminder email to staff about upcoming appointment",
    icon: "🔔",
  },
];

export default function AppointmentWorkflowPage() {
  const router = useRouter();
  const [stages, setStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [workflowName, setWorkflowName] = useState("Appointment Set Automation");
  const [workflowActive, setWorkflowActive] = useState(true);
  const [selectedStageId, setSelectedStageId] = useState<string>("");
  const [sendPatientEmail, setSendPatientEmail] = useState(true);
  const [sendUserEmail, setSendUserEmail] = useState(true);
  const [sendReminder, setSendReminder] = useState(true);
  const [reminderDays, setReminderDays] = useState("1");

  useEffect(() => {
    async function loadStages() {
      try {
        setLoading(true);
        const { data, error } = await supabaseClient
          .from("deal_stages")
          .select("id, name, type, sort_order")
          .order("sort_order", { ascending: true });

        if (error) throw error;

        setStages(data || []);

        // Find and select "Appointment Set" stage by default
        const appointmentStage = data?.find(
          (stage) => stage.name.toLowerCase().includes("appointment set")
        );
        if (appointmentStage) {
          setSelectedStageId(appointmentStage.id);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load stages");
      } finally {
        setLoading(false);
      }
    }

    loadStages();
  }, []);

  async function handleSaveWorkflow() {
    if (!selectedStageId) {
      setError("Please select a trigger stage.");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Check if workflow already exists
      const { data: existingWorkflows } = await supabaseClient
        .from("workflows")
        .select("id")
        .eq("name", workflowName)
        .limit(1);

      let workflowId: string;

      if (existingWorkflows && existingWorkflows.length > 0) {
        // Update existing workflow
        workflowId = existingWorkflows[0].id;
        await supabaseClient
          .from("workflows")
          .update({
            active: workflowActive,
            config: {
              to_stage_id: selectedStageId,
              show_appointment_modal: true,
              send_patient_email: sendPatientEmail,
              send_user_email: sendUserEmail,
              send_reminder: sendReminder,
              reminder_days_before: parseInt(reminderDays, 10) || 1,
            },
          })
          .eq("id", workflowId);
      } else {
        // Create new workflow
        const { data: newWorkflow, error: insertError } = await supabaseClient
          .from("workflows")
          .insert({
            name: workflowName,
            trigger_type: "deal_stage_changed",
            active: workflowActive,
            config: {
              to_stage_id: selectedStageId,
              show_appointment_modal: true,
              send_patient_email: sendPatientEmail,
              send_user_email: sendUserEmail,
              send_reminder: sendReminder,
              reminder_days_before: parseInt(reminderDays, 10) || 1,
            },
          })
          .select("id")
          .single();

        if (insertError || !newWorkflow) {
          throw insertError || new Error("Failed to create workflow");
        }

        workflowId = newWorkflow.id;
      }

      // Upsert workflow actions
      await supabaseClient
        .from("workflow_actions")
        .delete()
        .eq("workflow_id", workflowId);

      const actions = [
        {
          workflow_id: workflowId,
          action_type: "show_appointment_modal",
          config: {},
          sort_order: 1,
        },
      ];

      if (sendPatientEmail) {
        actions.push({
          workflow_id: workflowId,
          action_type: "send_appointment_email_patient",
          config: { template: "appointment_confirmation" },
          sort_order: 2,
        });
      }

      if (sendUserEmail) {
        actions.push({
          workflow_id: workflowId,
          action_type: "send_appointment_email_user",
          config: { template: "appointment_notification" },
          sort_order: 3,
        });
      }

      if (sendReminder) {
        actions.push({
          workflow_id: workflowId,
          action_type: "schedule_reminder",
          config: {
            days_before: parseInt(reminderDays, 10) || 1,
            send_to_patient: true,
            send_to_user: true,
          },
          sort_order: 4,
        });
      }

      await supabaseClient.from("workflow_actions").insert(actions);

      setSuccess("Workflow saved successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save workflow");
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicate() {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch("/api/workflows/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: "current", // This would be the actual workflow ID in a real scenario
          newName: `${workflowName} (Copy)`,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to duplicate workflow");
      }

      setSuccess("Workflow duplicated successfully!");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate workflow");
    } finally {
      setSaving(false);
    }
  }

  const activeSteps = APPOINTMENT_WORKFLOW_STEPS.filter((step) => {
    if (step.id === "action-patient-email" && !sendPatientEmail) return false;
    if (step.id === "action-user-email" && !sendUserEmail) return false;
    if (step.id === "delay-reminder" && !sendReminder) return false;
    if (step.id === "action-reminder-patient" && !sendReminder) return false;
    if (step.id === "action-reminder-user" && !sendReminder) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <Link
                href="/workflows"
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-2xl font-bold text-slate-900">Appointment Workflow</h1>
            </div>
            <p className="text-sm text-slate-500">
              Automate appointment scheduling when deals reach a specific stage
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDuplicate}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Duplicate
            </button>
            <button
              onClick={handleSaveWorkflow}
              disabled={saving || loading}
              className="inline-flex items-center gap-2 rounded-full bg-emerald-600 px-5 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Workflow"}
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          {/* Workflow Visualization */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-6 text-lg font-semibold text-slate-900">Workflow Steps</h2>
            
            <div className="relative">
              {activeSteps.map((step, index) => (
                <div key={step.id} className="relative">
                  {/* Connector line */}
                  {index < activeSteps.length - 1 && (
                    <div className="absolute left-6 top-14 h-8 w-0.5 bg-gradient-to-b from-emerald-300 to-emerald-200" />
                  )}
                  
                  <div className={`
                    relative flex items-start gap-4 rounded-xl p-4 mb-3 transition-all
                    ${step.type === "trigger" ? "bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200" : ""}
                    ${step.type === "action" ? "bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200" : ""}
                    ${step.type === "delay" ? "bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200" : ""}
                  `}>
                    <div className={`
                      flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-2xl
                      ${step.type === "trigger" ? "bg-amber-100" : ""}
                      ${step.type === "action" ? "bg-emerald-100" : ""}
                      ${step.type === "delay" ? "bg-blue-100" : ""}
                    `}>
                      {step.icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`
                          inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide
                          ${step.type === "trigger" ? "bg-amber-200 text-amber-800" : ""}
                          ${step.type === "action" ? "bg-emerald-200 text-emerald-800" : ""}
                          ${step.type === "delay" ? "bg-blue-200 text-blue-800" : ""}
                        `}>
                          {step.type}
                        </span>
                        <span className="text-xs text-slate-400">Step {index + 1}</span>
                      </div>
                      <h3 className="font-medium text-slate-900">{step.title}</h3>
                      <p className="text-sm text-slate-500">{step.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Configuration Panel */}
          <div className="space-y-6">
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-900">Configuration</h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Workflow Name
                  </label>
                  <input
                    type="text"
                    value={workflowName}
                    onChange={(e) => setWorkflowName(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">
                    Trigger Stage
                  </label>
                  <select
                    value={selectedStageId}
                    onChange={(e) => setSelectedStageId(e.target.value)}
                    disabled={loading}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Select stage...</option>
                    {stages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </div>

                <label className="flex items-center gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={workflowActive}
                    onChange={(e) => setWorkflowActive(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-700">Workflow is active</span>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-900">Email Actions</h3>
              
              <div className="space-y-3">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={sendPatientEmail}
                    onChange={(e) => setSendPatientEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700">Patient confirmation</span>
                    <p className="text-xs text-slate-500">Send appointment details to patient</p>
                  </div>
                </label>

                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={sendUserEmail}
                    onChange={(e) => setSendUserEmail(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700">Staff notification</span>
                    <p className="text-xs text-slate-500">Notify assigned staff member</p>
                  </div>
                </label>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="mb-4 font-semibold text-slate-900">Reminder Settings</h3>
              
              <div className="space-y-4">
                <label className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={sendReminder}
                    onChange={(e) => setSendReminder(e.target.checked)}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div>
                    <span className="text-sm font-medium text-slate-700">Send reminders</span>
                    <p className="text-xs text-slate-500">Email both patient and staff before appointment</p>
                  </div>
                </label>

                {sendReminder && (
                  <div className="ml-7 flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="7"
                      value={reminderDays}
                      onChange={(e) => setReminderDays(e.target.value)}
                      className="w-16 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm text-slate-900 text-center focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <span className="text-sm text-slate-600">day(s) before appointment</span>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex gap-3">
                <div className="shrink-0 text-blue-500">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <div>
                  <p className="text-sm font-medium text-blue-900">How it works</p>
                  <p className="text-xs text-blue-700 mt-1">
                    When a deal is moved to the selected stage, a modal will prompt you to enter the appointment date and time. 
                    Confirmation emails are sent immediately, and reminders are scheduled automatically.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
