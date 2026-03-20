"use client";

import React, { useEffect, useRef, useState } from 'react';
import { renderAsync } from 'docx-preview';

interface DocxPreviewProps {
  url: string;
  fileName: string;
}

export default function DocxPreview({ url, fileName }: DocxPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerRef.current || !url) return;

    setIsLoading(true);
    setError(null);

    // Fetch the document and render it (with cache-busting)
    fetch(url, { cache: 'no-store' })
      .then(response => {
        if (!response.ok) throw new Error('Failed to fetch document');
        return response.blob();
      })
      .then(blob => {
        if (!containerRef.current) return;
        
        return renderAsync(blob, containerRef.current, undefined, {
          className: 'docx-preview-content',
          inWrapper: true,
          ignoreWidth: false,
          ignoreHeight: false,
          ignoreFonts: false,
          breakPages: true,
          experimental: true,
          useBase64URL: true,
          renderHeaders: true,
          renderFooters: true,
        });
      })
      .then(() => {
        setIsLoading(false);
      })
      .catch(err => {
        console.error('Error rendering DOCX:', err);
        setError('Failed to preview document');
        setIsLoading(false);
      });
  }, [url]);

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-xl bg-red-100 text-lg font-bold text-red-600 mb-4">
          DOCX
        </div>
        <p className="text-sm font-medium text-slate-700">{error}</p>
        <a
          href={url}
          download={fileName}
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600"
        >
          Download File
        </a>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white">
          <div className="text-center">
            <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
            <p className="text-sm text-slate-500">Loading preview...</p>
          </div>
        </div>
      )}
      <div
        ref={containerRef}
        className="h-[70vh] w-full overflow-auto rounded-xl border border-slate-200 bg-white shadow-lg"
        style={{ display: isLoading ? 'none' : 'block' }}
      />
      <style jsx global>{`
        .docx-preview-content {
          padding: 20px;
        }
        .docx-preview-content .docx-wrapper {
          background: white;
        }
        .docx-preview-content .docx-wrapper > section.docx {
          box-shadow: 0 2px 8px rgba(0,0,0,0.1);
          margin-bottom: 20px;
        }
      `}</style>
    </div>
  );
}
