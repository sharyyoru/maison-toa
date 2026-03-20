"use client";

import { useEffect, useRef, useState } from "react";

declare global {
  interface Window {
    DocsAPI?: {
      DocEditor: new (elementId: string, config: OnlyOfficeConfig) => OnlyOfficeDocEditor;
    };
  }
}

interface OnlyOfficeDocEditor {
  destroyEditor: () => void;
}

interface OnlyOfficeConfig {
  document: {
    fileType: string;
    key: string;
    title: string;
    url: string;
    permissions?: {
      download: boolean;
      edit: boolean;
      print: boolean;
      review: boolean;
    };
  };
  documentType: "word" | "cell" | "slide";
  editorConfig: {
    callbackUrl?: string;
    lang?: string;
    mode?: "view" | "edit";
    user?: {
      id: string;
      name: string;
    };
    customization?: {
      autosave?: boolean;
      chat?: boolean;
      comments?: boolean;
      compactHeader?: boolean;
      compactToolbar?: boolean;
      feedback?: boolean;
      forcesave?: boolean;
      help?: boolean;
      hideRightMenu?: boolean;
      hideRulers?: boolean;
      logo?: {
        image?: string;
        imageEmbedded?: string;
        url?: string;
      };
      toolbarNoTabs?: boolean;
      zoom?: number;
    };
  };
  events?: {
    onAppReady?: () => void;
    onDocumentStateChange?: (event: { data: boolean }) => void;
    onError?: (event: { data: string }) => void;
    onRequestClose?: () => void;
    onRequestSaveAs?: (event: { data: { title: string; url: string } }) => void;
    onWarning?: (event: { data: string }) => void;
  };
  height?: string;
  type?: "desktop" | "mobile" | "embedded";
  width?: string;
}

interface OnlyOfficeEditorProps {
  documentUrl: string;
  documentKey: string;
  documentTitle: string;
  fileType?: string;
  mode?: "view" | "edit";
  callbackUrl?: string;
  userId?: string;
  userName?: string;
  onClose?: () => void;
  onSave?: () => void;
  onError?: (error: string) => void;
}

const ONLYOFFICE_SERVER_URL = process.env.NEXT_PUBLIC_ONLYOFFICE_URL || "http://localhost:8080";
const ONLYOFFICE_API_KEY = process.env.NEXT_PUBLIC_ONLYOFFICE_API_KEY || "";

export default function OnlyOfficeEditor({
  documentUrl,
  documentKey,
  documentTitle,
  fileType = "docx",
  mode = "edit",
  callbackUrl,
  userId = "user-1",
  userName = "User",
  onClose,
  onSave,
  onError,
}: OnlyOfficeEditorProps) {
  const editorRef = useRef<OnlyOfficeDocEditor | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const scriptLoadedRef = useRef(false);

  useEffect(() => {
    // Load OnlyOffice API script
    const loadScript = () => {
      return new Promise<void>((resolve, reject) => {
        if (window.DocsAPI) {
          resolve();
          return;
        }

        if (scriptLoadedRef.current) {
          // Wait for script to load
          const checkInterval = setInterval(() => {
            if (window.DocsAPI) {
              clearInterval(checkInterval);
              resolve();
            }
          }, 100);
          return;
        }

        scriptLoadedRef.current = true;
        const script = document.createElement("script");
        script.src = `${ONLYOFFICE_SERVER_URL}/web-apps/apps/api/documents/api.js`;
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error("Failed to load OnlyOffice API"));
        document.head.appendChild(script);
      });
    };

    const initEditor = async () => {
      try {
        await loadScript();
        setIsLoading(false);

        if (!window.DocsAPI) {
          throw new Error("OnlyOffice API not available");
        }

        const config: OnlyOfficeConfig = {
          document: {
            fileType,
            key: documentKey,
            title: documentTitle,
            url: documentUrl,
            permissions: {
              download: true,
              edit: mode === "edit",
              print: true,
              review: false,
            },
          },
          documentType: "word",
          editorConfig: {
            callbackUrl: callbackUrl || `${window.location.origin}/api/documents/onlyoffice/callback`,
            lang: "en",
            mode,
            user: {
              id: userId,
              name: userName,
            },
            customization: {
              autosave: true,
              chat: false,
              comments: true,
              compactHeader: false,
              compactToolbar: false,
              feedback: false,
              forcesave: true,
              help: false,
              hideRightMenu: false,
              hideRulers: false,
              toolbarNoTabs: false,
              zoom: 100,
            },
          },
          events: {
            onAppReady: () => {
              console.log("OnlyOffice editor ready");
            },
            onDocumentStateChange: (event) => {
              if (event.data) {
                console.log("Document has unsaved changes");
              }
            },
            onError: (event) => {
              console.error("OnlyOffice error:", event.data);
              setError(event.data);
              onError?.(event.data);
            },
            onRequestClose: () => {
              onClose?.();
            },
          },
          height: "100%",
          type: "desktop",
          width: "100%",
        };

        editorRef.current = new window.DocsAPI.DocEditor("onlyoffice-editor", config);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to initialize editor";
        setError(errorMessage);
        setIsLoading(false);
        onError?.(errorMessage);
      }
    };

    initEditor();

    return () => {
      if (editorRef.current) {
        try {
          editorRef.current.destroyEditor();
        } catch (e) {
          console.error("Error destroying editor:", e);
        }
        editorRef.current = null;
      }
    };
  }, [documentUrl, documentKey, documentTitle, fileType, mode, callbackUrl, userId, userName, onClose, onSave, onError]);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-50 p-8">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
          <svg className="mx-auto mb-4 h-12 w-12 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="mb-2 text-lg font-semibold text-red-800">OnlyOffice Server Not Available</h3>
          <p className="mb-4 text-sm text-red-600">{error}</p>
          <div className="text-left text-xs text-slate-600">
            <p className="mb-2 font-medium">To use OnlyOffice Document Server:</p>
            <ol className="list-inside list-decimal space-y-1">
              <li>Install Docker on your machine</li>
              <li>Run: <code className="rounded bg-slate-100 px-1 py-0.5">docker run -i -t -d -p 8080:80 onlyoffice/documentserver</code></li>
              <li>Wait ~30 seconds for the server to start</li>
              <li>Add <code className="rounded bg-slate-100 px-1 py-0.5">NEXT_PUBLIC_ONLYOFFICE_URL=http://localhost:8080</code> to .env.local</li>
              <li>Refresh this page</li>
            </ol>
          </div>
        </div>
        <button
          onClick={onClose}
          className="rounded-lg bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300"
        >
          Close
        </button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
          <p className="text-sm text-slate-600">Loading OnlyOffice Editor...</p>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="h-full w-full">
      <div id="onlyoffice-editor" className="h-full w-full" />
    </div>
  );
}
