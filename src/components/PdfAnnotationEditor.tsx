"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

interface Annotation {
  id: string;
  type: "text" | "draw" | "highlight" | "signature" | "stamp";
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  content?: string;
  color?: string;
  fontSize?: number;
  paths?: { x: number; y: number }[][];
}

interface PdfAnnotationEditorProps {
  open: boolean;
  onClose: () => void;
  pdfUrl: string;
  fileName: string;
  onSave: (annotatedPdfBlob: Blob, newFileName: string) => Promise<void>;
}

type Tool = "select" | "text" | "draw" | "highlight" | "signature" | "stamp";

export default function PdfAnnotationEditor({
  open,
  onClose,
  pdfUrl,
  fileName,
  onSave,
}: PdfAnnotationEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocument | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [tool, setTool] = useState<Tool>("select");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentPath, setCurrentPath] = useState<{ x: number; y: number }[]>([]);
  const [drawColor, setDrawColor] = useState("#ef4444");
  const [textInput, setTextInput] = useState("");
  const [textPosition, setTextPosition] = useState<{ x: number; y: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageImages, setPageImages] = useState<Map<number, string>>(new Map());

  // Load PDF
  useEffect(() => {
    if (!open || !pdfUrl) return;

    async function loadPdf() {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(pdfUrl);
        const arrayBuffer = await response.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        setPdfBytes(bytes);

        const doc = await PDFDocument.load(bytes);
        setPdfDoc(doc);
        setTotalPages(doc.getPageCount());
        setCurrentPage(1);

        // Render pages to images using pdf.js or canvas
        await renderPdfPages(bytes, doc.getPageCount());
      } catch (err) {
        console.error("Error loading PDF:", err);
        setError("Failed to load PDF for editing");
      } finally {
        setLoading(false);
      }
    }

    loadPdf();
  }, [open, pdfUrl]);

  // Render PDF pages to images
  async function renderPdfPages(bytes: Uint8Array, pageCount: number) {
    // Use pdfjsLib if available, otherwise use a simple approach
    const images = new Map<number, string>();
    
    // Create object URL for iframe preview as fallback
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const blob = new Blob([bytes as any], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    
    for (let i = 1; i <= pageCount; i++) {
      images.set(i, url);
    }
    
    setPageImages(images);
  }

  // Handle canvas click for text placement
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "text" && tool !== "stamp") return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    if (tool === "text") {
      setTextPosition({ x, y });
    } else if (tool === "stamp") {
      const newAnnotation: Annotation = {
        id: `stamp-${Date.now()}`,
        type: "stamp",
        page: currentPage,
        x,
        y,
        content: "✓",
        color: "#10b981",
        fontSize: 24,
      };
      setAnnotations((prev) => [...prev, newAnnotation]);
    }
  }, [tool, currentPage, scale]);

  // Handle drawing
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "draw" && tool !== "highlight") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    setIsDrawing(true);
    setCurrentPath([{ x, y }]);
  }, [tool, scale]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    setCurrentPath((prev) => [...prev, { x, y }]);
  }, [isDrawing, scale]);

  const handleMouseUp = useCallback(() => {
    if (!isDrawing || currentPath.length < 2) {
      setIsDrawing(false);
      setCurrentPath([]);
      return;
    }

    const newAnnotation: Annotation = {
      id: `${tool}-${Date.now()}`,
      type: tool as "draw" | "highlight",
      page: currentPage,
      x: 0,
      y: 0,
      paths: [currentPath],
      color: tool === "highlight" ? "#fbbf24" : drawColor,
    };

    setAnnotations((prev) => [...prev, newAnnotation]);
    setIsDrawing(false);
    setCurrentPath([]);
  }, [isDrawing, currentPath, tool, currentPage, drawColor]);

  // Add text annotation
  const handleAddText = useCallback(() => {
    if (!textPosition || !textInput.trim()) return;

    const newAnnotation: Annotation = {
      id: `text-${Date.now()}`,
      type: "text",
      page: currentPage,
      x: textPosition.x,
      y: textPosition.y,
      content: textInput.trim(),
      color: "#1e40af",
      fontSize: 12,
    };

    setAnnotations((prev) => [...prev, newAnnotation]);
    setTextInput("");
    setTextPosition(null);
  }, [textPosition, textInput, currentPage]);

  // Delete annotation
  const handleDeleteAnnotation = useCallback((id: string) => {
    setAnnotations((prev) => prev.filter((a) => a.id !== id));
  }, []);

  // Save annotated PDF
  const handleSave = useCallback(async () => {
    if (!pdfDoc || !pdfBytes) return;

    setSaving(true);
    try {
      // Clone the original PDF
      const newPdfDoc = await PDFDocument.load(pdfBytes);
      const helveticaFont = await newPdfDoc.embedFont(StandardFonts.Helvetica);

      // Apply annotations
      for (const annotation of annotations) {
        const page = newPdfDoc.getPage(annotation.page - 1);
        const { height } = page.getSize();

        if (annotation.type === "text" && annotation.content) {
          page.drawText(annotation.content, {
            x: annotation.x,
            y: height - annotation.y - (annotation.fontSize || 12),
            size: annotation.fontSize || 12,
            font: helveticaFont,
            color: rgb(0.12, 0.25, 0.69),
          });
        } else if (annotation.type === "stamp" && annotation.content) {
          page.drawText(annotation.content, {
            x: annotation.x,
            y: height - annotation.y - (annotation.fontSize || 24),
            size: annotation.fontSize || 24,
            font: helveticaFont,
            color: rgb(0.06, 0.73, 0.51),
          });
        } else if ((annotation.type === "draw" || annotation.type === "highlight") && annotation.paths) {
          const color = annotation.type === "highlight" 
            ? rgb(0.98, 0.75, 0.14) 
            : rgb(0.94, 0.27, 0.27);
          
          for (const path of annotation.paths) {
            if (path.length < 2) continue;
            
            for (let i = 1; i < path.length; i++) {
              page.drawLine({
                start: { x: path[i - 1].x, y: height - path[i - 1].y },
                end: { x: path[i].x, y: height - path[i].y },
                thickness: annotation.type === "highlight" ? 10 : 2,
                color,
                opacity: annotation.type === "highlight" ? 0.4 : 1,
              });
            }
          }
        }
      }

      const annotatedPdfBytes = await newPdfDoc.save();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const blob = new Blob([annotatedPdfBytes as any], { type: "application/pdf" });

      // Generate new filename
      const baseName = fileName.replace(/\.pdf$/i, "");
      const newFileName = `${baseName}_annotated_${Date.now()}.pdf`;

      await onSave(blob, newFileName);
      onClose();
    } catch (err) {
      console.error("Error saving annotated PDF:", err);
      setError("Failed to save annotated PDF");
    } finally {
      setSaving(false);
    }
  }, [pdfDoc, pdfBytes, annotations, fileName, onSave, onClose]);

  // Render annotations on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw current path while drawing
    if (isDrawing && currentPath.length > 1) {
      ctx.beginPath();
      ctx.strokeStyle = tool === "highlight" ? "rgba(251, 191, 36, 0.4)" : drawColor;
      ctx.lineWidth = tool === "highlight" ? 10 : 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      ctx.moveTo(currentPath[0].x * scale, currentPath[0].y * scale);
      for (let i = 1; i < currentPath.length; i++) {
        ctx.lineTo(currentPath[i].x * scale, currentPath[i].y * scale);
      }
      ctx.stroke();
    }

    // Draw existing annotations for current page
    const pageAnnotations = annotations.filter((a) => a.page === currentPage);

    for (const annotation of pageAnnotations) {
      if (annotation.type === "text" && annotation.content) {
        ctx.font = `${(annotation.fontSize || 12) * scale}px sans-serif`;
        ctx.fillStyle = annotation.color || "#1e40af";
        ctx.fillText(annotation.content, annotation.x * scale, annotation.y * scale);
      } else if (annotation.type === "stamp" && annotation.content) {
        ctx.font = `${(annotation.fontSize || 24) * scale}px sans-serif`;
        ctx.fillStyle = annotation.color || "#10b981";
        ctx.fillText(annotation.content, annotation.x * scale, annotation.y * scale);
      } else if ((annotation.type === "draw" || annotation.type === "highlight") && annotation.paths) {
        ctx.strokeStyle = annotation.type === "highlight" 
          ? "rgba(251, 191, 36, 0.4)" 
          : (annotation.color || "#ef4444");
        ctx.lineWidth = (annotation.type === "highlight" ? 10 : 2) * scale;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";

        for (const path of annotation.paths) {
          if (path.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(path[0].x * scale, path[0].y * scale);
          for (let i = 1; i < path.length; i++) {
            ctx.lineTo(path[i].x * scale, path[i].y * scale);
          }
          ctx.stroke();
        }
      }
    }
  }, [annotations, currentPage, isDrawing, currentPath, scale, tool, drawColor]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="flex h-[90vh] w-full max-w-6xl flex-col rounded-xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-900">Edit PDF</h2>
            <span className="text-sm text-slate-500">{fileName}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || annotations.length === 0}
              className="rounded-lg bg-emerald-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Annotated PDF"}
            </button>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2">
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1">
            <button
              onClick={() => setTool("select")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                tool === "select" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Select
            </button>
            <button
              onClick={() => setTool("text")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                tool === "text" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Text
            </button>
            <button
              onClick={() => setTool("draw")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                tool === "draw" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Draw
            </button>
            <button
              onClick={() => setTool("highlight")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                tool === "highlight" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              Highlight
            </button>
            <button
              onClick={() => setTool("stamp")}
              className={`rounded px-2 py-1 text-xs font-medium ${
                tool === "stamp" ? "bg-white text-slate-900 shadow" : "text-slate-600 hover:text-slate-900"
              }`}
            >
              ✓ Stamp
            </button>
          </div>

          {tool === "draw" && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Color:</span>
              <input
                type="color"
                value={drawColor}
                onChange={(e) => setDrawColor(e.target.value)}
                className="h-6 w-6 cursor-pointer rounded border-0"
              />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.1))}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              -
            </button>
            <span className="text-xs text-slate-600">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(2, s + 0.1))}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50"
            >
              +
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              ←
            </button>
            <span className="text-xs text-slate-600">
              Page {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage >= totalPages}
              className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-50 disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>

        {/* Text input popup */}
        {textPosition && (
          <div className="absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-slate-200 bg-white p-4 shadow-lg">
            <p className="mb-2 text-sm font-medium text-slate-700">Add text annotation</p>
            <input
              type="text"
              value={textInput}
              onChange={(e) => setTextInput(e.target.value)}
              placeholder="Enter text..."
              className="mb-2 w-64 rounded border border-slate-300 px-2 py-1 text-sm"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setTextPosition(null);
                  setTextInput("");
                }}
                className="rounded px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                onClick={handleAddText}
                disabled={!textInput.trim()}
                className="rounded bg-sky-500 px-2 py-1 text-xs text-white hover:bg-sky-600 disabled:opacity-50"
              >
                Add
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="flex flex-1 overflow-hidden">
          {/* PDF Preview + Canvas */}
          <div ref={containerRef} className="relative flex-1 overflow-auto bg-slate-100 p-4">
            {loading ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-slate-500">Loading PDF...</p>
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center">
                <p className="text-sm text-red-500">{error}</p>
              </div>
            ) : (
              <div className="relative mx-auto" style={{ width: `${612 * scale}px`, height: `${792 * scale}px` }}>
                {/* PDF iframe as background */}
                <iframe
                  src={`${pdfUrl}#page=${currentPage}`}
                  className="absolute inset-0 h-full w-full border-0"
                  title="PDF Preview"
                />
                {/* Canvas overlay for annotations */}
                <canvas
                  ref={canvasRef}
                  width={612 * scale}
                  height={792 * scale}
                  className="absolute inset-0 cursor-crosshair"
                  onClick={handleCanvasClick}
                  onMouseDown={handleMouseDown}
                  onMouseMove={handleMouseMove}
                  onMouseUp={handleMouseUp}
                  onMouseLeave={handleMouseUp}
                />
              </div>
            )}
          </div>

          {/* Annotations sidebar */}
          <div className="w-64 border-l border-slate-200 bg-slate-50 p-3">
            <h3 className="mb-2 text-xs font-semibold text-slate-700">Annotations ({annotations.filter(a => a.page === currentPage).length})</h3>
            <div className="space-y-2 text-xs">
              {annotations
                .filter((a) => a.page === currentPage)
                .map((a) => (
                  <div
                    key={a.id}
                    className="flex items-center justify-between rounded border border-slate-200 bg-white px-2 py-1.5"
                  >
                    <span className="truncate text-slate-700">
                      {a.type === "text" ? `"${a.content}"` : a.type === "stamp" ? "✓ Stamp" : a.type}
                    </span>
                    <button
                      onClick={() => handleDeleteAnnotation(a.id)}
                      className="text-red-500 hover:text-red-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              {annotations.filter((a) => a.page === currentPage).length === 0 && (
                <p className="text-slate-500">No annotations on this page</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
