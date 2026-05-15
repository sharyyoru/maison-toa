"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { debounce } from "lodash";

type MedicalRecord = {
  id: string;
  patient_id: string;
  ap_content: string;
  af_content: string;
  notes_content: string;
  updated_at: string;
  last_edited_by_name: string | null;
};

type Props = {
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
};

export default function MedicalRecordsTab({ patientId, patientFirstName, patientLastName }: Props) {
  const [record, setRecord] = useState<MedicalRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Local state for each field
  const [apContent, setApContent] = useState("");
  const [afContent, setAfContent] = useState("");
  const [notesContent, setNotesContent] = useState("");

  // Track which fields have been modified
  const [pendingSave, setPendingSave] = useState<Set<string>>(new Set());

  // Load medical record on mount
  useEffect(() => {
    async function loadRecord() {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch(`/api/medical-records?patientId=${patientId}`);
        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to load medical records");
        }

        if (data.record) {
          setRecord(data.record);
          setApContent(data.record.ap_content || "");
          setAfContent(data.record.af_content || "");
          setNotesContent(data.record.notes_content || "");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    if (patientId) {
      void loadRecord();
    }
  }, [patientId]);

  // Debounced autosave function
  const debouncedSave = useRef(
    debounce(async (field: string, content: string) => {
      try {
        setSaving(true);
        const res = await fetch("/api/medical-records", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            patientId,
            field,
            content,
            editedByName: "User", // TODO: Get actual user name
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          throw new Error(data.error || "Failed to save");
        }

        setLastSaved(new Date());
        setPendingSave((prev) => {
          const next = new Set(prev);
          next.delete(field);
          return next;
        });
      } catch (err: any) {
        console.error("Autosave error:", err);
        setError("Failed to save: " + err.message);
      } finally {
        setSaving(false);
      }
    }, 1000)
  ).current;

  // Handle content change with autosave
  const handleContentChange = useCallback(
    (field: "ap_content" | "af_content" | "notes_content", value: string) => {
      if (field === "ap_content") setApContent(value);
      else if (field === "af_content") setAfContent(value);
      else setNotesContent(value);

      setPendingSave((prev) => new Set(prev).add(field));
      debouncedSave(field, value);
    },
    [debouncedSave]
  );

  // Export to PDF
  const handleExportPdf = async () => {
    try {
      setExporting(true);

      // Create PDF content
      const content = `
MEDICAL RECORDS
Patient: ${patientFirstName} ${patientLastName}
Date: ${new Date().toLocaleDateString("fr-CH")}

${"─".repeat(60)}

MEDICAL NOTES (AP)
${"─".repeat(60)}
${apContent || "(No content)"}

${"─".repeat(60)}

MEDICAL NOTES (AF)
${"─".repeat(60)}
${afContent || "(No content)"}

${"─".repeat(60)}

NOTES
${"─".repeat(60)}
${notesContent || "(No content)"}

${"─".repeat(60)}
Generated: ${new Date().toLocaleString("fr-CH")}
      `.trim();

      // Create a blob and download
      const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Medical_Records_${patientLastName}_${patientFirstName}_${new Date().toISOString().split("T")[0]}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // For actual PDF, use browser print
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Medical Records - ${patientFirstName} ${patientLastName}</title>
            <style>
              body { font-family: Arial, sans-serif; padding: 40px; max-width: 800px; margin: 0 auto; }
              h1 { color: #1e293b; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; }
              h2 { color: #334155; margin-top: 30px; background: #f1f5f9; padding: 10px; border-radius: 4px; }
              .content { white-space: pre-wrap; line-height: 1.6; padding: 15px; background: #fafafa; border: 1px solid #e2e8f0; border-radius: 4px; min-height: 100px; }
              .meta { color: #64748b; font-size: 12px; margin-top: 40px; text-align: center; }
              @media print { body { padding: 20px; } }
            </style>
          </head>
          <body>
            <h1>Medical Records</h1>
            <p><strong>Patient:</strong> ${patientFirstName} ${patientLastName}</p>
            <p><strong>Date:</strong> ${new Date().toLocaleDateString("fr-CH")}</p>
            
            <h2>Medical Notes (AP)</h2>
            <div class="content">${apContent || "(No content)"}</div>
            
            <h2>Medical Notes (AF)</h2>
            <div class="content">${afContent || "(No content)"}</div>
            
            <h2>Notes</h2>
            <div class="content">${notesContent || "(No content)"}</div>
            
            <p class="meta">Generated: ${new Date().toLocaleString("fr-CH")}</p>
          </body>
          </html>
        `);
        printWindow.document.close();
        printWindow.print();
      }
    } catch (err: any) {
      console.error("Export error:", err);
      setError("Failed to export: " + err.message);
    } finally {
      setExporting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="flex items-center gap-3 text-slate-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading medical records...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with status and export */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-slate-700">Medical Records</h3>
          {saving && (
            <span className="flex items-center gap-1.5 text-xs text-amber-600">
              <svg className="h-3 w-3 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Saving...
            </span>
          )}
          {!saving && lastSaved && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-600">
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              Saved {lastSaved.toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {pendingSave.size > 0 && !saving && (
            <span className="text-xs text-slate-400">Unsaved changes</span>
          )}
        </div>

        <button
          onClick={handleExportPdf}
          disabled={exporting}
          className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:bg-slate-50 disabled:opacity-50"
        >
          {exporting ? (
            <>
              <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Exporting...
            </>
          ) : (
            <>
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              Export PDF
            </>
          )}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* Three column layout */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* AP Column */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-blue-100">
              <span className="text-xs font-bold text-blue-700">AP</span>
            </div>
            <label className="text-xs font-semibold text-slate-700">Medical Notes (AP)</label>
          </div>
          <textarea
            value={apContent}
            onChange={(e) => handleContentChange("ap_content", e.target.value)}
            placeholder="Enter AP medical notes..."
            className="min-h-[400px] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 placeholder-slate-400 shadow-sm transition-colors focus:border-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-100"
          />
        </div>

        {/* AF Column */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-xs font-bold text-emerald-700">AF</span>
            </div>
            <label className="text-xs font-semibold text-slate-700">Medical Notes (AF)</label>
          </div>
          <textarea
            value={afContent}
            onChange={(e) => handleContentChange("af_content", e.target.value)}
            placeholder="Enter AF medical notes..."
            className="min-h-[400px] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 placeholder-slate-400 shadow-sm transition-colors focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        {/* Notes Column */}
        <div className="flex flex-col">
          <div className="mb-2 flex items-center gap-2">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-3.5 w-3.5 text-amber-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <label className="text-xs font-semibold text-slate-700">Notes</label>
          </div>
          <textarea
            value={notesContent}
            onChange={(e) => handleContentChange("notes_content", e.target.value)}
            placeholder="Enter general notes..."
            className="min-h-[400px] w-full resize-y rounded-lg border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700 placeholder-slate-400 shadow-sm transition-colors focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-100"
          />
        </div>
      </div>

      {/* Last updated info */}
      {record?.updated_at && (
        <div className="text-center text-xs text-slate-400">
          Last updated: {new Date(record.updated_at).toLocaleString("fr-CH")}
          {record.last_edited_by_name && ` by ${record.last_edited_by_name}`}
        </div>
      )}
    </div>
  );
}
