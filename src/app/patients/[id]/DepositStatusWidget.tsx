"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type DepositStatus = "requested" | "paid" | "applied" | "refunded";

type DepositInvoice = {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_at: string | null;
  deposit_status: DepositStatus | null;
  status: string;
};

const STEPS: { key: DepositStatus; emoji: string; label: string }[] = [
  { key: "requested", emoji: "⏳", label: "Deposit Requested" },
  { key: "paid",      emoji: "🟢", label: "Deposit Paid" },
  { key: "applied",   emoji: "✅", label: "Deposit Applied" },
];

const STATUS_STYLE: Record<DepositStatus, { bg: string; border: string; badge: string; dot: string }> = {
  requested: {
    bg:     "bg-amber-50",
    border: "border-amber-200",
    badge:  "bg-amber-100 text-amber-800",
    dot:    "bg-amber-400",
  },
  paid: {
    bg:     "bg-emerald-50",
    border: "border-emerald-200",
    badge:  "bg-emerald-100 text-emerald-800",
    dot:    "bg-emerald-500",
  },
  applied: {
    bg:     "bg-sky-50",
    border: "border-sky-200",
    badge:  "bg-sky-100 text-sky-800",
    dot:    "bg-sky-500",
  },
  refunded: {
    bg:     "bg-slate-50",
    border: "border-slate-200",
    badge:  "bg-slate-100 text-slate-600",
    dot:    "bg-slate-400",
  },
};

export default function DepositStatusWidget({ patientId }: { patientId: string }) {
  const [deposit, setDeposit]   = useState<DepositInvoice | null | undefined>(undefined); // undefined = loading
  const [saving, setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      const res  = await fetch(`/api/patients/deposit-status?patientId=${patientId}`);
      const json = await res.json();
      setDeposit(json.deposit ?? null);
    } catch {
      setDeposit(null);
    }
  }, [patientId]);

  useEffect(() => { void load(); }, [load]);

  async function handleChange(newStatus: DepositStatus) {
    if (!deposit) return;
    setSaving(true);
    // Optimistic
    setDeposit(prev => prev ? { ...prev, deposit_status: newStatus } : prev);
    try {
      await fetch("/api/patients/deposit-status", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ invoiceId: deposit.id, deposit_status: newStatus }),
      });
    } catch {
      // revert on error
      void load();
    } finally {
      setSaving(false);
    }
  }

  // Loading skeleton
  if (deposit === undefined) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="mb-3 h-3 w-28 animate-pulse rounded bg-slate-100" />
        <div className="h-8 w-48 animate-pulse rounded-lg bg-slate-100" />
      </div>
    );
  }

  // No deposit for this patient — hide widget entirely
  if (!deposit) return null;

  const currentStatus: DepositStatus = deposit.deposit_status ?? "requested";
  const style = STATUS_STYLE[currentStatus];
  const canManuallyChange = currentStatus === "paid" || currentStatus === "applied" || currentStatus === "refunded";

  // Which step index is active (for the timeline)
  const activeStepIndex = currentStatus === "refunded"
    ? 1 // refunded branches off "paid"
    : STEPS.findIndex(s => s.key === currentStatus);

  return (
    <div className={`rounded-xl border ${style.border} ${style.bg} p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]`}>
      {/* Header row */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          Deposit Status
        </h3>
        <Link
          href="/deposits"
          className="text-[11px] font-medium text-sky-600 hover:underline"
        >
          View all deposits →
        </Link>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Left: current status badge + meta */}
        <div className="space-y-1.5">
          {/* Big status badge */}
          <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${style.badge}`}>
            <span className={`h-2 w-2 rounded-full ${style.dot}`} />
            <span>
              {currentStatus === "requested" && "⏳ Deposit Requested"}
              {currentStatus === "paid"      && "🟢 Deposit Paid"}
              {currentStatus === "applied"   && "✅ Deposit Applied"}
              {currentStatus === "refunded"  && "↩️ Deposit Refunded"}
            </span>
          </div>

          {/* Meta: amount · date · invoice link */}
          <div className="flex flex-wrap items-center gap-2 pl-1 text-[11px] text-slate-500">
            <span className="font-semibold text-slate-700">
              CHF {Number(deposit.total_amount).toFixed(2)}
            </span>
            {deposit.paid_at && (
              <>
                <span className="text-slate-300">·</span>
                <span>
                  Paid{" "}
                  {new Date(deposit.paid_at).toLocaleDateString("fr-CH", {
                    day: "numeric", month: "short", year: "numeric",
                  })}
                </span>
              </>
            )}
            <span className="text-slate-300">·</span>
            <Link
              href="/deposits"
              className="font-medium text-sky-600 hover:underline"
            >
              Invoice #{deposit.invoice_number}
            </Link>
          </div>
        </div>

        {/* Right: manual status selector (only after deposit is paid) */}
        {canManuallyChange && (
          <div className="shrink-0">
            <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              Update status
            </label>
            <select
              value={currentStatus}
              onChange={e => void handleChange(e.target.value as DepositStatus)}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50"
            >
              <option value="paid">🟢 Deposit Paid</option>
              <option value="applied">✅ Deposit Applied</option>
              <option value="refunded">↩️ Deposit Refunded</option>
            </select>
          </div>
        )}
      </div>

      {/* Timeline steps */}
      <div className="mt-4 flex items-center gap-0">
        {STEPS.map((step, i) => {
          const isActive  = step.key === currentStatus || (currentStatus === "refunded" && step.key === "paid");
          const isPast    = i < activeStepIndex && currentStatus !== "refunded";
          const isRefundedEnd = currentStatus === "refunded" && step.key === "paid";

          return (
            <div key={step.key} className="flex items-center">
              {/* Connector line */}
              {i > 0 && (
                <div className={`h-px w-6 sm:w-10 ${isPast || isActive ? "bg-slate-400" : "bg-slate-200"}`} />
              )}
              {/* Step dot + label */}
              <div className="flex flex-col items-center gap-0.5">
                <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px]
                  ${isActive || isPast
                    ? `${style.border} ${style.bg} border-current`
                    : "border-slate-200 bg-white"
                  }`}
                >
                  {(isActive || isPast) ? (
                    <span className="text-[10px] leading-none">{step.emoji}</span>
                  ) : (
                    <span className="text-[9px] text-slate-300">{i + 1}</span>
                  )}
                </div>
                <span className={`text-[9px] font-medium ${isActive ? "text-slate-700" : isPast ? "text-slate-400" : "text-slate-300"}`}>
                  {step.label.split(" ")[1]}
                </span>
              </div>
              {/* Refunded branch after "paid" step */}
              {isRefundedEnd && (
                <div className="ml-2 flex items-center gap-1">
                  <div className="h-px w-4 bg-slate-400" />
                  <div className="flex flex-col items-center gap-0.5">
                    <div className={`flex h-6 w-6 items-center justify-center rounded-full border-2 ${STATUS_STYLE.refunded.border} ${STATUS_STYLE.refunded.bg}`}>
                      <span className="text-[10px] leading-none">↩️</span>
                    </div>
                    <span className="text-[9px] font-medium text-slate-700">Refunded</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {/* Applied end node */}
        {currentStatus !== "refunded" && (
          <div className="flex items-center">
            <div className={`h-px w-6 sm:w-10 ${activeStepIndex >= 2 ? "bg-slate-400" : "bg-slate-200"}`} />
          </div>
        )}
      </div>
    </div>
  );
}
