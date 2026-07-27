"use client";

import { useState, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Scan, FileImage, X, Loader2, Camera, FileText } from "lucide-react";

type ExtractedTask = {
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  assignee: string;
  dueDate: string | null;
};

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
];
const ACCEPT_ATTR = "image/jpeg,image/jpg,image/png,image/webp,image/gif,application/pdf";
const MAX_SIZE = 20 * 1024 * 1024;

type SmartTaskScannerProps = {
  onTasksExtracted: (tasks: ExtractedTask[]) => void;
};

export default function SmartTaskScanner({ onTasksExtracted }: SmartTaskScannerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [previewFileName, setPreviewFileName] = useState<string | null>(null);
  const [isPdf, setIsPdf] = useState(false);
  const [analyzingStep, setAnalyzingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const analyzingSteps = [
    "Analyzing handwriting...",
    "Identifying action items...",
    "Structuring tasks...",
  ];

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    setError(null);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    await processFile(file);
  }, []);

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    await processFile(file);
  }, []);

  const processFile = async (file: File) => {
    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      setError("Please upload an image (JPEG, PNG, WebP, GIF) or a PDF.");
      return;
    }

    // Validate file size (20MB)
    if (file.size > MAX_SIZE) {
      setError("File too large. Maximum size is 20MB.");
      return;
    }

    const fileIsPdf = file.type === "application/pdf";
    setIsPdf(fileIsPdf);
    setPreviewFileName(file.name);

    // Create preview (image only; PDFs show a document placeholder)
    if (fileIsPdf) {
      setPreviewImage(null);
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewImage(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }

    // Start analysis
    setIsAnalyzing(true);
    setAnalyzingStep(0);

    // Cycle through analyzing steps
    const stepInterval = setInterval(() => {
      setAnalyzingStep((prev) => (prev + 1) % analyzingSteps.length);
    }, 1500);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const response = await fetch("/api/analyze-scan", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to analyze image");
      }

      const data = await response.json();
      
      clearInterval(stepInterval);
      setIsAnalyzing(false);
      setPreviewImage(null);
      setPreviewFileName(null);
      setIsPdf(false);

      if (data.tasks && data.tasks.length > 0) {
        onTasksExtracted(data.tasks);
      } else {
        setError("No actionable items found in the document.");
      }
    } catch (err) {
      clearInterval(stepInterval);
      setIsAnalyzing(false);
      setPreviewImage(null);
      setPreviewFileName(null);
      setIsPdf(false);
      setError(err instanceof Error ? err.message : "Failed to analyze document");
    }
  };

  const handleReset = () => {
    setPreviewImage(null);
    setPreviewFileName(null);
    setIsPdf(false);
    setIsAnalyzing(false);
    setError(null);
    setAnalyzingStep(0);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="text-center mb-6">
        <h2 className="text-2xl font-semibold text-slate-900 mb-2">Smart Task Scanner</h2>
        <p className="text-sm text-slate-500">
          Upload a photo or PDF of notes, a whiteboard, a letter, or a form to automatically extract tasks
        </p>
      </div>

      <AnimatePresence mode="wait">
        {!isAnalyzing && !previewFileName && (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.3 }}
          >
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`
                relative cursor-pointer rounded-2xl border-2 border-dashed p-12
                transition-all duration-300 ease-out
                ${isDragging
                  ? "border-sky-500 bg-sky-50/50 scale-[1.02]"
                  : "border-slate-300 bg-slate-50/50 hover:border-sky-400 hover:bg-slate-50"
                }
              `}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                onChange={handleFileSelect}
                className="hidden"
              />
              {/* Camera input: capture="environment" opens the rear camera on
                  mobile devices for direct photo capture. */}
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handleFileSelect}
                className="hidden"
              />
              
              <div className="flex flex-col items-center gap-4">
                <motion.div
                  animate={isDragging ? { scale: 1.1, rotate: 5 } : { scale: 1, rotate: 0 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="p-4 rounded-full bg-white shadow-sm"
                >
                  <Scan className="w-12 h-12 text-slate-400" />
                </motion.div>
                
                <div className="text-center space-y-2">
                  <p className="text-base font-medium text-slate-700">
                    {isDragging ? "Drop your file here" : "Drag & drop a photo or PDF here"}
                  </p>
                  <p className="text-sm text-slate-500">or use the options below</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-2 rounded-full bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700"
                  >
                    <FileImage className="w-4 h-4" />
                    Browse files
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      cameraInputRef.current?.click();
                    }}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <Camera className="w-4 h-4" />
                    Take photo
                  </button>
                </div>

                <div className="flex items-center gap-2 text-xs text-slate-400">
                  <FileText className="w-4 h-4" />
                  <span>JPEG, PNG, WebP, GIF, PDF (max 20MB)</span>
                </div>
              </div>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
              >
                {error}
              </motion.div>
            )}
          </motion.div>
        )}

        {(isAnalyzing || previewFileName) && (
          <motion.div
            key="analyzing"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="relative rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-lg"
          >
            {previewImage ? (
              <img
                src={previewImage}
                alt="Preview"
                className="w-full h-64 object-cover"
              />
            ) : (
              <div className="flex h-64 w-full flex-col items-center justify-center gap-3 bg-slate-100">
                <FileText className="w-16 h-16 text-slate-400" />
                <span className="max-w-[80%] truncate text-sm font-medium text-slate-600">
                  {previewFileName}
                </span>
              </div>
            )}

            {/* Scanning line animation */}
            {isAnalyzing && (
              <motion.div
                initial={{ top: 0 }}
                animate={{ top: "100%" }}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
                className="absolute left-0 right-0 h-1 bg-gradient-to-r from-transparent via-sky-500 to-transparent shadow-[0_0_20px_rgba(14,165,233,0.8)]"
              />
            )}

            {/* Overlay with analyzing status */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/30 flex flex-col items-center justify-center">
              {isAnalyzing ? (
                <div className="text-center space-y-3">
                  <Loader2 className="w-8 h-8 text-white animate-spin mx-auto" />
                  <motion.p
                    key={analyzingStep}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-white font-medium"
                  >
                    {analyzingSteps[analyzingStep]}
                  </motion.p>
                </div>
              ) : (
                <button
                  onClick={handleReset}
                  className="inline-flex items-center gap-2 rounded-full bg-white/20 backdrop-blur-sm px-4 py-2 text-sm font-medium text-white hover:bg-white/30 transition-colors"
                >
                  <X className="w-4 h-4" />
                  Cancel
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
