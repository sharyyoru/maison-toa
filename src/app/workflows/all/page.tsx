"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type DealStage = {
  id: string;
  name: string;
  type: string;
  sort_order: number;
};

type WorkflowRow = {
  id: string;
  name: string;
  trigger_type: string;
  active: boolean;
  config: unknown;
  created_at?: string;
};

type DuplicateStatus = {
  workflowId: string;
  status: "idle" | "duplicating" | "success" | "error";
  message?: string;
};

type WorkflowActionRow = {
  id: string;
  workflow_id: string;
  action_type: string;
  config: unknown;
  sort_order: number;
};

type WorkflowSummary = {
  id: string;
  name: string;
  triggerType: string;
  active: boolean;
  fromStage: DealStage | null;
  toStage: DealStage | null;
  pipeline: string | null;
  subjectTemplate: string | null;
  sendMode: "immediate" | "delay" | "recurring";
  delayMinutes: number | null;
  recurringEveryDays: number | null;
  recurringTimes: number | null;
};

export default function Page() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workflows, setWorkflows] = useState<WorkflowSummary[]>([]);
  const [workflowToDelete, setWorkflowToDelete] = useState<WorkflowSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [duplicatingWorkflowId, setDuplicatingWorkflowId] = useState<string | null>(null);
  const [duplicateSuccess, setDuplicateSuccess] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [stagesResult, workflowsResult, actionsResult] = await Promise.all([
          supabaseClient
            .from("deal_stages")
            .select("id, name, type, sort_order")
            .order("sort_order", { ascending: true }),
          supabaseClient
            .from("workflows")
            .select("id, name, trigger_type, active, config, created_at")
            .order("created_at", { ascending: true }),
          supabaseClient
            .from("workflow_actions")
            .select("id, workflow_id, action_type, config, sort_order")
            .order("sort_order", { ascending: true }),
        ]);

        if (cancelled) return;

        const stages = (stagesResult.data ?? []) as DealStage[];
        const stageById = new Map<string, DealStage>();
        for (const stage of stages) {
          stageById.set(stage.id, stage);
        }

        const workflowRows = (workflowsResult.data ?? []) as WorkflowRow[];
        const actionRows = (actionsResult.data ?? []) as WorkflowActionRow[];

        const summaries: WorkflowSummary[] = workflowRows.map((workflow) => {
          const config = (workflow.config || {}) as {
            from_stage_id?: string | null;
            to_stage_id?: string | null;
            pipeline?: string | null;
          };

          const fromStage = config.from_stage_id
            ? stageById.get(config.from_stage_id) ?? null
            : null;
          const toStage = config.to_stage_id
            ? stageById.get(config.to_stage_id) ?? null
            : null;

          const actionsForWorkflow = actionRows.filter(
            (action) => action.workflow_id === workflow.id,
          );

          const emailAction = actionsForWorkflow.find(
            (action) => action.action_type === "draft_email_patient",
          );

          let subjectTemplate: string | null = null;
          let sendMode: "immediate" | "delay" | "recurring" = "immediate";
          let delayMinutes: number | null = null;
          let recurringEveryDays: number | null = null;
          let recurringTimes: number | null = null;

          if (emailAction) {
            const actionConfig = (emailAction.config || {}) as {
              subject_template?: string;
              send_mode?: "immediate" | "delay" | "recurring";
              delay_minutes?: number | null;
              recurring_every_days?: number | null;
              recurring_times?: number | null;
            };

            if (actionConfig.subject_template) {
              subjectTemplate = actionConfig.subject_template;
            }

            const mode =
              (actionConfig.send_mode as
                | "immediate"
                | "delay"
                | "recurring"
                | undefined) ?? "immediate";
            sendMode = mode;

            if (typeof actionConfig.delay_minutes === "number") {
              delayMinutes = actionConfig.delay_minutes;
            }
            if (typeof actionConfig.recurring_every_days === "number") {
              recurringEveryDays = actionConfig.recurring_every_days;
            }
            if (typeof actionConfig.recurring_times === "number") {
              recurringTimes = actionConfig.recurring_times;
            }
          }

          return {
            id: workflow.id,
            name: workflow.name,
            triggerType: workflow.trigger_type,
            active: workflow.active,
            fromStage,
            toStage,
            pipeline: (config.pipeline ?? null) as string | null,
            subjectTemplate,
            sendMode,
            delayMinutes,
            recurringEveryDays,
            recurringTimes,
          };
        });

        setWorkflows(summaries);
        setLoading(false);
      } catch (err: any) {
        if (cancelled) return;
        setError(err?.message ?? "Failed to load workflows.");
        setLoading(false);
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDuplicateWorkflow(workflow: WorkflowSummary) {
    try {
      setDuplicatingWorkflowId(workflow.id);
      setError(null);
      setDuplicateSuccess(null);

      const response = await fetch("/api/workflows/duplicate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflowId: workflow.id,
          newName: `${workflow.name} (Copy)`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to duplicate workflow");
      }

      // Add the new workflow to the list
      const newWorkflow: WorkflowSummary = {
        ...workflow,
        id: data.workflow.id,
        name: data.workflow.name,
        active: false,
      };

      setWorkflows((prev) => [...prev, newWorkflow]);
      setDuplicateSuccess(`Workflow "${data.workflow.name}" created successfully!`);

      // Clear success message after 3 seconds
      setTimeout(() => setDuplicateSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to duplicate workflow");
    } finally {
      setDuplicatingWorkflowId(null);
    }
  }

  function renderSendMode(summary: WorkflowSummary): string {
    if (summary.sendMode === "delay") {
      if (summary.delayMinutes && summary.delayMinutes > 0) {
        return `Delay ${summary.delayMinutes} min`;
      }
      return "Delay";
    }

    if (summary.sendMode === "recurring") {
      const parts: string[] = [];
      if (summary.recurringEveryDays && summary.recurringEveryDays > 0) {
        parts.push(`Every ${summary.recurringEveryDays} days`);
      }
      if (summary.recurringTimes && summary.recurringTimes > 0) {
        parts.push(`${summary.recurringTimes} times`);
      }
      return parts.length > 0 ? parts.join(", ") : "Recurring";
    }

    return "Immediate";
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">All workflows</h1>
            <p className="mt-1 text-sm text-slate-500">
              View all automations across your clinic, including their triggers, stages, and
              email behavior.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/workflows"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span>Email Workflows</span>
            </Link>
            <Link
              href="/workflows/builder"
              className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-emerald-700"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Create Workflow</span>
            </Link>
          </div>
        </header>

        {error ? (
          <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
          </div>
        ) : null}

        {duplicateSuccess ? (
          <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
            {duplicateSuccess}
          </div>
        ) : null}

        <section className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-4 text-sm text-slate-800 shadow-sm">
          <div className="mb-3 flex items-center justify-between text-xs text-slate-500">
            <span>
              {loading
                ? "Loading workflows…"
                : workflows.length === 0
                  ? "No workflows configured yet."
                  : `${workflows.length} workflow${workflows.length === 1 ? "" : "s"} found.`}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-1 text-xs">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2">Trigger</th>
                  <th className="px-3 py-2">From stage</th>
                  <th className="px-3 py-2">To stage</th>
                  <th className="px-3 py-2">Pipeline</th>
                  <th className="px-3 py-2">Email subject</th>
                  <th className="px-3 py-2">Send mode</th>
                  <th className="px-3 py-2 text-right">Status</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workflows.map((workflow) => (
                  <tr
                    key={workflow.id}
                    className="rounded-lg bg-slate-50/70 text-[11px] text-slate-800 shadow-sm"
                  >
                    <td className="max-w-[220px] truncate px-3 py-2 align-top">
                      <div className="flex flex-col">
                        <span className="font-medium text-slate-900">
                          {workflow.name || "Untitled workflow"}
                        </span>
                        <span className="text-[10px] text-slate-400">
                          ID: {workflow.id}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span className="inline-flex items-center rounded-full bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                        {workflow.triggerType.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-3 py-2 align-top">
                      {workflow.fromStage ? (
                        <div className="flex flex-col">
                          <span>{workflow.fromStage.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {workflow.fromStage.type}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Any stage</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {workflow.toStage ? (
                        <div className="flex flex-col">
                          <span>{workflow.toStage.name}</span>
                          <span className="text-[10px] text-slate-400">
                            {workflow.toStage.type}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400">Any stage</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      {workflow.pipeline ? (
                        <span>{workflow.pipeline}</span>
                      ) : (
                        <span className="text-slate-400">Any</span>
                      )}
                    </td>
                    <td className="max-w-[260px] px-3 py-2 align-top">
                      {workflow.subjectTemplate ? (
                        <span className="line-clamp-2 text-slate-800">
                          {workflow.subjectTemplate}
                        </span>
                      ) : (
                        <span className="text-slate-400">Not configured</span>
                      )}
                    </td>
                    <td className="px-3 py-2 align-top">
                      <span>{renderSendMode(workflow)}</span>
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <span
                        className={
                          workflow.active
                            ? "inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700"
                            : "inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
                        }
                      >
                        {workflow.active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-top">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => router.push(`/workflows?edit=${workflow.id}`)}
                          className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                          title="Edit workflow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleDuplicateWorkflow(workflow)}
                          disabled={duplicatingWorkflowId === workflow.id}
                          className="rounded-md p-1 text-slate-400 hover:bg-sky-50 hover:text-sky-600 disabled:opacity-50"
                          title="Duplicate workflow"
                        >
                          {duplicatingWorkflowId === workflow.id ? (
                            <svg className="h-4 w-4 animate-spin" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                          ) : (
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          )}
                        </button>
                        <button
                          onClick={() => setWorkflowToDelete(workflow)}
                          className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Delete workflow"
                        >
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {/* Delete Confirmation Modal */}
      {workflowToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <h3 className="text-lg font-medium text-slate-900">Delete Workflow</h3>
            <p className="mt-2 text-sm text-slate-500">
              Are you sure you want to delete the workflow "{workflowToDelete.name}"? This action cannot be undone.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setWorkflowToDelete(null)}
                className="rounded-md border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    setIsDeleting(true);
                    const { error } = await supabaseClient
                      .from('workflows')
                      .delete()
                      .eq('id', workflowToDelete.id);

                    if (error) throw error;

                    // Also delete associated actions
                    await supabaseClient
                      .from('workflow_actions')
                      .delete()
                      .eq('workflow_id', workflowToDelete.id);

                    // Refresh the workflows list
                    setWorkflows(workflows.filter(w => w.id !== workflowToDelete.id));
                    setWorkflowToDelete(null);
                  } catch (err) {
                    console.error('Error deleting workflow:', err);
                    setError('Failed to delete workflow. Please try again.');
                  } finally {
                    setIsDeleting(false);
                  }
                }}
                className="rounded-md border border-transparent bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
