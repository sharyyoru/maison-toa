"use client";

// DOC-003 – Manage Document Templates Directly in Aliice Settings
// Staff can upload new .docx templates, duplicate existing ones (including the
// built-in templates) and delete their own templates — without asking the
// technical team. Custom templates are stored in the "document-templates"
// storage bucket and appear automatically in the patient-file template picker.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type DocumentTemplate = {
  id: string;
  name: string;
  file_path: string;
  category: string;
  storage_only: boolean;
};

const BUCKET = "document-templates";

export default function DocumentTemplatesSettingsTab() {
  const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadTemplates = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/documents/templates");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to load templates");
      setTemplates((data.templates ?? []) as DocumentTemplate[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load templates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadTemplates();
  }, [loadTemplates]);

  function sanitizeName(name: string): string {
    return name.replace(/\.docx$/i, "").trim();
  }

  async function storageNameAvailable(base: string): Promise<string> {
    // Append (2), (3), ... if a template with this name already exists.
    const taken = new Set(templates.map((t) => t.name.toLowerCase()));
    if (!taken.has(base.toLowerCase())) return base;
    for (let i = 2; i < 100; i++) {
      const candidate = `${base} (${i})`;
      if (!taken.has(candidate.toLowerCase())) return candidate;
    }
    return `${base} ${Date.now()}`;
  }

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith(".docx")) {
          setError("Only .docx files are supported.");
          continue;
        }
        const base = await storageNameAvailable(sanitizeName(file.name));
        const { error: uploadError } = await supabaseClient.storage
          .from(BUCKET)
          .upload(`${base}.docx`, file, {
            contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          });
        if (uploadError) throw uploadError;
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDuplicate(template: DocumentTemplate) {
    setBusyId(template.id);
    setError(null);
    try {
      let blob: Blob;
      if (template.storage_only) {
        const storageName = template.file_path.replace(/^storage:/, "");
        const { data, error: downloadError } = await supabaseClient.storage
          .from(BUCKET)
          .download(storageName);
        if (downloadError || !data) throw downloadError || new Error("Download failed");
        blob = data;
      } else {
        // Built-in template served from public/documents
        const res = await fetch(`/documents/${encodeURIComponent(template.file_path)}`);
        if (!res.ok) throw new Error("Failed to download the built-in template");
        blob = await res.blob();
      }
      const base = await storageNameAvailable(`${template.name} (Copy)`);
      const { error: uploadError } = await supabaseClient.storage
        .from(BUCKET)
        .upload(`${base}.docx`, blob, {
          contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        });
      if (uploadError) throw uploadError;
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Duplicate failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(template: DocumentTemplate) {
    if (!confirm(`Delete the template "${template.name}"?${template.storage_only ? " This cannot be undone." : ""}`)) return;
    setBusyId(template.id);
    setError(null);
    try {
      if (template.storage_only) {
        const storageName = template.file_path.replace(/^storage:/, "");
        const { error: deleteError } = await supabaseClient.storage.from(BUCKET).remove([storageName]);
        if (deleteError) throw deleteError;
      } else {
        // Built-in template: mark as hidden so it disappears everywhere
        const { error: hideError } = await supabaseClient
          .from("document_template_overrides")
          .upsert({ file_name: template.file_path, hidden: true, updated_at: new Date().toISOString() });
        if (hideError) throw hideError;
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleRename(template: DocumentTemplate) {
    const input = window.prompt("New template name:", template.name);
    if (!input) return;
    const newName = input.trim();
    if (!newName || newName === template.name) return;
    if (templates.some((t) => t.name.toLowerCase() === newName.toLowerCase())) {
      setError(`A template named "${newName}" already exists.`);
      return;
    }
    setBusyId(template.id);
    setError(null);
    try {
      if (template.storage_only) {
        const storageName = template.file_path.replace(/^storage:/, "");
        const { error: moveError } = await supabaseClient.storage
          .from(BUCKET)
          .move(storageName, `${newName}.docx`);
        if (moveError) throw moveError;
      } else {
        // Built-in template: store a display-name override
        const { error: renameError } = await supabaseClient
          .from("document_template_overrides")
          .upsert({ file_name: template.file_path, display_name: newName, hidden: false, updated_at: new Date().toISOString() });
        if (renameError) throw renameError;
      }
      await loadTemplates();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDownload(template: DocumentTemplate) {
    try {
      let blob: Blob;
      if (template.storage_only) {
        const storageName = template.file_path.replace(/^storage:/, "");
        const { data, error: downloadError } = await supabaseClient.storage
          .from(BUCKET)
          .download(storageName);
        if (downloadError || !data) throw downloadError || new Error("Download failed");
        blob = data;
      } else {
        const res = await fetch(`/documents/${encodeURIComponent(template.file_path)}`);
        if (!res.ok) throw new Error("Download failed");
        blob = await res.blob();
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${template.name}.docx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  const filtered = search.trim()
    ? templates.filter((t) => t.name.toLowerCase().includes(search.trim().toLowerCase()))
    : templates;
  const customCount = templates.filter((t) => t.storage_only).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Document Templates</h2>
          <p className="text-xs text-slate-500">
            Upload, duplicate, download and delete the .docx templates used to create patient documents.
            Built-in templates can be duplicated and the copy edited; custom templates can be replaced or deleted at any time.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".docx"
            multiple
            className="hidden"
            onChange={(e) => void handleUpload(e.target.files)}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
          >
            <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
            </svg>
            {uploading ? "Uploading..." : "Upload template (.docx)"}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search templates..."
          className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <span className="shrink-0 text-[11px] text-slate-400">
          {templates.length} template{templates.length === 1 ? "" : "s"} ({customCount} custom)
        </span>
      </div>

      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="py-10 text-center text-xs text-slate-400">Loading templates...</p>
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-xs text-slate-400">No templates found.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <table className="min-w-full text-left text-xs">
            <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2 font-medium">Name</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {filtered.map((template) => (
                <tr key={template.id} className="hover:bg-slate-50/70">
                  <td className="px-3 py-2 font-medium text-slate-800">{template.name}</td>
                  <td className="px-3 py-2">
                    {template.storage_only ? (
                      <span className="inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">Custom</span>
                    ) : (
                      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">Built-in</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => void handleDownload(template)}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleRename(template)}
                        disabled={busyId === template.id}
                        className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                      >
                        Rename
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDuplicate(template)}
                        disabled={busyId === template.id}
                        className="rounded-md border border-sky-200 bg-sky-50 px-2 py-1 text-[11px] font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                      >
                        {busyId === template.id ? "..." : "Duplicate"}
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleDelete(template)}
                        disabled={busyId === template.id}
                        className="rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Tip: to modify a template, download it, edit it in Word, then upload the new version.
        Custom templates appear immediately in the patient file &quot;Create from template&quot; picker.
      </p>
    </div>
  );
}
