"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  DocxEditor,
  type DocxEditorRef,
} from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";
import { removeNextFieldArtifacts, restoreDroppedBorderOverrides } from "@/lib/docxFieldCleanup";

interface EditorPaneProps {
  documentBuffer: ArrayBuffer;
  documentTitle: string;
  onChange: () => void;
  onError: (error: Error) => void;
}

// Isolated + memoized so that unrelated state changes elsewhere in
// DocxPreviewEditor (typing in the filename field, editing a placeholder,
// etc.) never re-render the underlying editor. Without this, every
// keystroke re-renders DocxPreviewEditor and, in turn, this element - which
// some editors treat as a cue to resync/reset from their input props.
const EditorPane = React.memo(
  React.forwardRef<DocxEditorRef, EditorPaneProps>(function EditorPane(
    { documentBuffer, documentTitle, onChange, onError },
    ref
  ) {
    return (
      <DocxEditor
        ref={ref}
        documentBuffer={documentBuffer}
        documentName={documentTitle}
        documentNameEditable={false}
        mode="editing"
        onChange={onChange}
        onError={onError}
      />
    );
  })
);

interface PatientData {
  firstName?: string;
  lastName?: string;
  salutation?: string;
  birthdate?: string;
  email?: string;
  phone?: string;
  [key: string]: string | undefined;
}

interface DocxPreviewEditorProps {
  documentBlob: Blob;
  documentTitle: string;
  patientId: string;
  documentId: string;
  patientData?: PatientData;
  fileName?: string;
  onSave: (blob: Blob, fileName?: string) => Promise<void>;
  onClose: () => void;
}

const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

function getPatientValue(fieldPath: string, patientData?: PatientData) {
  if (!patientData || !fieldPath.startsWith("patientInfo.")) return "";
  return patientData[fieldPath.replace("patientInfo.", "")] || "";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function escapeRegexCharacter(character: string) {
  return character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replacePlaceholderInXml(
  xml: string,
  placeholder: string,
  value: string
) {
  if (!value) return xml;

  const escapedValue = escapeXml(value);
  if (xml.includes(placeholder)) {
    return xml.split(placeholder).join(escapedValue);
  }

  const fragmentedPattern = Array.from(placeholder)
    .map(escapeRegexCharacter)
    .join("(?:</w:t>(?:<[^>]*>)*<w:t[^>]*>)?");

  return xml.replace(new RegExp(fragmentedPattern, "g"), escapedValue);
}

async function extractPlaceholders(
  blob: Blob,
  patientData?: PatientData
) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  const found = new Map<string, string>();
  const xmlFiles = Object.values(zip.files).filter(
    (file) =>
      !file.dir &&
      /^word\/(document|header\d+|footer\d+)\.xml$/i.test(file.name)
  );

  for (const file of xmlFiles) {
    const xml = await file.async("string");
    const visibleText = xml
      .replace(/<\/w:t>\s*<w:t[^>]*>/g, "")
      .replace(/<[^>]+>/g, "");

    for (const match of visibleText.matchAll(/\$\{([^}]+)\}/g)) {
      const placeholder = match[0];
      found.set(placeholder, getPatientValue(match[1], patientData));
    }
  }

  return found;
}

async function applyPlaceholders(
  buffer: ArrayBuffer,
  replacements: Map<string, string>
) {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buffer);
  const xmlFiles = Object.values(zip.files).filter(
    (file) =>
      !file.dir &&
      /^word\/(document|header\d+|footer\d+)\.xml$/i.test(file.name)
  );

  for (const file of xmlFiles) {
    let xml = await file.async("string");
    replacements.forEach((value, placeholder) => {
      xml = replacePlaceholderInXml(xml, placeholder, value);
    });
    xml = removeNextFieldArtifacts(xml);
    // Restore border overrides that the editor serializer drops when it
    // re-serializes cells/paragraphs that had explicit `none` borders.
    // Without this, previously-hidden table/paragraph borders reappear as
    // stray horizontal and vertical lines after saving.
    xml = restoreDroppedBorderOverrides(xml);
    zip.file(file.name, xml);
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: DOCX_MIME_TYPE,
  });
}

