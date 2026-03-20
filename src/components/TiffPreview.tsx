"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

interface TiffPreviewProps {
  url: string;
  className?: string;
  onError?: (msg: string) => void;
}

export default function TiffPreview({ url, className, onError }: TiffPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [canvasMounted, setCanvasMounted] = useState(false);

  // Track when canvas is mounted
  useLayoutEffect(() => {
    if (canvasRef.current) {
      setCanvasMounted(true);
    }
  }, []);

  // Load TIFF when canvas is mounted and URL changes
  useEffect(() => {
    if (!canvasMounted || !canvasRef.current || !url) return;

    let cancelled = false;
    const canvas = canvasRef.current;

    async function loadTiff() {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed to fetch TIFF: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        if (cancelled) return;

        // Dynamic import utif2 (ESM returns { default: ... })
        const utifModule = await import("utif2");
        const UTIF = utifModule.default || utifModule;

        // Decode TIFF
        const ifds = UTIF.decode(arrayBuffer);
        if (!ifds || ifds.length === 0) {
          throw new Error("No pages found in TIFF file");
        }

        UTIF.decodeImage(arrayBuffer, ifds[0]);
        const rgba = UTIF.toRGBA8(ifds[0]);

        if (cancelled) return;

        const width = ifds[0].width;
        const height = ifds[0].height;

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (ctx) {
          const imageData = ctx.createImageData(width, height);
          imageData.data.set(rgba);
          ctx.putImageData(imageData, 0, 0);
        }

        setLoading(false);
      } catch (err: unknown) {
        if (!cancelled) {
          const errorMsg = err instanceof Error ? err.message : "Failed to load TIFF";
          setError(errorMsg);
          setLoading(false);
          onError?.(errorMsg);
        }
      }
    }

    loadTiff();

    return () => {
      cancelled = true;
    };
  }, [url, canvasMounted, onError]);

  return (
    <div className={className}>
      {loading && (
        <div className="flex items-center justify-center min-h-[100px]">
          <div className="flex flex-col items-center gap-2">
            <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-600"></div>
            <p className="text-xs text-slate-500">Loading TIFF...</p>
          </div>
        </div>
      )}
      {error && (
        <div className="flex items-center justify-center min-h-[100px]">
          <div className="text-center">
            <p className="text-xs text-red-600">Failed to load TIFF</p>
            <p className="text-[10px] text-slate-500">{error}</p>
          </div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        style={{
          maxWidth: "100%",
          height: "auto",
          display: loading || error ? "none" : "block",
        }}
      />
    </div>
  );
}
