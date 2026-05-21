"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "lodash";

type Props = { patientId: string };

export default function PatientMedicalNotes({ patientId }: Props) {
  const [apContent, setApContent] = useState("");
  const [notesContent, setNotesContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingField, setEditingField] = useState<"ap" | "notes" | null>(null);

  // Load initial data
  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/medical-records?patientId=${patientId}`);
        const data = await res.json();
        if (data.record) {
          setApContent(data.record.ap_content || "");
          setNotesContent(data.record.notes_content || "");
        }
      } catch (err) {
        console.error("Failed to load medical notes:", err);
      }
      setLoading(false);
    }
    if (patientId) load();
  }, [patientId]);

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

  const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
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
          <textarea
            dir="ltr"
            value={notesContent}
            onFocus={() => setEditingField("notes")}
            onBlur={() => setEditingField(null)}
            onChange={handleNotesChange}
            placeholder="Click to add notes..."
            className={`${fieldStyle} ${editingField === "notes" ? "border-sky-400 ring-1 ring-sky-400 bg-white" : "cursor-text hover:border-slate-300"} focus:outline-none transition-colors placeholder:text-slate-400 placeholder:italic`}
          />
        </div>
      </div>
    </div>
  );
}