export default function DocxPreviewEditor({
  documentBlob,
  documentTitle,
  patientData,
  fileName,
  onSave,
  onClose,
}: DocxPreviewEditorProps) {
  const editorRef = useRef<DocxEditorRef>(null);
  const [documentBuffer, setDocumentBuffer] = useState<ArrayBuffer>();
  const [placeholders, setPlaceholders] = useState<Map<string, string>>(
    new Map()
  );
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [editedFileName, setEditedFileName] = useState(fileName || "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setEditedFileName(fileName || "");
  }, [fileName]);

  useEffect(() => {
    let cancelled = false;

    async function loadDocument() {
      setIsLoading(true);
      setError(null);
      setHasChanges(false);

      try {
        const [buffer, foundPlaceholders] = await Promise.all([
          documentBlob.arrayBuffer(),
          extractPlaceholders(documentBlob, patientData),
        ]);

        if (!cancelled) {
          setDocumentBuffer(buffer);
          setPlaceholders(foundPlaceholders);
        }
      } catch (loadError) {
        console.error("Error loading DOCX editor:", loadError);
        if (!cancelled) setError("Failed to load document");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadDocument();
    return () => {
      cancelled = true;
    };
  }, [documentBlob, patientData]);

  const handlePlaceholderChange = (placeholder: string, value: string) => {
    setPlaceholders((current) => {
      const next = new Map(current);
      next.set(placeholder, value);
      return next;
    });
    setHasChanges(true);
  };

  // Memoized so the underlying editor never receives a new callback
  // reference on every keystroke in the filename field (some editors
  // re-bind/reinitialize internal state when callback props change).
  const handleEditorChange = useCallback(() => {
    setHasChanges(true);
  }, []);

  const handleEditorError = useCallback((editorError: Error) => {
    console.error("DOCX editor error:", editorError);
    setError("The document editor encountered an error");
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      // Selective (the default) preserves the original XML for anything the
      // user didn't touch. A full repack (`selective: false`) re-serializes
      // the whole document from the editor's internal model, which was
      // found to drop explicit per-cell `<w:tcBorders w:val="none">`
      // overrides - causing table borders that should stay invisible to
      // reappear as stray horizontal/vertical lines after saving.
      const buffer = await editorRef.current?.save();
      if (!buffer) throw new Error("The editor did not return a document");

      const blob = await applyPlaceholders(buffer, placeholders);
      const targetFileName = fileName !== undefined && editedFileName.trim()
        ? editedFileName.trim()
        : undefined;
      await onSave(blob, targetFileName);
      setHasChanges(false);
    } catch (saveError) {
      console.error("Error saving document:", saveError);
      setError(saveError instanceof Error ? saveError.message : "Failed to save document");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white">
      <div className="flex shrink-0 flex-col gap-2 bg-slate-800 px-4 py-3 text-white">
        <div className="flex items-center justify-between">
          <h2 className="truncate text-lg font-semibold">{documentTitle}</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={isSaving || isLoading || !hasChanges}
              className="rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSaving ? "Saving..." : "Save"}
            </button>
            <button
              onClick={onClose}
              className="rounded bg-slate-600 px-4 py-2 text-white hover:bg-slate-700"
            >
              Close
            </button>
          </div>
        </div>
        {fileName !== undefined && (
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-300">Filename</label>
            <input
              type="text"
              value={editedFileName}
              onChange={(e) => {
                setEditedFileName(e.target.value);
                setHasChanges(true);
              }}
              className="flex-1 rounded border border-slate-600 bg-slate-700 px-2 py-1 text-sm text-white placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        )}
      </div>

      {error && (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {placeholders.size > 0 && (
          <aside className="w-80 shrink-0 overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
            <h3 className="mb-3 font-semibold text-slate-700">
              Fill in Fields
            </h3>
            <div className="space-y-3">
              {Array.from(placeholders.entries()).map(
                ([placeholder, value]) => (
                  <div key={placeholder}>
                    <label className="mb-1 block text-xs text-slate-500">
                      {placeholder.replace(/\$\{|\}/g, "")}
                    </label>
                    <input
                      type="text"
                      value={value}
                      onChange={(event) =>
                        handlePlaceholderChange(
                          placeholder,
                          event.target.value
                        )
                      }
                      className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder={placeholder}
                    />
                  </div>
                )
              )}
            </div>
          </aside>
        )}

        <main className="relative min-w-0 flex-1 overflow-hidden bg-slate-100">
          {isLoading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white">
              <div className="text-center">
                <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
                <p className="text-slate-600">Loading document...</p>
              </div>
            </div>
          )}

          {documentBuffer && (
            <div className="h-full overflow-auto">
              <EditorPane
                ref={editorRef}
                documentBuffer={documentBuffer}
                documentTitle={documentTitle}
                onChange={handleEditorChange}
                onError={handleEditorError}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
