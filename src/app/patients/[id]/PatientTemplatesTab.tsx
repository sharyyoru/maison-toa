"use client";

import { useState, useEffect } from "react";
import { FileText, Download, Eye, Search, FolderOpen, X, Loader2, Pencil } from "lucide-react";
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

interface EditingDocument {
  template: Template;
  documentKey: string;
  blob?: Blob;
}

interface Template {
  name: string;
  displayName: string;
  category: string;
  path: string;
}


interface PatientTemplatesTabProps {
  patientId: string;
  patientName: string;
  patientFirstName: string;
  patientLastName: string;
  patientEmail?: string | null;
  patientPhone?: string | null;
  patientDob?: string | null;
  patientStreetAddress?: string | null;
  patientPostalCode?: string | null;
  patientTown?: string | null;
}

const TEMPLATE_CATEGORIES: Record<string, { en: string; fr: string }> = {
  "post_op": { en: "Post-Operative Instructions", fr: "Instructions post-opératoires" },
  "insurance": { en: "Insurance Documents", fr: "Documents d'assurance" },
  "letters": { en: "Letters & Attestations", fr: "Lettres et attestations" },
  "other": { en: "Other Templates", fr: "Autres modèles" },
};

function categorizeTemplate(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes("po ") || lowerName.includes("po_") || lowerName.startsWith("modèle po") || lowerName.startsWith("po ") || lowerName.includes("post")) {
    return "post_op";
  }
  if (lowerName.includes("assurance") || lowerName.includes("insurance") || lowerName.includes("prise en charge")) {
    return "insurance";
  }
  if (lowerName.includes("lettre") || lowerName.includes("attestation") || lowerName.includes("convocation")) {
    return "letters";
  }
  return "other";
}

function formatDisplayName(fileName: string): string {
  return fileName
    .replace(/\.docx$/i, "")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}


