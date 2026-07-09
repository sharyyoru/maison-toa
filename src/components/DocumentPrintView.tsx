"use client";

import React, { useEffect, useRef, useState } from "react";
import { renderAsync } from "docx-preview";
import { sanitizeDocxForPreview } from "@/lib/docxPreviewSanitizer";

interface DocumentPrintViewProps {
  blob: Blob;
  title: string;
  onClose: () => void;
}

/**
 * Renders a DOCX blob in a print-optimized view and triggers the browser print
 * dialog so the user can save the document as a PDF.
 *
 * This avoids requiring a server-side DOCX→PDF converter (e.g. LibreOffice),
 * which is not available on the current Vercel deployment. The browser's
 * "Save as PDF" destination produces a faithful PDF from the rendered pages.
 */
export default function DocumentPrintView({ blob, title, onClose }: DocumentPrintViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [printTriggered, setPrintTriggered] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    let cancelled = false;

    (async () => {
      try {
        setIsLoading(true);
        setError(null);

        const sanitizedBlob = await sanitizeDocxForPreview(blob);
        if (cancelled || !containerRef.current) return;

        await renderAsync(sanitizedBlob, containerRef.current, undefined, {
          className: "docx-print-content",
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

        if (!cancelled) {
          setIsLoading(false);
          // Defer print so React has finished rendering the container.
          window.setTimeout(() => {
            window.print();
            setPrintTriggered(true);
          }, 500);
        }
      } catch (err: any) {
        if (!cancelled) {
          console.error("Error rendering document for print:", err);
          setError(err?.message || "Failed to render document");
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [blob]);

  // Close the modal once the user has dismissed the browser print dialog.
  useEffect(() => {
    if (!printTriggered) return;

    const handleAfterPrint = () => {
      onClose();
    };

    window.addEventListener("afterprint", handleAfterPrint);
    return () => window.removeEventListener("afterprint", handleAfterPrint);
  }, [printTriggered, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white print:static">
      {/* Header is hidden when printing */}
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 print:hidden">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            {isLoading
              ? "Preparing preview..."
              : "Your browser's print dialog has opened. Choose 'Save as PDF' to download."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={isLoading}
            className="rounded-lg bg-sky-500 px-4 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Print / Save as PDF
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-100 p-4 print:m-0 print:bg-white print:p-0">
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center">
              <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-sky-200 border-t-sky-500" />
              <p className="text-sm text-slate-600">Preparing document for print...</p>
            </div>
          </div>
        )}

        {error && (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <p className="text-sm font-medium text-red-700">{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
          </div>
        )}

        <div
          ref={containerRef}
          className="mx-auto min-h-[297mm] w-[210mm] bg-white shadow-lg print:m-0 print:w-full print:min-w-0 print:shadow-none"
          style={{ display: isLoading || error ? "none" : "block" }}
        />
      </div>

      <style jsx global>{`
        @media print {
          @page {
            margin: 12mm;
          }

          body {
            background: white;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }

          .docx-print-content {
            padding: 0;
          }

          .docx-print-content .docx-wrapper {
            background: white;
            box-shadow: none;
            margin: 0;
          }

          .docx-print-content .docx-wrapper > section.docx {
            box-shadow: none;
            margin: 0;
            page-break-after: always;
          }
        }
      `}</style>
    </div>
  );
}
