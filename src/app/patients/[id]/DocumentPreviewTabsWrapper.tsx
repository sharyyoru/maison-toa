"use client";

import { useState, createContext, useContext, useCallback, ReactNode } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";

// Dynamic imports for preview components
const DocxPreview = dynamic(() => import("@/components/DocxPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
    </div>
  ),
});

const TiffPreview = dynamic(() => import("@/components/TiffPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
    </div>
  ),
});

const HeicPreview = dynamic(() => import("@/components/HeicPreview"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-600"></div>
    </div>
  ),
});

export interface DocumentPreviewTab {
  id: string;
  name: string;
  url: string;
  mimeType: string;
}

interface DocumentPreviewTabsContextValue {
  openTabs: DocumentPreviewTab[];
  activeTabId: string | null;
  addTab: (tab: Omit<DocumentPreviewTab, "id">) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string | null) => void;
}

const DocumentPreviewTabsContext = createContext<DocumentPreviewTabsContextValue | null>(null);

export function useDocumentPreviewTabs() {
  const context = useContext(DocumentPreviewTabsContext);
  if (!context) {
    throw new Error("useDocumentPreviewTabs must be used within DocumentPreviewTabsProvider");
  }
  return context;
}

function getExtension(name: string): string {
  const parts = name.split(".");
  if (parts.length < 2) return "";
  return parts[parts.length - 1].toLowerCase();
}

interface DocumentPreviewTabsWrapperProps {
  children: ReactNode;
  patientId: string;
  medicalTab: string;
  medicalTabs: { id: string; label: string }[];
  CrmTabDropdown: ReactNode;
}

