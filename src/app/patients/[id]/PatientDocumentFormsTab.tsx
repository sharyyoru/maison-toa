"use client";

import { useState, useEffect } from "react";
import { FileText, Eye, Search, FolderOpen, X, Loader2, Pencil } from "lucide-react";
import { useTranslations } from "next-intl";
import dynamic from "next/dynamic";

const OnlyOfficeEditor = dynamic(() => import("@/components/OnlyOfficeEditor"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
        <p className="text-slate-600">Loading editor...</p>
      </div>
    </div>
  ),
});

const DocxPreviewEditor = dynamic(() => import("@/components/DocxEditor/DocxPreviewEditor"), {
  ssr: false,
  loading: () => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
        <p className="text-slate-600">Loading editor...</p>
      </div>
    </div>
  ),
});

const DocxPreview = dynamic(() => import("@/components/DocxPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
    </div>
  ),
});

interface DocumentForm {
  name: string;
  displayName: string;
  size: number;
  modifiedAt: string;
  fileType: string;
}

interface EditingDocument {
  form: DocumentForm;
  documentKey: string;
  blob?: Blob;
}

interface PatientDocumentFormsTabProps {
  patientId: string;
  patientName: string;
}

function formatDisplayName(fileName: string): string {
  return fileName
    .replace(/\.(docx|doc|xlsx|xls|pptx|ppt|pdf)$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getFileType(fileName: string): string {
  const ext = fileName.split(".").pop()?.toLowerCase() || "";
  return ext;
}

function getFileIcon(fileType: string): string {
  switch (fileType) {
    case "pdf":
      return "📄";
    case "xlsx":
    case "xls":
      return "📊";
    case "pptx":
    case "ppt":
      return "📽️";
    default:
      return "📝";
  }
}

export default function PatientDocumentFormsTab({
  patientId,
  patientName,
}: PatientDocumentFormsTabProps) {
  const t = useTranslations("patient.documentFormsTab");
  const [forms, setForms] = useState<DocumentForm[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedForm, setSelectedForm] = useState<DocumentForm | null>(null);
  const [editingDocument, setEditingDocument] = useState<EditingDocument | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [useOnlyOffice, setUseOnlyOffice] = useState<boolean | null>(null);
  const [onlyOfficeFailed, setOnlyOfficeFailed] = useState(false);

  // Check if OnlyOffice URL is configured
  useEffect(() => {
    const onlyOfficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL;
    console.log("[DocumentForms] OnlyOffice URL:", onlyOfficeUrl);
    setUseOnlyOffice(!!onlyOfficeUrl);
  }, []);

  useEffect(() => {
    async function loadForms() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/patient-forms/list");
        if (!response.ok) throw new Error("Failed to load forms");
        const data = await response.json();
        const formList: DocumentForm[] = (data.forms || []).map((f: any) => ({
          name: f.name,
          displayName: formatDisplayName(f.name),
          size: f.size,
          modifiedAt: f.modifiedAt,
          fileType: getFileType(f.name),
        }));
        setForms(formList);
      } catch (err) {
        console.error("Error loading forms:", err);
        setError(t("loadError"));
      } finally {
        setLoading(false);
      }
    }
    loadForms();
  }, [t]);

  const filteredForms = forms.filter((form) => {
    const matchesSearch =
      searchQuery === "" ||
      form.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      form.name.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSearch;
  });

  const handlePreview = async (form: DocumentForm) => {
    setSelectedForm(form);
    setPreviewUrl(null);
    try {
      const response = await fetch(`/api/patient-forms/serve?file=${encodeURIComponent(form.name)}`);
      if (!response.ok) throw new Error("Preview failed");
      const blob = await response.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Error loading preview:", err);
      setError(t("previewError"));
      setSelectedForm(null);
    }
  };

  const handleEdit = async (form: DocumentForm) => {
    const documentKey = `${patientId}-${form.name}-${Date.now()}`;

    if (useOnlyOffice) {
      setEditingDocument({ form, documentKey });
    } else {
      try {
        const response = await fetch(`/api/patient-forms/serve?file=${encodeURIComponent(form.name)}`);
        if (!response.ok) throw new Error("Failed to load document");
        const blob = await response.blob();
        setEditingDocument({ form, documentKey, blob });
      } catch (err) {
        console.error("Error loading document:", err);
        setError(t("loadError"));
      }
    }
  };

  const handleSaveEditedDocument = async (blob: Blob) => {
    const form = editingDocument?.form;
    if (!form) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patientName.replace(/\s+/g, "_")}_${form.name}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const closeEditor = () => {
    setEditingDocument(null);
    setOnlyOfficeFailed(false);
  };

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setSelectedForm(null);
  };

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-semibold text-slate-900">{t("title")}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-48 rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
          <span className="ml-2 text-xs text-slate-500">{t("loading")}</span>
        </div>
      )}

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">
          {error}
          <button
            onClick={() => setError(null)}
            className="ml-2 text-red-800 underline hover:no-underline"
          >
            {t("dismiss")}
          </button>
        </div>
      )}

      {!loading && !error && forms.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{t("noForms")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("noFormsHint")}</p>
        </div>
      )}

      {!loading && !error && filteredForms.length === 0 && forms.length > 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{t("noResults")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("noResultsHint")}</p>
        </div>
      )}

      {!loading && !error && filteredForms.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredForms.map((form) => (
            <div
              key={form.name}
              className="group rounded-lg border border-slate-200 bg-white p-3 transition-all hover:border-sky-200 hover:shadow-md"
            >
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                  <span className="text-lg">{getFileIcon(form.fileType)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <p
                    className="truncate text-xs font-medium text-slate-900"
                    title={form.displayName}
                  >
                    {form.displayName}
                  </p>
                  <p className="mt-0.5 text-[10px] text-slate-500">
                    {formatFileSize(form.size)} • {form.fileType.toUpperCase()}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-1.5">
                <button
                  onClick={() => handleEdit(form)}
                  className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-emerald-600"
                >
                  <Pencil className="h-3 w-3" />
                  {t("edit")}
                </button>
                <button
                  onClick={() => handlePreview(form)}
                  className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <Eye className="h-3 w-3" />
                  {t("preview")}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {selectedForm && previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50"
          onClick={closePreview}
        >
          <div
            className="relative max-h-[90vh] w-full max-w-4xl overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
              <h3 className="text-sm font-semibold text-slate-900">
                {selectedForm.displayName}
              </h3>
              <button
                onClick={closePreview}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4 max-h-[70vh] overflow-auto">
              {selectedForm.fileType === "pdf" ? (
                <iframe
                  src={previewUrl}
                  className="w-full h-[60vh] border-0"
                  title={selectedForm.displayName}
                />
              ) : (
                <DocxPreview url={previewUrl} fileName={selectedForm.name} />
              )}
            </div>
            <div className="flex items-center justify-end gap-3 border-t border-slate-200 px-4 py-3">
              <button
                onClick={closePreview}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t("close")}
              </button>
              <button
                onClick={() => {
                  const form = selectedForm;
                  closePreview();
                  if (form) handleEdit(form);
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-600"
              >
                <Pencil className="h-4 w-4" />
                {t("edit")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document Editor - OnlyOffice or Fallback */}
      {editingDocument && (
        useOnlyOffice && !onlyOfficeFailed && !editingDocument.blob ? (
          <div className="fixed inset-0 z-50 flex flex-col bg-white">
            <div className="flex items-center justify-between border-b border-slate-200 bg-slate-800 px-4 py-3">
              <h2 className="text-sm font-semibold text-white">
                {editingDocument.form.displayName}
              </h2>
              <button
                onClick={closeEditor}
                className="rounded-lg bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-500"
              >
                {t("close")}
              </button>
            </div>
            <div className="flex-1">
              <OnlyOfficeEditor
                documentUrl={`${window.location.origin}/api/patient-forms/serve?file=${encodeURIComponent(editingDocument.form.name)}`}
                documentKey={editingDocument.documentKey}
                documentTitle={editingDocument.form.displayName}
                fileType={editingDocument.form.fileType}
                mode="edit"
                userName={patientName}
                onClose={closeEditor}
                onError={async (err) => {
                  console.error("OnlyOffice error:", err);
                  // Auto-fallback to DocxPreviewEditor
                  setOnlyOfficeFailed(true);
                  try {
                    const response = await fetch(`/api/patient-forms/serve?file=${encodeURIComponent(editingDocument.form.name)}`);
                    if (response.ok) {
                      const blob = await response.blob();
                      setEditingDocument({ ...editingDocument, blob });
                    }
                  } catch (e) {
                    console.error("Fallback also failed:", e);
                    setError(t("loadError"));
                  }
                }}
              />
            </div>
          </div>
        ) : editingDocument.blob ? (
          <DocxPreviewEditor
            documentBlob={editingDocument.blob}
            documentTitle={editingDocument.form.displayName}
            patientId={patientId}
            documentId={editingDocument.form.name}
            patientData={{}}
            onSave={handleSaveEditedDocument}
            onClose={closeEditor}
          />
        ) : null
      )}
    </div>
  );
}
