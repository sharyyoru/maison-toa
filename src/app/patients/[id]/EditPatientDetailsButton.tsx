"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import PatientDetailsWizard from "./details/PatientDetailsWizard";

export default function EditPatientDetailsButton({
  patientId,
}: {
  patientId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
      >
        <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
          <svg
            className="h-3.5 w-3.5 text-emerald-700"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M4 13.5V16h2.5l7-7-2.5-2.5-7 7z" />
            <path d="M13.7 3.3a1 1 0 011.4 0l1.6 1.6a1 1 0 010 1.4L15.7 8l-2.5-2.5 2.5-2.2z" />
          </svg>
        </span>
        <span>Edit</span>
      </button>
      {open && mounted
        ? createPortal(
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm">
              <div className="relative w-full max-w-3xl rounded-2xl border border-slate-200/80 bg-slate-900/10 p-1 shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
                <div className="max-h-[80vh] overflow-y-auto rounded-xl bg-white/95 p-4">
                  <PatientDetailsWizard
                    patientId={patientId}
                    initialStep={1}
                    mode="modal"
                    onClose={() => {
                      setOpen(false);
                      router.refresh();
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