export default function DocumentPreviewTabsWrapper({
  children,
  patientId,
  medicalTab,
  medicalTabs,
  CrmTabDropdown,
}: DocumentPreviewTabsWrapperProps) {
  const [openTabs, setOpenTabs] = useState<DocumentPreviewTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const addTab = useCallback((tab: Omit<DocumentPreviewTab, "id">) => {
    const id = `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTab: DocumentPreviewTab = { ...tab, id };
    
    setOpenTabs((prev) => {
      // Check if a tab with the same URL already exists
      const existing = prev.find((t) => t.url === tab.url);
      if (existing) {
        setActiveTabId(existing.id);
        return prev;
      }
      return [...prev, newTab];
    });
    setActiveTabId(id);
  }, []);

  const removeTab = useCallback((id: string) => {
    setOpenTabs((prev) => {
      const newTabs = prev.filter((t) => t.id !== id);
      // If we're removing the active tab, switch to another tab or null
      if (activeTabId === id) {
        const removedIndex = prev.findIndex((t) => t.id === id);
        if (newTabs.length > 0) {
          // Try to select the previous tab, or the next one
          const newIndex = Math.min(removedIndex, newTabs.length - 1);
          setActiveTabId(newTabs[newIndex]?.id ?? null);
        } else {
          setActiveTabId(null);
        }
      }
      return newTabs;
    });
  }, [activeTabId]);

  const setActiveTab = useCallback((id: string | null) => {
    setActiveTabId(id);
  }, []);

  const contextValue: DocumentPreviewTabsContextValue = {
    openTabs,
    activeTabId,
    addTab,
    removeTab,
    setActiveTab,
  };

  // Check if a document preview tab is active
  const isDocTabActive = activeTabId !== null && openTabs.some((t) => t.id === activeTabId);
  const activeDocTab = isDocTabActive ? openTabs.find((t) => t.id === activeTabId) : null;

  return (
    <DocumentPreviewTabsContext.Provider value={contextValue}>
      <div className="space-y-6">
        <div className="border-b border-slate-200">
          <nav className="-mb-px flex flex-wrap items-center gap-4 text-xs font-medium text-slate-500">
            {medicalTabs.map((tab) => {
              const isActive = !isDocTabActive && tab.id === medicalTab;

              // Special rendering for CRM tab with dropdown
              if (tab.id === "crm") {
                return (
                  <div key={tab.id} onClick={() => setActiveTabId(null)}>
                    {CrmTabDropdown}
                  </div>
                );
              }

              return (
                <Link
                  key={tab.id}
                  href={`/patients/${patientId}?m_tab=${tab.id}`}
                  onClick={() => setActiveTabId(null)}
                  className={
                    (isActive
                      ? "border-sky-500 text-sky-600"
                      : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700") +
                    " inline-flex items-center border-b-2 px-1.5 py-1"
                  }
                >
                  {tab.label}
                </Link>
              );
            })}

            {/* Dynamic document preview tabs */}
            {openTabs.map((tab) => {
              const isActive = activeTabId === tab.id;
              // Truncate filename if too long
              const displayName = tab.name.length > 20 
                ? tab.name.substring(0, 17) + "..." 
                : tab.name;

              return (
                <div
                  key={tab.id}
                  className={
                    (isActive
                      ? "border-sky-500 text-sky-600 bg-sky-50/50"
                      : "border-transparent text-slate-500 hover:border-slate-200 hover:text-slate-700 hover:bg-slate-50/50") +
                    " inline-flex items-center gap-1.5 border-b-2 px-2 py-1 rounded-t-md cursor-pointer group"
                  }
                  onClick={() => setActiveTabId(tab.id)}
                  title={tab.name}
                >
                  {/* File icon */}
                  <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span className="max-w-[120px] truncate">{displayName}</span>
                  {/* Close button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeTab(tab.id);
                    }}
                    className="ml-1 rounded-full p-0.5 hover:bg-slate-200 text-slate-400 hover:text-slate-600 transition-colors"
                    title="Close tab"
                  >
                    <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </nav>
        </div>

        {/* Show document preview content if a doc tab is active */}
        {isDocTabActive && activeDocTab ? (
          <DocumentPreviewContent tab={activeDocTab} onClose={() => removeTab(activeDocTab.id)} />
        ) : (
          children
        )}
      </div>
    </DocumentPreviewTabsContext.Provider>
  );
}

interface DocumentPreviewContentProps {
  tab: DocumentPreviewTab;
  onClose: () => void;
}

function DocumentPreviewContent({ tab, onClose }: DocumentPreviewContentProps) {
  const ext = getExtension(tab.name);
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "jfif", "svg"].includes(ext);
  const isTiff = ["tiff", "tif"].includes(ext);
  const isHeic = ["heic", "heif"].includes(ext);
  const isPdf = ext === "pdf";
  const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
  const isDocx = ext === "docx" || tab.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-sky-100 to-sky-50 text-sky-600">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{tab.name}</h3>
            <p className="text-[11px] text-slate-500">Document Preview</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <a
            href={tab.url}
            download={tab.name}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download
          </a>
          <a
            href={tab.url}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
            Open in New Tab
          </a>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-[11px] font-medium text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
            Close
          </button>
        </div>
      </div>

      {/* Preview Content */}
      <div className="flex items-center justify-center min-h-[500px] rounded-lg border border-slate-100 bg-slate-50/70 p-4">
        {isTiff ? (
          <TiffPreview
            url={tab.url}
            className="max-h-[70vh] max-w-full rounded-xl border border-slate-200 bg-white object-contain shadow-lg"
          />
        ) : isHeic ? (
          <HeicPreview
            url={tab.url}
            className="max-h-[70vh] max-w-full rounded-xl border border-slate-200 bg-white object-contain shadow-lg"
          />
        ) : isImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={tab.url}
            alt={tab.name}
            className="max-h-[70vh] max-w-full rounded-xl border border-slate-200 bg-white object-contain shadow-lg"
          />
        ) : isPdf ? (
          <iframe
            src={tab.url}
            className="h-[70vh] w-full rounded-xl border border-slate-200 bg-white shadow-lg"
            title={tab.name}
          />
        ) : isVideo ? (
          <video
            src={tab.url}
            controls
            className="max-h-[70vh] max-w-full rounded-xl border border-slate-200 bg-black shadow-lg"
          />
        ) : isDocx ? (
          <div className="w-full max-w-4xl">
            <DocxPreview url={tab.url} fileName={tab.name} />
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-slate-100 to-slate-50 text-lg font-bold text-slate-600">
              {ext.toUpperCase() || "FILE"}
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">Preview not available</p>
              <p className="mt-1 text-[11px] text-slate-500">Download the file to view its contents</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
