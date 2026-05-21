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

  const apRef = useRef<HTMLDivElement>(null);
  const notesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/medical-records?patientId=${patientId}`);
        const data = await res.json();
        if (data.record) {
          setApContent(data.record.ap_content || "");
          setNotesContent(data.record.notes_content || "");
        }
      } catch {}
      setLoading(false);
    }
    if (patientId) load();
  }, [patientId]);

  const debouncedSave = useRef(
    debounce(async (field: string, content: string) => {
      setSaving(true);
      try {
        await fetch("/api/medical-records", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ patientId, field, content, editedByName: "User" }),
        });
      } catch {}
      setSaving(false);
    }, 1000)
  ).current;

  const handleInput = useCallback((field: "ap_content" | "notes_content", ref: React.RefObject<HTMLDivElement | null>) => {
    const html = ref.current?.innerHTML || "";
    if (field === "ap_content") setApContent(html);
    else setNotesContent(html);
    debouncedSave(field, html);
  }, [debouncedSave]);

  // Convert plain text (with newlines) to HTML for display
  function toHtml(text: string): string {
    if (!text) return '';
    // If already contains HTML tags, return as-is
    if (/<[a-z][\s\S]*>/i.test(text)) return text;
    // Otherwise convert newlines to <br>
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
  }

  if (loading) return null;

  const fieldStyle = "w-full rounded-md border border-slate-200 bg-slate-50/60 px-2.5 py-2 text-xs text-slate-700 min-h-[80px] max-h-[250px] overflow-y-scroll whitespace-pre-wrap";

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
          <div
            ref={apRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setEditingField("ap")}
            onBlur={() => setEditingField(null)}
            onInput={() => handleInput("ap_content", apRef)}
            className={`${fieldStyle} ${editingField === "ap" ? "border-sky-400 ring-1 ring-sky-400 bg-white" : "cursor-text hover:border-slate-300"} focus:outline-none transition-colors`}
            dangerouslySetInnerHTML={{ __html: toHtml(apContent) || '<span class="text-slate-400 italic">Click to add AP notes...</span>' }}
          />
        </div>
        {/* Notes */}
        <div>
          <label className="text-[10px] font-medium text-slate-500 mb-1 block">Notes</label>
          <div
            ref={notesRef}
            contentEditable
            suppressContentEditableWarning
            onFocus={() => setEditingField("notes")}
            onBlur={() => setEditingField(null)}
            onInput={() => handleInput("notes_content", notesRef)}
            className={`${fieldStyle} ${editingField === "notes" ? "border-sky-400 ring-1 ring-sky-400 bg-white" : "cursor-text hover:border-slate-300"} focus:outline-none transition-colors`}
            dangerouslySetInnerHTML={{ __html: toHtml(notesContent) || '<span class="text-slate-400 italic">Click to add notes...</span>' }}
          />
        </div>
      </div>
    </div>
  );
}
