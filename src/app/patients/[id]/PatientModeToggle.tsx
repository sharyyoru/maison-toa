"use client";

import { useRouter, useSearchParams } from "next/navigation";

type Mode = "crm" | "medical";

export default function PatientModeToggle({
  patientId,
  mode,
}: {
  patientId: string;
  mode: Mode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function handleModeChange(nextMode: Mode) {
    if (nextMode === mode) return;

    const params = new URLSearchParams(searchParams?.toString());

    if (nextMode === "crm") {
      params.delete("mode");
    } else {
      params.set("mode", nextMode);
    }

    const query = params.toString();
    const href = query ? `/patients/${patientId}?${query}` : `/patients/${patientId}`;

    router.replace(href);
    router.refresh();
  }

  return (
    <div className="inline-flex rounded-full border border-slate-300/70 bg-gradient-to-r from-slate-200/80 via-slate-300/80 to-slate-400/80 p-0.5 text-[11px] shadow-[0_4px_12px_rgba(15,23,42,0.18)] backdrop-blur">
      <button
        type="button"
        onClick={() => handleModeChange("crm")}
        className={
          "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors transition-shadow duration-200 " +
          (mode === "crm"
            ? "bg-emerald-500/90 text-white shadow-[0_3px_8px_rgba(16,185,129,0.45)] border border-emerald-200/80"
            : "bg-transparent text-slate-800/80 hover:bg-white/20 border border-transparent")
        }
      >
        CRM
      </button>
      <button
        type="button"
        onClick={() => handleModeChange("medical")}
        className={
          "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors transition-shadow duration-200 " +
          (mode === "medical"
            ? "bg-sky-500/90 text-white shadow-[0_3px_8px_rgba(56,189,248,0.45)] border border-sky-200/80"
            : "bg-transparent text-slate-800/80 hover:bg-white/20 border border-transparent")
        }
      >
        Medical
      </button>
    </div>
  );
}
