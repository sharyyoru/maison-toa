"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  DocxEditor,
  type DocxEditorRef,
} from "@eigenpal/docx-editor-react";
import "@eigenpal/docx-editor-react/styles.css";

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
  onFileNameChange?: (fileName: string) => void;
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

function removeNextFieldInstructions(xml: string): string {
  // Remove Word NEXT field instructions that render as visible text in the editor.
  let result = xml.replace(
    /<w:r>(?:[^<]|<(?!\/w:r>))*?<w:instrText[^>]*>\s*NEXT\s*<\/w:instrText>(?:[^<]|<(?!\/w:r>))*?<\/w:r>/gi,
    ""
  );
  // Remove orphaned begin/end field char markers left behind.
  result = result.replace(
    /<w:r>\s*<w:fldChar[^>]*\bfldCharType="begin"[^>]*\/>\s*<\/w:r>/gi,
    ""
  );
  result = result.replace(
    /<w:r>\s*<w:fldChar[^>]*\bfldCharType="end"[^>]*\/>\s*<\/w:r>/gi,
    ""
  );
  return result;
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
    xml = removeNextFieldInstructions(xml);
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
  onFileNameChange,
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

  const handleEditorChange = () => {
    setHasChanges(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);

    try {
      const buffer = await editorRef.current?.save({ selective: false });
      if (!buffer) throw new Error("The editor did not return a document");

      const blob = await applyPlaceholders(buffer, placeholders);
      const targetFileName = fileName !== undefined && editedFileName.trim()
        ? editedFileName.trim()
        : undefined;
      await onSave(blob, targetFileName);
      setHasChanges(false);
    } catch (saveError) {
      console.error("Error saving document:", saveError);
      setError("Failed to save document");
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
                onFileNameChange?.(e.target.value);
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
              <DocxEditor
                ref={editorRef}
                documentBuffer={documentBuffer}
                documentName={documentTitle}
                documentNameEditable={false}
                mode="editing"
                onChange={handleEditorChange}
                onError={(editorError) => {
                  console.error("DOCX editor error:", editorError);
                  setError("The document editor encountered an error");
                }}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
