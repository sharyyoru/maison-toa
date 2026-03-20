"use client";

import { useEffect, useState } from "react";

interface HeicPreviewProps {
  url: string;
  className?: string;
  onError?: (msg: string) => void;
}

export default function HeicPreview({ url, className, onError }: HeicPreviewProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [convertedUrl, setConvertedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;

    async function convertHeic() {
      try {
        setLoading(true);
        setError(null);

        // Use server-side API route for reliable HEIC → JPEG conversion
        const apiUrl = `/api/documents/convert-heic?url=${encodeURIComponent(url)}`;
        const response = await fetch(apiUrl);

        if (!response.ok) {
          const errorData = await response.json().catch(() => null);
          throw new Error(errorData?.error || `Server conversion failed: ${response.statusText}`);
        }

        if (cancelled) return;

        const jpegBlob = await response.blob();
        objectUrl = URL.createObjectURL(jpegBlob);
        setConvertedUrl(objectUrl);
        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          const errorMsg = typeof err === "string" ? err : (err instanceof Error ? err.message : "Failed to convert HEIC");
          setError(errorMsg);
          setLoading(false);
          onError?.(errorMsg);
        }
      }
    }

    convertHeic();

    return () => {
      cancelled = true;
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [url, onError]);

  // Clean up previous object URL when convertedUrl changes
  useEffect(() => {
    return () => {
      if (convertedUrl) {
        URL.revokeObjectURL(convertedUrl);
      }
    };
  }, [convertedUrl]);

  return (
    <div className={className}>
      {loading && (
        <div className="flex items-center justify-center min-h-[100px]">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
            <p className="text-xs text-slate-500">Converting HEIC...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center min-h-[100px]">
          <div className="text-center">
            <p className="text-xs text-red-600">Failed to convert HEIC</p>
            <p className="text-[10px] text-slate-500">{error}</p>
          </div>
        </div>
      )}
      {convertedUrl && !loading && !error && (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={convertedUrl}
            alt="Converted HEIC"
            className="max-h-[70vh] max-w-full rounded-xl border border-slate-200 bg-white object-contain shadow-lg"
            style={{
              display: loading || error ? "none" : "block",
            }}
          />
        </>
      )}
    </div>
  );
}
