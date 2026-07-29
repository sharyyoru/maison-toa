"use client";

import { useState } from "react";
import SmartTaskScanner from "./SmartTaskScanner";
import TaskReviewList from "./TaskReviewList";
import { X } from "lucide-react";

type ExtractedTask = {
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  assignee: string;
  dueDate: string | null;
};

type SmartTaskScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onTasksCreated?: () => void;
};

export default function SmartTaskScannerModal({
  open,
  onClose,
  onTasksCreated,
}: SmartTaskScannerModalProps) {
  const [step, setStep] = useState<"scan" | "review">("scan");
  const [extractedTasks, setExtractedTasks] = useState<ExtractedTask[]>([]);

  const handleTasksExtracted = (tasks: ExtractedTask[]) => {
    setExtractedTasks(tasks);
    setStep("review");
  };

  const handleReviewCancel = () => {
    setStep("scan");
    setExtractedTasks([]);
  };

  const handleReviewConfirm = () => {
    if (onTasksCreated) {
      onTasksCreated();
    }
    onClose();
    // Reset state after animation
    setTimeout(() => {
      setStep("scan");
      setExtractedTasks([]);
    }, 500);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-4xl rounded-2xl border border-slate-200 bg-white shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 px-6 py-4 bg-white z-10">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {step === "scan" ? "Smart Task Scanner" : "Review Extracted Tasks"}
            </h2>
            <p className="text-sm text-slate-500">
              {step === "scan"
                ? "Upload an image to automatically extract tasks"
                : "Edit and assign the extracted tasks"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {step === "scan" ? (
            <SmartTaskScanner onTasksExtracted={handleTasksExtracted} />
          ) : (
            <TaskReviewList
              initialTasks={extractedTasks}
              onConfirm={handleReviewConfirm}
              onCancel={handleReviewCancel}
            />
          )}
        </div>
      </div>
    </div>
  );
}
