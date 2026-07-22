"use client";

import "grapesjs/dist/css/grapes.min.css";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { Editor } from "grapesjs";
import { css as cssLanguage } from "@codemirror/lang-css";
import { html as htmlLanguage } from "@codemirror/lang-html";
import {
  buildCustomPageDocument,
  DEFAULT_CUSTOM_LANDING_SETTINGS,
  getCustomLandingStarter,
  type CustomLandingDraft,
  type CustomLandingLanguage,
  type CustomLandingPageSettings,
} from "@/lib/customLandingPage";
import {
  Code2,
  Eye,
  ImagePlus,
  Loader2,
  Monitor,
  Paintbrush,
  RotateCcw,
  Save,
  Send,
  Smartphone,
  Tablet,
  X,
} from "lucide-react";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

type ToastHandler = (message: string, ok?: boolean) => void;

interface CustomLandingPageEditorProps {
  onExit: () => void;
  showToast: ToastHandler;
}

function makeLocalDraft(
  language: CustomLandingLanguage,
  saved: CustomLandingDraft | null
): CustomLandingDraft {
  if (saved) return saved;
  const starter = getCustomLandingStarter(language);
  return {
    projectData: {},
    ...starter,
    updatedAt: new Date(0).toISOString(),
  };
}

export default function CustomLandingPageEditor({
  onExit,
  showToast,
}: CustomLandingPageEditorProps) {
  const editorHostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [settings, setSettings] = useState<CustomLandingPageSettings>(
    DEFAULT_CUSTOM_LANDING_SETTINGS
  );
  const [drafts, setDrafts] = useState<Record<CustomLandingLanguage, CustomLandingDraft>>({
    en: makeLocalDraft("en", null),
    fr: makeLocalDraft("fr", null),
  });
  const [language, setLanguage] = useState<CustomLandingLanguage>("en");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [sourceOpen, setSourceOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [sourceHtml, setSourceHtml] = useState("");
  const [sourceCss, setSourceCss] = useState("");
  const [sourceTab, setSourceTab] = useState<"html" | "css">("html");

  useEffect(() => {
    fetch("/api/settings/booking-landing-custom", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Failed to load the custom landing page.");
        return response.json();
      })
      .then((value: CustomLandingPageSettings) => {
        setSettings(value);
        setDrafts({
          en: makeLocalDraft("en", value.drafts.en),
          fr: makeLocalDraft("fr", value.drafts.fr),
        });
      })
      .catch(() => showToast("Failed to load the custom landing page", false))
      .finally(() => setLoading(false));
  }, [showToast]);

  useEffect(() => {
    if (loading || !editorHostRef.current) return;

    let disposed = false;
    const draft = drafts[language];

    Promise.all([import("grapesjs"), import("grapesjs-preset-webpage")]).then(
      ([grapesModule, presetModule]) => {
        if (disposed || !editorHostRef.current) return;
        const grapesjs = grapesModule.default;
        const presetWebpage = presetModule.default;
        const hasProjectData = Object.keys(draft.projectData ?? {}).length > 0;

        const editor = grapesjs.init({
          container: editorHostRef.current,
          height: "100%",
          width: "auto",
          storageManager: false,
          fromElement: false,
          plugins: [presetWebpage],
          projectData: hasProjectData ? draft.projectData : undefined,
          components: hasProjectData ? undefined : draft.html,
          style: hasProjectData ? undefined : draft.css,
          parser: { optionsHtml: { allowScripts: false } },
          assetManager: {
            upload: false,
            uploadFile: async (event) => {
              const transferFiles = "dataTransfer" in event ? event.dataTransfer?.files : null;
              const inputFiles = "target" in event
                ? (event.target as HTMLInputElement | null)?.files
                : null;
              const files = Array.from(transferFiles ?? inputFiles ?? []);

              for (const file of files) {
                const formData = new FormData();
                formData.append("file", file);
                const response = await fetch("/api/page-builder/upload-image", {
                  method: "POST",
                  body: formData,
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Image upload failed.");
                editor.AssetManager.add({ src: result.url, name: file.name });
              }
            },
          },
          deviceManager: {
            devices: [
              { id: "desktop", name: "Desktop", width: "" },
              { id: "tablet", name: "Tablet", width: "768px", widthMedia: "992px" },
              { id: "mobile", name: "Mobile", width: "375px", widthMedia: "480px" },
            ],
          },
        });

        editor.on("update", () => setDirty(true));
        editorRef.current = editor;
        setDirty(false);
      }
    );

    return () => {
      disposed = true;
      editorRef.current?.destroy();
      editorRef.current = null;
    };
    // Draft changes are intentionally loaded only when the language/editor changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, loading]);

  const captureDraft = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return drafts[language];
    return {
      projectData: editor.getProjectData() as Record<string, unknown>,
      html: editor.getHtml(),
      css: String(editor.getCss({ keepUnusedStyles: true })),
      updatedAt: new Date().toISOString(),
    };
  }, [drafts, language]);

  const switchLanguage = (nextLanguage: CustomLandingLanguage) => {
    if (nextLanguage === language) return;
    const current = captureDraft();
    setDrafts((previous) => ({ ...previous, [language]: current }));
    setLanguage(nextLanguage);
  };

  const saveDraft = async (quiet = false) => {
    const draft = captureDraft();
    setSaving(true);
    try {
      const response = await fetch("/api/settings/booking-landing-custom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveDraft", language, ...draft }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Failed to save draft.");
      setDrafts((previous) => ({ ...previous, [language]: draft }));
      setSettings(value);
      setDirty(false);
      if (!quiet) showToast(`${language.toUpperCase()} custom-page draft saved`);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to save draft", false);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!(await saveDraft(true))) return;
    setSaving(true);
    try {
      const response = await fetch("/api/settings/booking-landing-custom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "publish" }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Failed to publish custom page.");
      setSettings(value);
      showToast("Custom landing page published in English and French");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to publish", false);
    } finally {
      setSaving(false);
    }
  };

  const useVisualPage = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/settings/booking-landing-custom", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "useVisual" }),
      });
      const value = await response.json();
      if (!response.ok) throw new Error(value.error || "Failed to restore visual page.");
      setSettings(value);
      showToast("The existing visual landing page is live again");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Failed to restore visual page", false);
    } finally {
      setSaving(false);
    }
  };

  const openSource = () => {
    const draft = captureDraft();
    setSourceHtml(draft.html);
    setSourceCss(draft.css);
    setSourceOpen(true);
  };

  const applySource = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.setComponents(sourceHtml);
    editor.setStyle(sourceCss);
    setSourceOpen(false);
    setDirty(true);
    showToast("HTML and CSS applied to the canvas");
  };

  const resetStarter = () => {
    const editor = editorRef.current;
    if (!editor || !window.confirm(`Reset the ${language.toUpperCase()} draft to the Maison Tōa starter?`)) return;
    const starter = getCustomLandingStarter(language);
    editor.setComponents(starter.html);
    editor.setStyle(starter.css);
    setDirty(true);
  };

  const openPreview = () => {
    const draft = captureDraft();
    setSourceHtml(draft.html);
    setSourceCss(draft.css);
    setPreviewOpen(true);
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-slate-100">
        <Loader2 className="w-9 h-9 animate-spin text-slate-700" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-slate-100">
      <header className="bg-white border-b border-slate-200 px-4 py-2.5 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <button onClick={onExit} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-900">
            <Paintbrush className="w-4 h-4" /> Visual builder
          </button>
          <div className="h-6 w-px bg-slate-200" />
          <div>
            <div className="font-semibold text-sm text-slate-900">Custom HTML/CSS Landing Page</div>
            <div className="text-xs text-slate-500">
              {settings.activeMode === "custom" ? "Custom page is live" : "Visual page is live"}
              {dirty ? " · Unsaved changes" : ""}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="flex rounded-lg bg-slate-100 p-1">
            {(["en", "fr"] as CustomLandingLanguage[]).map((item) => (
              <button
                key={item}
                onClick={() => switchLanguage(item)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold uppercase ${
                  language === item ? "bg-white text-slate-900 shadow-sm" : "text-slate-500"
                }`}
              >
                {item}
                {settings.drafts[item] ? " ✓" : ""}
              </button>
            ))}
          </div>
          <button onClick={openSource} className="cms-custom-button"><Code2 className="w-4 h-4" /> HTML/CSS</button>
          <button onClick={openPreview} className="cms-custom-button"><Eye className="w-4 h-4" /> Preview</button>
          <button onClick={() => saveDraft()} disabled={saving} className="cms-custom-button">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save draft
          </button>
          {settings.activeMode === "custom" && (
            <button onClick={useVisualPage} disabled={saving} className="cms-custom-button text-amber-700">
              <RotateCcw className="w-4 h-4" /> Use visual
            </button>
          )}
          <button onClick={publish} disabled={saving} className="flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            <Send className="w-4 h-4" /> Publish
          </button>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <ImagePlus className="w-4 h-4" /> Open the GrapesJS Asset Manager to upload images to existing page-builder storage.
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => editorRef.current?.setDevice("desktop")} title="Desktop" className="cms-icon-button"><Monitor className="w-4 h-4" /></button>
          <button onClick={() => editorRef.current?.setDevice("tablet")} title="Tablet" className="cms-icon-button"><Tablet className="w-4 h-4" /></button>
          <button onClick={() => editorRef.current?.setDevice("mobile")} title="Mobile" className="cms-icon-button"><Smartphone className="w-4 h-4" /></button>
          <button onClick={resetStarter} className="ml-2 text-xs text-slate-500 hover:text-slate-900">Reset starter</button>
        </div>
      </div>

      <div className="flex-1 min-h-0 p-3">
        <div ref={editorHostRef} className="h-full overflow-hidden rounded-xl border border-slate-300 bg-white shadow-sm" />
      </div>

      {sourceOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-950/60 p-4 flex items-center justify-center">
          <div className="w-full max-w-6xl h-[86vh] bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden">
            <div className="px-5 py-3 border-b flex items-center justify-between">
              <div>
                <h2 className="font-bold text-slate-900">Edit source · {language.toUpperCase()}</h2>
                <p className="text-xs text-slate-500">Applying source rebuilds this custom canvas only.</p>
              </div>
              <button onClick={() => setSourceOpen(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="px-4 pt-3 flex gap-1">
              {(["html", "css"] as const).map((tab) => (
                <button key={tab} onClick={() => setSourceTab(tab)} className={`px-4 py-2 rounded-t-lg text-sm font-semibold uppercase ${sourceTab === tab ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"}`}>{tab}</button>
              ))}
            </div>
            <div className="flex-1 min-h-0 border-y">
              {sourceTab === "html" ? (
                <CodeMirror value={sourceHtml} height="100%" className="h-full overflow-auto" extensions={[htmlLanguage()]} onChange={setSourceHtml} />
              ) : (
                <CodeMirror value={sourceCss} height="100%" className="h-full overflow-auto" extensions={[cssLanguage()]} onChange={setSourceCss} />
              )}
            </div>
            <div className="p-4 flex justify-end gap-2">
              <button onClick={() => setSourceOpen(false)} className="cms-custom-button">Cancel</button>
              <button onClick={applySource} className="rounded-lg bg-slate-900 px-5 py-2 text-sm font-semibold text-white">Apply to canvas</button>
            </div>
          </div>
        </div>
      )}

      {previewOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-950/70 p-4 flex flex-col">
          <div className="bg-white rounded-t-xl px-4 py-3 flex items-center justify-between">
            <div className="font-semibold">Draft preview · {language.toUpperCase()}</div>
            <button onClick={() => setPreviewOpen(false)}><X className="w-5 h-5" /></button>
          </div>
          <iframe
            title="Custom landing page draft preview"
            className="w-full flex-1 bg-white rounded-b-xl"
            sandbox="allow-top-navigation-by-user-activation"
            srcDoc={buildCustomPageDocument(sourceHtml, sourceCss)}
          />
        </div>
      )}

      <style jsx global>{`
        .cms-custom-button { display: inline-flex; align-items: center; gap: .4rem; border: 1px solid #e2e8f0; border-radius: .5rem; background: white; padding: .45rem .7rem; font-size: .8rem; font-weight: 600; color: #475569; }
        .cms-custom-button:hover { background: #f8fafc; color: #0f172a; }
        .cms-custom-button:disabled { opacity: .5; cursor: not-allowed; }
        .cms-icon-button { display: inline-flex; padding: .45rem; border-radius: .45rem; color: #64748b; }
        .cms-icon-button:hover { background: #f1f5f9; color: #0f172a; }
        .gjs-one-bg { background-color: #111827; }
        .gjs-two-color { color: #e5e7eb; }
        .gjs-three-bg { background-color: #2563eb; color: white; }
        .gjs-four-color, .gjs-four-color-h:hover { color: #60a5fa; }
      `}</style>
    </div>
  );
}
