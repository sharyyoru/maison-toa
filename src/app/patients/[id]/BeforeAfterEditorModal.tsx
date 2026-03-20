"use client";

import { useState, useMemo } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

const BUCKET_NAME = "patient_document";
const IMAGES_PER_PAGE = 10;

interface BeforeAfterImage {
  url: string;
  name: string;
  created_at?: string;
}

interface BeforeAfterEditorModalProps {
  open: boolean;
  onClose: () => void;
  patientId: string;
  images: BeforeAfterImage[];
  onError?: (message: string) => void;
  onExportSuccess?: () => void;
}

export default function BeforeAfterEditorModal({
  open,
  onClose,
  patientId,
  images,
  onError,
  onExportSuccess,
}: BeforeAfterEditorModalProps) {
  const [activeSide, setActiveSide] = useState<"before" | "after">("before");
  const [beforeImage, setBeforeImage] = useState<BeforeAfterImage | null>(null);
  const [afterImage, setAfterImage] = useState<BeforeAfterImage | null>(null);
  const [beforeZoom, setBeforeZoom] = useState(1);
  const [afterZoom, setAfterZoom] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  // Pan/drag state for viewport panning (camera focus)
  // Position represents the offset of the image from center (0,0 = centered)
  const [beforePosition, setBeforePosition] = useState({ x: 0, y: 0 });
  const [afterPosition, setAfterPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<"before" | "after" | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartPosition, setDragStartPosition] = useState({ x: 0, y: 0 });
  
  // Image dimensions for auto-center calculation
  const [beforeImageSize, setBeforeImageSize] = useState({ width: 0, height: 0 });
  const [afterImageSize, setAfterImageSize] = useState({ width: 0, height: 0 });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);

  // Sort images by created_at (latest first) and paginate
  const sortedImages = useMemo(() => {
    return [...images].sort((a, b) => {
      const dateA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const dateB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return dateB - dateA; // Latest first
    });
  }, [images]);

  const totalPages = Math.ceil(sortedImages.length / IMAGES_PER_PAGE);
  const paginatedImages = useMemo(() => {
    const startIndex = (currentPage - 1) * IMAGES_PER_PAGE;
    return sortedImages.slice(startIndex, startIndex + IMAGES_PER_PAGE);
  }, [sortedImages, currentPage]);

  if (!open) {
    return null;
  }

  function handleAssignImage(side: "before" | "after", image: BeforeAfterImage) {
    if (side === "before") {
      setBeforeImage(image);
      setBeforePosition({ x: 0, y: 0 }); // Reset position when new image is assigned
      setBeforeImageSize({ width: 0, height: 0 });
    } else {
      setAfterImage(image);
      setAfterPosition({ x: 0, y: 0 }); // Reset position when new image is assigned
      setAfterImageSize({ width: 0, height: 0 });
    }
    setActiveSide(side);
    setLocalError(null);
  }

  // Handle image load to get dimensions for auto-center
  function handleImageLoad(side: "before" | "after", event: React.SyntheticEvent<HTMLImageElement>) {
    const img = event.currentTarget;
    if (side === "before") {
      setBeforeImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    } else {
      setAfterImageSize({ width: img.naturalWidth, height: img.naturalHeight });
    }
  }

  // Auto-center function - centers the image in the viewport
  function handleAutoCenter(side: "before" | "after") {
    if (side === "before") {
      setBeforePosition({ x: 0, y: 0 });
    } else {
      setAfterPosition({ x: 0, y: 0 });
    }
  }

  // Mouse/touch drag handlers for panning
  function handleMouseDown(event: React.MouseEvent, side: "before" | "after") {
    event.preventDefault();
    setIsDragging(side);
    setDragStart({ x: event.clientX, y: event.clientY });
    setDragStartPosition(side === "before" ? beforePosition : afterPosition);
  }

  function handleMouseMove(event: React.MouseEvent) {
    if (!isDragging) return;
    const dx = event.clientX - dragStart.x;
    const dy = event.clientY - dragStart.y;
    const newPosition = {
      x: dragStartPosition.x + dx,
      y: dragStartPosition.y + dy,
    };
    if (isDragging === "before") {
      setBeforePosition(newPosition);
    } else {
      setAfterPosition(newPosition);
    }
  }

  function handleMouseUp() {
    setIsDragging(null);
  }

  function handleMouseLeave() {
    setIsDragging(null);
  }

  // Touch event handlers for iPad support
  function handleTouchStart(event: React.TouchEvent, side: "before" | "after") {
    if (event.touches.length !== 1) return;
    event.preventDefault();
    const touch = event.touches[0];
    setIsDragging(side);
    setDragStart({ x: touch.clientX, y: touch.clientY });
    setDragStartPosition(side === "before" ? beforePosition : afterPosition);
  }

  function handleTouchMove(event: React.TouchEvent) {
    if (!isDragging || event.touches.length !== 1) return;
    event.preventDefault();
    const touch = event.touches[0];
    const dx = touch.clientX - dragStart.x;
    const dy = touch.clientY - dragStart.y;
    const newPosition = {
      x: dragStartPosition.x + dx,
      y: dragStartPosition.y + dy,
    };
    if (isDragging === "before") {
      setBeforePosition(newPosition);
    } else {
      setAfterPosition(newPosition);
    }
  }

  function handleTouchEnd() {
    setIsDragging(null);
  }

  function handleGalleryClick(image: BeforeAfterImage) {
    handleAssignImage(activeSide, image);
  }

  // Navigate to previous/next image for a given side
  function handleNavigateImage(side: "before" | "after", direction: "prev" | "next") {
    const currentImage = side === "before" ? beforeImage : afterImage;
    if (!currentImage || sortedImages.length === 0) return;
    
    const currentIndex = sortedImages.findIndex(img => img.url === currentImage.url);
    if (currentIndex === -1) return;
    
    let newIndex: number;
    if (direction === "prev") {
      newIndex = currentIndex <= 0 ? sortedImages.length - 1 : currentIndex - 1;
    } else {
      newIndex = currentIndex >= sortedImages.length - 1 ? 0 : currentIndex + 1;
    }
    
    handleAssignImage(side, sortedImages[newIndex]);
  }

  function handleGalleryDragStart(
    event: React.DragEvent<HTMLButtonElement>,
    image: BeforeAfterImage,
  ) {
    event.dataTransfer.setData("application/json", JSON.stringify(image));
    event.dataTransfer.effectAllowed = "copy";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>, side: "before" | "after") {
    event.preventDefault();
    const raw = event.dataTransfer.getData("application/json");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as { url?: string; name?: string };
      if (!parsed.url || !parsed.name) return;
      handleAssignImage(side, { url: parsed.url, name: parsed.name });
    } catch {
    }
  }

  function handleDragOver(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
  }

  async function handleExport() {
    if (!beforeImage || !afterImage) {
      const message = "Please select images for both Before and After before exporting.";
      setLocalError(message);
      if (onError) {
        onError(message);
      }
      return;
    }

    if (typeof document === "undefined") {
      return;
    }

    setExporting(true);
    setLocalError(null);

    try {
      const canvas = document.createElement("canvas");
      const width = 1024;
      const height = 682;
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Unable to create drawing context.");
      }

      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);

      function loadImage(url: string): Promise<HTMLImageElement> {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error("Failed to load image."));
          image.src = url;
        });
      }

      const [beforeEl, afterEl] = await Promise.all([
        loadImage(beforeImage.url),
        loadImage(afterImage.url),
      ]);

      const sideWidth = width / 2;

      function drawSide(
        drawingContext: CanvasRenderingContext2D,
        image: HTMLImageElement,
        side: "before" | "after",
        zoom: number,
        position: { x: number; y: number },
      ) {
        const sideX = side === "before" ? 0 : sideWidth;
        const baseScale = Math.max(sideWidth / image.width, height / image.height);
        const scale = baseScale * zoom;
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        // Apply position offset (scaled proportionally to canvas size)
        const positionScale = width / 1024; // Scale factor for position
        const dx = sideX + sideWidth / 2 - drawWidth / 2 + (position.x * positionScale);
        const dy = height / 2 - drawHeight / 2 + (position.y * positionScale);

        drawingContext.save();
        drawingContext.beginPath();
        drawingContext.rect(sideX, 0, sideWidth, height);
        drawingContext.clip();
        drawingContext.drawImage(image, dx, dy, drawWidth, drawHeight);
        drawingContext.restore();
      }

      drawSide(context, beforeEl, "before", beforeZoom, beforePosition);
      drawSide(context, afterEl, "after", afterZoom, afterPosition);

      const headerHeight = 72;
      const headerY = 24;
      const headerWidth = width * 0.6;
      const headerX = (width - headerWidth) / 2;

      context.fillStyle = "#000000";
      context.fillRect(headerX, headerY, headerWidth, headerHeight);

      context.fillStyle = "#ffffff";
      context.font =
        "bold 32px system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
      context.textBaseline = "middle";

      const textY = headerY + headerHeight / 2;

      context.textAlign = "left";
      context.fillText("BEFORE", headerX + 24, textY);

      context.textAlign = "right";
      context.fillText("AFTER", headerX + headerWidth - 24, textY);

      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error("Failed to create image blob."));
          }
        }, "image/jpeg", 0.9);
      });

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const fileName = `before-after-${timestamp}.jpg`;
      const storagePath = `${patientId}/${fileName}`;

      const { error } = await supabaseClient.storage.from(BUCKET_NAME).upload(storagePath, blob, {
        cacheControl: "3600",
        upsert: false,
        contentType: "image/jpeg",
      });

      if (error) {
        throw error;
      }

      const downloadUrl = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(downloadUrl);

      // Show success message and notify parent to refresh file list
      setExportSuccess(`Image saved and downloaded: ${fileName}`);
      if (onExportSuccess) {
        onExportSuccess();
      }
      // Auto-hide success message after 4 seconds
      setTimeout(() => setExportSuccess(null), 4000);
    } catch (err: any) {
      const message = err?.message ?? "Failed to export before and after image.";
      setLocalError(message);
      if (onError) {
        onError(message);
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 px-4 py-6">
      <div className="relative flex h-[80vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 text-slate-50 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-800 bg-slate-900/80 px-4 py-2 text-xs">
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-sky-500 px-2 py-0.5 text-[10px] font-semibold text-white">
              Before & After
            </span>
            <span className="text-[11px] text-slate-300">
              Create a combined before and after image for this patient.
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={exporting}
              className="inline-flex items-center rounded-full border border-emerald-400 bg-emerald-500 px-3 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {exporting ? "Exporting…" : "Export image"}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-400 hover:bg-slate-800 hover:text-slate-100"
              aria-label="Close before and after editor"
            >
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-4 overflow-hidden px-4 py-3 text-[11px]">
          {localError ? (
            <div className="rounded-lg border border-red-500/80 bg-red-500/10 px-3 py-2 text-[11px] text-red-100">
              {localError}
            </div>
          ) : null}
          {exportSuccess ? (
            <div className="rounded-lg border border-emerald-500/80 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
              ✓ {exportSuccess}
            </div>
          ) : null}

          <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1.8fr)]">
            <div className="flex min-h-[260px] flex-col gap-2 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium text-slate-200">Image gallery</span>
              </div>
              <div className="mt-1 flex-1 overflow-auto rounded-md border border-slate-800 bg-slate-950/40 p-2">
                {images.length === 0 ? (
                  <div className="flex h-24 items-center justify-center text-[11px] text-slate-500">
                    No images available yet. Upload images from the Documents tab.
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                    {paginatedImages.map((image) => (
                      <button
                        key={`${image.url}-${image.name}`}
                        type="button"
                        draggable
                        onDragStart={(event) => handleGalleryDragStart(event, image)}
                        onClick={() => handleGalleryClick(image)}
                        className="flex flex-col gap-1 rounded-md border border-slate-700 bg-slate-900/80 p-1 text-left hover:border-sky-400 hover:bg-slate-900"
                      >
                        <div
                          className="h-16 w-full rounded bg-slate-800 bg-cover bg-center"
                          style={{ backgroundImage: `url(${image.url})` }}
                        />
                        <span className="truncate text-[10px] text-slate-300">
                          {image.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-2 px-1">
                  <span className="text-[10px] text-slate-400">
                    {sortedImages.length} images ({currentPage}/{totalPages})
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="px-2 py-1 rounded text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      ← Prev
                    </button>
                    <button
                      type="button"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="px-2 py-1 rounded text-[10px] text-slate-300 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Next →
                    </button>
                  </div>
                </div>
              )}
              <p className="mt-1 text-[10px] text-slate-500">
                Drag images into the Before or After panels, or click a thumbnail to assign it
                to the active side.
              </p>
            </div>

            <div className="flex min-h-[260px] flex-col gap-3 rounded-lg border border-slate-800 bg-slate-900/60 p-3">
              <div className="flex items-center justify-between">
                <div className="inline-flex rounded-full bg-slate-800 p-0.5 text-[10px] font-semibold">
                  <button
                    type="button"
                    onClick={() => setActiveSide("before")}
                    className={`rounded-full px-3 py-1 ${
                      activeSide === "before"
                        ? "bg-sky-500 text-white"
                        : "text-slate-300"
                    }`}
                  >
                    Before
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSide("after")}
                    className={`rounded-full px-3 py-1 ${
                      activeSide === "after"
                        ? "bg-sky-500 text-white"
                        : "text-slate-300"
                    }`}
                  >
                    After
                  </button>
                </div>
              </div>

              <div className="grid flex-1 gap-3 md:grid-cols-2">
                <div
                  onDrop={(event) => handleDrop(event, "before")}
                  onDragOver={handleDragOver}
                  className="flex flex-col rounded-lg border border-slate-700 bg-slate-950/40 p-2"
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-300">
                    <span>Before</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Zoom: {beforeZoom.toFixed(2)}x</span>
                      <button
                        type="button"
                        onClick={() => handleAutoCenter("before")}
                        className="text-[9px] text-sky-400 hover:text-sky-300 font-medium"
                        title="Auto center image"
                      >
                        Auto Center
                      </button>
                      <button
                        type="button"
                        onClick={() => { setBeforePosition({ x: 0, y: 0 }); setBeforeZoom(1); }}
                        className="text-[9px] text-slate-400 hover:text-slate-200"
                        title="Reset zoom and position"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div 
                    className={`relative h-[340px] w-full overflow-hidden rounded-md border border-slate-800 bg-slate-950 md:h-[380px] lg:h-[420px] ${isDragging === "before" ? "cursor-grabbing" : "cursor-grab"}`}
                    onMouseDown={(e) => beforeImage && handleMouseDown(e, "before")}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={(e) => beforeImage && handleTouchStart(e, "before")}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                  >
                    {beforeImage ? (
                      <div className="absolute inset-0 flex items-center justify-center select-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={beforeImage.url}
                          alt={beforeImage.name}
                          onLoad={(e) => handleImageLoad("before", e)}
                          className="pointer-events-none"
                          style={{ 
                            transform: `scale(${beforeZoom}) translate(${beforePosition.x / beforeZoom}px, ${beforePosition.y / beforeZoom}px)`,
                            transformOrigin: 'center center',
                            maxWidth: 'none',
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-slate-500">
                        Drag an image here or select one from the gallery.
                      </div>
                    )}
                    {/* Navigation paddles for Before */}
                    {beforeImage && sortedImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleNavigateImage("before", "prev"); }}
                          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                          title="Previous image"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleNavigateImage("before", "next"); }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                          title="Next image"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500 text-center">Drag to pan the camera focus</p>
                  <input
                    type="range"
                    min={0.8}
                    max={2.5}
                    step={0.05}
                    value={beforeZoom}
                    onChange={(event) => setBeforeZoom(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer rounded-full bg-slate-700"
                  />
                </div>

                <div
                  onDrop={(event) => handleDrop(event, "after")}
                  onDragOver={handleDragOver}
                  className="flex flex-col rounded-lg border border-slate-700 bg-slate-950/40 p-2"
                >
                  <div className="mb-1 flex items-center justify-between text-[10px] text-slate-300">
                    <span>After</span>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Zoom: {afterZoom.toFixed(2)}x</span>
                      <button
                        type="button"
                        onClick={() => handleAutoCenter("after")}
                        className="text-[9px] text-sky-400 hover:text-sky-300 font-medium"
                        title="Auto center image"
                      >
                        Auto Center
                      </button>
                      <button
                        type="button"
                        onClick={() => { setAfterPosition({ x: 0, y: 0 }); setAfterZoom(1); }}
                        className="text-[9px] text-slate-400 hover:text-slate-200"
                        title="Reset zoom and position"
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div 
                    className={`relative h-[340px] w-full overflow-hidden rounded-md border border-slate-800 bg-slate-950 md:h-[380px] lg:h-[420px] ${isDragging === "after" ? "cursor-grabbing" : "cursor-grab"}`}
                    onMouseDown={(e) => afterImage && handleMouseDown(e, "after")}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseLeave}
                    onTouchStart={(e) => afterImage && handleTouchStart(e, "after")}
                    onTouchMove={handleTouchMove}
                    onTouchEnd={handleTouchEnd}
                    style={{ touchAction: 'none' } as React.CSSProperties}
                  >
                    {afterImage ? (
                      <div className="absolute inset-0 flex items-center justify-center select-none">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={afterImage.url}
                          alt={afterImage.name}
                          onLoad={(e) => handleImageLoad("after", e)}
                          className="pointer-events-none"
                          style={{ 
                            transform: `scale(${afterZoom}) translate(${afterPosition.x / afterZoom}px, ${afterPosition.y / afterZoom}px)`,
                            transformOrigin: 'center center',
                            maxWidth: 'none',
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover',
                          }}
                          draggable={false}
                        />
                      </div>
                    ) : (
                      <div className="flex h-full items-center justify-center px-3 text-center text-[11px] text-slate-500">
                        Drag an image here or select one from the gallery.
                      </div>
                    )}
                    {/* Navigation paddles for After */}
                    {afterImage && sortedImages.length > 1 && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleNavigateImage("after", "prev"); }}
                          className="absolute left-1 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                          title="Previous image"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleNavigateImage("after", "next"); }}
                          className="absolute right-1 top-1/2 -translate-y-1/2 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80 transition-colors"
                          title="Next image"
                        >
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
                          </svg>
                        </button>
                      </>
                    )}
                  </div>
                  <p className="mt-1 text-[9px] text-slate-500 text-center">Drag to pan the camera focus</p>
                  <input
                    type="range"
                    min={0.8}
                    max={2.5}
                    step={0.05}
                    value={afterZoom}
                    onChange={(event) => setAfterZoom(Number(event.target.value))}
                    className="mt-1 h-1 w-full cursor-pointer rounded-full bg-slate-700"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
