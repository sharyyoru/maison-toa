"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import EmailTemplateBuilder, { TEMPLATE_CATEGORIES } from "@/components/EmailTemplateBuilder";

type EmailTemplate = {
  id: string;
  name: string;
  type: string;
  subject_template: string;
  body_template: string;
  html_content: string | null;
  created_at: string;
  updated_at?: string;
  category?: string | null;
  status?: string | null;
  description?: string | null;
  language?: string | null;
};

type TemplateVersion = {
  id: string;
  template_id: string;
  name: string | null;
  subject_template: string | null;
  body_template: string | null;
  design_json: unknown;
  html_content: string | null;
  category: string | null;
  status: string | null;
  description: string | null;
  language: string | null;
  created_at: string;
};

type WorkflowUsingTemplate = {
  id: string;
  name: string;
  active: boolean;
};

export default function EmailTemplatesPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [previewTemplate, setPreviewTemplate] = useState<EmailTemplate | null>(null);
  const [workflowsUsingTemplate, setWorkflowsUsingTemplate] = useState<Map<string, WorkflowUsingTemplate[]>>(new Map());
  // EMAIL-008: builder integration + version history
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderTemplateId, setBuilderTemplateId] = useState<string | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<EmailTemplate | null>(null);
  const [historyVersions, setHistoryVersions] = useState<TemplateVersion[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [restoringVersionId, setRestoringVersionId] = useState<string | null>(null);
  const [previewVersion, setPreviewVersion] = useState<TemplateVersion | null>(null);

  useEffect(() => {
    loadTemplates();
  }, []);

  async function loadTemplates() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseClient
        .from("email_templates")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setTemplates(data || []);

      // Load workflows to find which ones use each template
      const { data: workflows } = await supabaseClient
        .from("workflows")
        .select("id, name, active, config");

      if (workflows) {
        const templateWorkflowMap = new Map<string, WorkflowUsingTemplate[]>();
        
        for (const workflow of workflows) {
          const config = workflow.config as { nodes?: Array<{ type: string; data?: { config?: { template_id?: string } } }> };
          if (config?.nodes) {
            for (const node of config.nodes) {
              if (node.type === "action" && node.data?.config?.template_id) {
                const templateId = node.data.config.template_id;
                const existing = templateWorkflowMap.get(templateId) || [];
                if (!existing.find(w => w.id === workflow.id)) {
                  existing.push({ id: workflow.id, name: workflow.name, active: workflow.active });
                  templateWorkflowMap.set(templateId, existing);
                }
              }
            }
          }
        }
        
        setWorkflowsUsingTemplate(templateWorkflowMap);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(templateId: string) {
    const usedBy = workflowsUsingTemplate.get(templateId);
    if (usedBy && usedBy.length > 0) {
      alert(`This template is used by ${usedBy.length} workflow(s). Please remove it from those workflows first.`);
      return;
    }

    if (!confirm("Are you sure you want to delete this template?")) return;

    try {
      setDeletingId(templateId);
      const { error: deleteError } = await supabaseClient
        .from("email_templates")
        .delete()
        .eq("id", templateId);

      if (deleteError) throw deleteError;
      setTemplates((prev) => prev.filter((t) => t.id !== templateId));
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to delete template");
    } finally {
      setDeletingId(null);
    }
  }

  // EMAIL-008: duplicate a template
  async function handleDuplicate(template: EmailTemplate) {
    try {
      const { error: dupError } = await supabaseClient.from("email_templates").insert({
        name: `${template.name} (Copy)`,
        type: template.type,
        subject_template: template.subject_template,
        body_template: template.body_template,
        design_json: (template as unknown as { design_json?: unknown }).design_json ?? null,
        html_content: template.html_content,
        category: template.category ?? null,
        status: "draft",
        description: template.description ?? null,
        language: template.language ?? "fr",
      });
      if (dupError) throw dupError;
      await loadTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to duplicate template");
    }
  }

  // EMAIL-008: version history
  async function openHistory(template: EmailTemplate) {
    setHistoryTemplate(template);
    setHistoryVersions([]);
    setHistoryLoading(true);
    try {
      const { data, error: historyError } = await supabaseClient
        .from("email_template_versions")
        .select("*")
        .eq("template_id", template.id)
        .order("created_at", { ascending: false })
        .limit(50);
      if (historyError) throw historyError;
      setHistoryVersions((data || []) as TemplateVersion[]);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to load version history");
      setHistoryTemplate(null);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function handleRestoreVersion(version: TemplateVersion) {
    if (!historyTemplate) return;
    if (!confirm(`Restore the version from ${new Date(version.created_at).toLocaleString("fr-CH")}? The current content will be saved as a new version.`)) return;
    setRestoringVersionId(version.id);
    try {
      // Snapshot the current state first so nothing is lost
      await supabaseClient.from("email_template_versions").insert({
        template_id: historyTemplate.id,
        name: historyTemplate.name,
        subject_template: historyTemplate.subject_template,
        body_template: historyTemplate.body_template,
        design_json: (historyTemplate as unknown as { design_json?: unknown }).design_json ?? null,
        html_content: historyTemplate.html_content,
        category: historyTemplate.category ?? null,
        status: historyTemplate.status ?? null,
        description: historyTemplate.description ?? null,
        language: historyTemplate.language ?? null,
      });
      const { error: restoreError } = await supabaseClient
        .from("email_templates")
        .update({
          name: version.name ?? historyTemplate.name,
          subject_template: version.subject_template ?? "",
          body_template: version.body_template ?? "",
          design_json: version.design_json ?? null,
          html_content: version.html_content,
          category: version.category,
          description: version.description,
          language: version.language ?? "fr",
          updated_at: new Date().toISOString(),
        })
        .eq("id", historyTemplate.id);
      if (restoreError) throw restoreError;
      setHistoryTemplate(null);
      await loadTemplates();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to restore version");
    } finally {
      setRestoringVersionId(null);
    }
  }

  const filteredTemplates = templates.filter((template) => {
    if (categoryFilter !== "all" && (template.category ?? "") !== categoryFilter) return false;
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      return (
        template.name.toLowerCase().includes(query) ||
        template.subject_template.toLowerCase().includes(query) ||
        (template.description ?? "").toLowerCase().includes(query)
      );
    }
    return true;
  });

  if (loading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="flex items-center gap-2 text-slate-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading templates...</span>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="px-3 py-4 sm:px-4 sm:py-6 lg:px-6">
        {/* Header */}
        <header className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/workflows" className="text-slate-400 hover:text-slate-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </Link>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Email Templates</h1>
            </div>
            <p className="text-sm text-slate-500">Create and manage email templates independently from workflows</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/workflows/builder"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Create in Workflow
            </Link>
            <button
              type="button"
              onClick={() => { setBuilderTemplateId(null); setBuilderOpen(true); }}
              className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              New Template
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Search + category filter */}
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <div className="relative max-w-md flex-1 min-w-[220px]">
            <svg className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {["all", ...TEMPLATE_CATEGORIES].map((cat) => (
              <button
                key={cat}
                type="button"
                onClick={() => setCategoryFilter(cat)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  categoryFilter === cat
                    ? "bg-sky-600 text-white"
                    : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
                }`}
              >
                {cat === "all" ? "All" : cat}
              </button>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-slate-900">{templates.length}</p>
            <p className="text-sm text-slate-500">Total Templates</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-emerald-600">
              {templates.filter((t) => workflowsUsingTemplate.has(t.id)).length}
            </p>
            <p className="text-sm text-slate-500">In Use</p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-2xl font-bold text-amber-600">
              {templates.filter((t) => !workflowsUsingTemplate.has(t.id)).length}
            </p>
            <p className="text-sm text-slate-500">Unused</p>
          </div>
        </div>

        {/* Templates Grid */}
        {filteredTemplates.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
            <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <h3 className="mt-4 text-lg font-semibold text-slate-900">No templates found</h3>
            <p className="mt-1 text-sm text-slate-500">
              {searchQuery ? "Try a different search term" : "Create your first email template in the workflow builder"}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => {
              const usedBy = workflowsUsingTemplate.get(template.id) || [];
              return (
                <div
                  key={template.id}
                  className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-slate-300 hover:shadow-md transition-all"
                >
                  {/* Template Header */}
                  <div className="flex items-start justify-between gap-2 mb-3">
                    <div className="flex-1 min-w-0">
                      <h3 className="font-semibold text-slate-900 truncate">{template.name}</h3>
                      <p className="text-xs text-slate-500 truncate mt-0.5">{template.subject_template || "No subject"}</p>
                      {template.description && (
                        <p className="text-[11px] text-slate-400 truncate mt-0.5" title={template.description}>{template.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => { setBuilderTemplateId(template.id); setBuilderOpen(true); }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-sky-600 hover:bg-sky-50"
                        title="Edit"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => setPreviewTemplate(template)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        title="Preview"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => void handleDuplicate(template)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
                        title="Duplicate"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => void openHistory(template)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-violet-600 hover:bg-violet-50"
                        title="Version history"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(template.id)}
                        disabled={deletingId === template.id}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                        title="Delete"
                      >
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* EMAIL-008: metadata badges */}
                  <div className="mb-2 flex flex-wrap items-center gap-1">
                    {template.status === "draft" ? (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">Draft</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">Published</span>
                    )}
                    {template.category && (
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-700">{template.category}</span>
                    )}
                    {template.language && (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium uppercase text-slate-600">{template.language}</span>
                    )}
                  </div>

                  {/* Usage Badge */}
                  <div className="mb-3">
                    {usedBy.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {usedBy.slice(0, 2).map((workflow) => (
                          <Link
                            key={workflow.id}
                            href={`/workflows/builder?id=${workflow.id}`}
                            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                              workflow.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            }`}
                          >
                            <span className={`h-1.5 w-1.5 rounded-full ${workflow.active ? "bg-emerald-500" : "bg-slate-400"}`} />
                            {workflow.name.length > 15 ? workflow.name.slice(0, 15) + "..." : workflow.name}
                          </Link>
                        ))}
                        {usedBy.length > 2 && (
                          <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                            +{usedBy.length - 2} more
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Not in use
                      </span>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>
                      Created {new Date(template.created_at).toLocaleDateString()}
                    </span>
                    {template.type && (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                        {template.type}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {previewTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="w-full max-w-3xl max-h-[90vh] rounded-2xl border border-slate-200 bg-white shadow-xl overflow-hidden flex flex-col">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">{previewTemplate.name}</h2>
                <p className="text-sm text-slate-500">Subject: {previewTemplate.subject_template}</p>
              </div>
              <button
                onClick={() => setPreviewTemplate(null)}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6 bg-slate-50">
              {previewTemplate.html_content ? (
                <div
                  className="bg-white rounded-lg shadow-sm border border-slate-200 p-4"
                  dangerouslySetInnerHTML={{ __html: previewTemplate.html_content }}
                />
              ) : previewTemplate.body_template ? (
                <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-4 whitespace-pre-wrap text-sm text-slate-700">
                  {previewTemplate.body_template}
                </div>
              ) : (
                <p className="text-center text-slate-500">No preview available</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EMAIL-008: template builder (create/edit without a workflow) */}
      {builderOpen && (
        <EmailTemplateBuilder
          open={builderOpen}
          initialTemplateId={builderTemplateId}
          onClose={() => {
            setBuilderOpen(false);
            setBuilderTemplateId(null);
            void loadTemplates();
          }}
        />
      )}

      {/* EMAIL-008: version history modal */}
      {historyTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Version history</h2>
                <p className="text-sm text-slate-500">{historyTemplate.name}</p>
              </div>
              <button
                onClick={() => { setHistoryTemplate(null); setPreviewVersion(null); }}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-6">
              {historyLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">Loading versions...</p>
              ) : historyVersions.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-400">
                  No previous versions yet. A version is saved automatically each time the template is updated.
                </p>
              ) : (
                <ul className="space-y-2">
                  {historyVersions.map((version) => (
                    <li key={version.id} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-800">{version.name || historyTemplate.name}</p>
                        <p className="text-xs text-slate-400">
                          {new Date(version.created_at).toLocaleString("fr-CH")}
                          {version.subject_template ? ` · ${version.subject_template.slice(0, 60)}` : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          onClick={() => setPreviewVersion(version)}
                          className="rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          Preview
                        </button>
                        <button
                          onClick={() => void handleRestoreVersion(version)}
                          disabled={restoringVersionId === version.id}
                          className="rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-violet-700 disabled:opacity-50"
                        >
                          {restoringVersionId === version.id ? "Restoring..." : "Restore"}
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* EMAIL-008: version preview modal */}
      {previewVersion && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setPreviewVersion(null)}>
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Version preview</h2>
                <p className="text-sm text-slate-500">{new Date(previewVersion.created_at).toLocaleString("fr-CH")}</p>
              </div>
              <button onClick={() => setPreviewVersion(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-slate-50 p-6">
              {previewVersion.html_content ? (
                <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm" dangerouslySetInnerHTML={{ __html: previewVersion.html_content }} />
              ) : (
                <div className="whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-700">{previewVersion.body_template || "No content"}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
