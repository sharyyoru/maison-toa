"use client";

// LIB-001 – Image Library for Email Templates
// Centralized place to upload, browse, reuse and delete the images used in
// Aliice emails. Uses the same Supabase storage bucket ("emailgallery") as the
// email template editor, so every image uploaded here is immediately available
// when building templates and newsletters.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import RequireAuth from "@/components/RequireAuth";

type GalleryImage = {
  name: string;
  url: string;
  created_at: string;
  size: number | null;
};

const BUCKET = "emailgallery";

export default function ImageLibraryPage() {
  const [images, setImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadImages = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data, error: listError } = await supabaseClient.storage
        .from(BUCKET)
        .list("", { limit: 500, sortBy: { column: "created_at", order: "desc" } });
      if (listError) throw listError;
      const rows: GalleryImage[] = (data || [])
        .filter((file) => file.name && !file.name.endsWith("/"))
        .map((file) => {
          const { data: urlData } = supabaseClient.storage.from(BUCKET).getPublicUrl(file.name);
          return {
            name: file.name,
            url: urlData.publicUrl,
            created_at: file.created_at || new Date().toISOString(),
            size: (file.metadata as { size?: number } | null)?.size ?? null,
          };
        });
      setImages(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function handleUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    setUploading(true);
    setError(null);
    try {
      for (const file of Array.from(files)) {
        if (!file.type.startsWith("image/")) continue;
        const fileExt = file.name.split(".").pop()?.toLowerCase() || "png";
        const baseName = file.name.replace(/\.[^.]+$/, "").replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 40);
        const fileName = `${Date.now()}-${baseName}.${fileExt}`;
        const { error: uploadError } = await supabaseClient.storage
          .from(BUCKET)
          .upload(fileName, file, { contentType: file.type });
        if (uploadError) throw uploadError;
      }
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  async function handleDelete(imageName: string) {
    if (!confirm("Delete this image? Emails already sent keep their copy, but templates using it will lose the image.")) return;
    try {
      const { error: removeError } = await supabaseClient.storage.from(BUCKET).remove([imageName]);
      if (removeError) throw removeError;
      await loadImages();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete image");
    }
  }

  async function handleCopyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopiedUrl(url);
      setTimeout(() => setCopiedUrl(null), 2000);
    } catch {
      // ignore
    }
  }

  function formatSize(size: number | null) {
    if (!size) return "";
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(0)} KB`;
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }

  const filtered = search.trim()
    ? images.filter((img) => img.name.toLowerCase().includes(search.trim().toLowerCase()))
    : images;

  return (
    <RequireAuth>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Image Library</h1>
            <p className="text-xs text-slate-500">
              Upload and manage the images used in email templates and newsletters. Every image here is available directly in the email editor.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => void handleUpload(e.target.files)}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0l-4 4m4-4l4 4M4 20h16" />
              </svg>
              {uploading ? "Uploading..." : "Upload images"}
            </button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
          <div className="mb-4 flex items-center justify-between gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search images..."
              className="w-full max-w-xs rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <span className="shrink-0 text-[11px] text-slate-400">{filtered.length} image{filtered.length === 1 ? "" : "s"}</span>
          </div>

          {error && (
            <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
          )}

          {loading ? (
            <p className="py-10 text-center text-xs text-slate-400">Loading images...</p>
          ) : filtered.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm text-slate-400">No images yet.</p>
              <p className="mt-1 text-xs text-slate-400">Upload images to reuse them in email templates and newsletters.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
              {filtered.map((img) => (
                <div key={img.name} className="group relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt={img.name} className="h-32 w-full object-contain bg-white" loading="lazy" />
                  <div className="border-t border-slate-100 px-2 py-1.5">
                    <p className="truncate text-[10px] font-medium text-slate-700" title={img.name}>{img.name}</p>
                    <p className="text-[9px] text-slate-400">
                      {new Date(img.created_at).toLocaleDateString("fr-CH")}{img.size ? ` · ${formatSize(img.size)}` : ""}
                    </p>
                  </div>
                  <div className="absolute inset-x-0 top-0 flex justify-end gap-1 bg-gradient-to-b from-slate-900/50 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => void handleCopyUrl(img.url)}
                      title="Copy image URL"
                      className="rounded-md bg-white/90 px-1.5 py-1 text-[10px] font-medium text-slate-700 shadow hover:bg-white"
                    >
                      {copiedUrl === img.url ? "✓ Copied" : "Copy URL"}
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(img.name)}
                      title="Delete image"
                      className="rounded-md bg-red-500/90 px-1.5 py-1 text-[10px] font-medium text-white shadow hover:bg-red-600"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
