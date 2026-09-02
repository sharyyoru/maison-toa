"use client";

import { useCallback, useEffect, useState } from "react";
import { debounce } from "lodash";
import RichTextEditor from "@/components/RichTextEditor";

type Props = { patientId: string };

function hasVisibleContent(html: string) {
  if (!html.trim()) return false;

  const container = document.createElement("div");
  container.innerHTML = html;
  return Boolean(container.textContent?.replace(/\u00a0/g, " ").trim());
}

export default function PatientMedicalNotes({ patientId }: Props) {
  const [apContent, setApContent] = useState("");
  const [notesContent, setNotesContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<"ap" | null>(null);
  const [notesModalOpen, setNotesModalOpen] = useState(false);

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/medical-records?patientId=${patientId}`);
        const data = await res.json();
        if (data.record) {
          setApContent(data.record.ap_content || "");
          const loadedNotes = data.record.notes_content || "";
          setNotesContent(loadedNotes);
          setNotesModalOpen(hasVisibleContent(loadedNotes));
        }
      } catch (err) {
        console.error("Failed to load medical notes:", err);
      }
      setLoading(false);
    }
    if (patientId) load();
  }, [patientId]);

  useEffect(() => {
    if (!notesModalOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setNotesModalOpen(false);
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [notesModalOpen]);

  // Debounced save function - recreate when patientId changes
  const saveToServer = useCallback(
    debounce(async (field: string, content: string, pid: string) => {
      setSaving(true);
      try {
        const res = await fetch("/api/medical-records", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId: pid, field, content, editedByName: "User" }),
        });
        if (!res.ok) {
          console.error("Failed to save:", await res.text());
        }
      } catch (err) {
        console.error("Error saving medical note:", err);
      }
      setSaving(false);
    }, 800),
    []
  );

  const handleApChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setApContent(value);
    saveToServer("ap_content", value, patientId);
  };

  const handleNotesChange = (value: string) => {
    setNotesContent(value);
    saveToServer("notes_content", value, patientId);
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="text-xs text-slate-400">Loading notes...</div>
      </div>
    );
  }

  const fieldStyle = "w-full rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-xs text-slate-700 min-h-[80px] max-h-[250px] overflow-y-auto resize-none";

  return (
    <>
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-semibold text-slate-700 uppercase tracking-wide">Medical Notes</h3>
        {saving && <span className="text-[10px] text-amber-600">Saving...</span>}
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {/* AP */}
        <div>
          <label className="text-[10px] font-medium text-slate-500 mb-1 block">AP</label>
          <textarea
            dir="ltr"
            value={apContent}
            onFocus={() => setEditingField("ap")}
            onBlur={() => setEditingField(null)}
            onChange={handleApChange}
            placeholder="Click to add AP notes..."
            className={`${fieldStyle} ${editingField === "ap" ? "border-sky-400 ring-1 ring-sky-400 bg-white" : "cursor-text hover:border-slate-300"} focus:outline-none transition-colors placeholder:text-slate-400 placeholder:italic`}
          />
        </div>
        {/* Notes */}
        <div>
          <label className="text-[10px] font-medium text-slate-500 mb-1 block">Notes</label>
          <RichTextEditor
            value={notesContent}
            onChange={handleNotesChange}
            placeholder="Click to add notes..."
            editorClassName="min-h-[80px] max-h-[250px] overflow-y-auto"
            className="rounded-md bg-slate-50/60 transition-colors hover:border-slate-300 focus-within:border-sky-400 focus-within:ring-1 focus-within:ring-sky-400 focus-within:bg-white"
          />
        </div>
      </div>
    </div>
    {notesModalOpen && (
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setNotesModalOpen(false);
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="patient-notes-modal-title"
          className="flex max-h-[80vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <h2 id="patient-notes-modal-title" className="text-base font-semibold text-slate-900">
              Patient Notes
            </h2>
            <button
              type="button"
              onClick={() => setNotesModalOpen(false)}
              aria-label="Close patient notes"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full text-xl leading-none text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-800"
            >
              &times;
            </button>
          </div>
          <div
            className="overflow-y-auto px-3 py-2 text-xs text-slate-900 [&_ul]:ml-4 [&_ul]:list-disc [&_ol]:ml-4 [&_ol]:list-decimal [&_a]:text-sky-600 [&_a]:underline"
            style={{ whiteSpace: "pre-wrap" }}
            dangerouslySetInnerHTML={{ __html: notesContent }}
          />
          <div className="flex justify-end border-t border-slate-200 px-5 py-3">
            <button
              type="button"
              onClick={() => setNotesModalOpen(false)}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