export default function PatientTemplatesTab({
  patientId,
  patientName,
  patientFirstName,
  patientLastName,
  patientEmail,
  patientPhone,
  patientDob,
  patientStreetAddress,
  patientPostalCode,
  patientTown,
}: PatientTemplatesTabProps) {
  const t = useTranslations("patient.templatesTab");
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);
  const [editingDocument, setEditingDocument] = useState<EditingDocument | null>(null);
  const [generating, setGenerating] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [useOnlyOffice, setUseOnlyOffice] = useState<boolean | null>(null);
  const [onlyOfficeFailed, setOnlyOfficeFailed] = useState(false);

  // Check if OnlyOffice URL is configured
  useEffect(() => {
    const onlyOfficeUrl = process.env.NEXT_PUBLIC_ONLYOFFICE_URL;
    console.log("[Templates] OnlyOffice URL:", onlyOfficeUrl);
    setUseOnlyOffice(!!onlyOfficeUrl);
  }, []);

  const patientData = {
    firstName: patientFirstName,
    lastName: patientLastName,
    email: patientEmail || undefined,
    phone: patientPhone || undefined,
    birthdate: patientDob || undefined,
  };

  useEffect(() => {
    async function loadTemplates() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/templates/list");
        if (!response.ok) throw new Error("Failed to load templates");
        const data = await response.json();
        const templateList: Template[] = (data.templates || []).map((name: string) => ({
          name,
          displayName: formatDisplayName(name),
          category: categorizeTemplate(name),
          path: `/forms/templates/${name}`,
        }));
        setTemplates(templateList);
      } catch (err) {
        console.error("Error loading templates:", err);
        setError(t("loadError"));
      } finally {
        setLoading(false);
      }
    }
    loadTemplates();
  }, [t]);

  const filteredTemplates = templates.filter((template) => {
    const matchesSearch =
      searchQuery === "" ||
      template.displayName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory =
      selectedCategory === "all" || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const groupedTemplates = filteredTemplates.reduce(
    (acc, template) => {
      if (!acc[template.category]) acc[template.category] = [];
      acc[template.category].push(template);
      return acc;
    },
    {} as Record<string, Template[]>
  );

  const handleDownload = async (template: Template) => {
    try {
      setGenerating(true);
      const response = await fetch("/api/templates/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName: template.name, patientId, patientName }),
      });
      if (!response.ok) throw new Error("Failed to generate document");
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${patientName.replace(/\s+/g, "_")}_${template.name}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Error generating document:", err);
      setError(t("generateError"));
    } finally {
      setGenerating(false);
    }
  };

  const handlePreview = async (template: Template) => {
    setSelectedTemplate(template);
    setPreviewUrl(null);
    try {
      const response = await fetch("/api/templates/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ templateName: template.name, patientId }),
      });
      if (!response.ok) throw new Error("Preview failed");
      const blob = await response.blob();
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error("Error loading preview:", err);
      setError(t("generateError"));
      setSelectedTemplate(null);
    }
  };

  const handleEdit = async (template: Template) => {
    const documentKey = `${patientId}-${template.name}-${Date.now()}`;
    
    if (useOnlyOffice) {
      // Use OnlyOffice
      setEditingDocument({ template, documentKey });
    } else {
      // Fallback: fetch blob for DocxPreviewEditor
      try {
        const response = await fetch("/api/templates/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateName: template.name, patientId }),
        });
        if (!response.ok) throw new Error("Failed to load document");
        const blob = await response.blob();
        setEditingDocument({ template, documentKey, blob });
      } catch (err) {
        console.error("Error loading document:", err);
        setError(t("generateError"));
      }
    }
  };

  const handleSaveEditedDocument = async (blob: Blob) => {
    const template = editingDocument?.template;
    if (!template) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${patientName.replace(/\s+/g, "_")}_${template.name}`;
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
    setSelectedTemplate(null);
  };

  const categories = Object.keys(TEMPLATE_CATEGORIES);

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
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">{t("allCategories")}</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {TEMPLATE_CATEGORIES[cat].en}
              </option>
            ))}
          </select>
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

      {!loading && !error && templates.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <FolderOpen className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{t("noTemplates")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("noTemplatesHint")}</p>
        </div>
      )}

      {!loading && !error && filteredTemplates.length === 0 && templates.length > 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <Search className="mb-3 h-12 w-12 text-slate-300" />
          <p className="text-sm font-medium text-slate-600">{t("noResults")}</p>
          <p className="mt-1 text-xs text-slate-500">{t("noResultsHint")}</p>
        </div>
      )}

      {!loading && !error && filteredTemplates.length > 0 && (
        <div className="space-y-6">
          {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
            <div key={category}>
              <h4 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <FileText className="h-3.5 w-3.5" />
                {TEMPLATE_CATEGORIES[category]?.en || category}
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                  {categoryTemplates.length}
                </span>
              </h4>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {categoryTemplates.map((template) => (
                  <div
                    key={template.name}
                    className="group rounded-lg border border-slate-200 bg-white p-3 transition-all hover:border-sky-200 hover:shadow-md"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600">
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className="truncate text-xs font-medium text-slate-900"
                          title={template.displayName}
                        >
                          {template.displayName}
                        </p>
                        <p className="mt-0.5 text-[10px] text-slate-500">
                          {TEMPLATE_CATEGORIES[template.category]?.en}
                        </p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-1.5">
                      <button
                        onClick={() => handleDownload(template)}
                        disabled={generating}
                        className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-sky-500 px-2 py-1.5 text-[11px] font-medium text-white transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {generating ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Download className="h-3 w-3" />
                        )}
                        {t("download")}
                      </button>
                      <button
                        onClick={() => handleEdit(template)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                      >
                        <Pencil className="h-3 w-3" />
                        {t("edit")}
                      </button>
                      <button
                        onClick={() => handlePreview(template)}
                        className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                      >
                        <Eye className="h-3 w-3" />
                        {t("preview")}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Preview modal */}
      {selectedTemplate && previewUrl && (
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
                {selectedTemplate.displayName}
              </h3>
              <button
                onClick={closePreview}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="p-4">
              <DocxPreview url={previewUrl} fileName={selectedTemplate.name} />
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
                  const template = selectedTemplate;
                  closePreview();
                  if (template) handleEdit(template);
                }}
                className="inline-flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100"
              >
                <Pencil className="h-4 w-4" />
                {t("edit")}
              </button>
              <button
                onClick={() => handleDownload(selectedTemplate)}
                disabled={generating}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {generating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {t("downloadDocument")}
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
                {editingDocument.template.displayName}
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
                documentUrl={`${window.location.origin}/api/templates/serve?template=${encodeURIComponent(editingDocument.template.name)}&patientId=${patientId}`}
                documentKey={editingDocument.documentKey}
                documentTitle={editingDocument.template.displayName}
                fileType="docx"
                mode="edit"
                userName={patientName}
                onClose={closeEditor}
                onError={async (err) => {
                  console.error("OnlyOffice error:", err);
                  // Auto-fallback to DocxPreviewEditor
                  setOnlyOfficeFailed(true);
                  try {
                    const response = await fetch(`/api/templates/serve?template=${encodeURIComponent(editingDocument.template.name)}&patientId=${patientId}`);
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
            documentTitle={editingDocument.template.displayName}
            patientId={patientId}
            documentId={editingDocument.template.name}
            patientData={patientData}
            onSave={handleSaveEditedDocument}
            onClose={closeEditor}
          />
        ) : null
      )}
    </div>
  );
}
