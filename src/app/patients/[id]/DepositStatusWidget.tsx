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

const STATUS_META: Record<DepositStatus, { label: string; accent: string; iconBg: string; iconColor: string; icon: React.ReactNode }> = {
  requested: {
    label:     "Deposit Requested",
    accent:    "bg-amber-400",
    iconBg:    "bg-amber-50",
    iconColor: "text-amber-600",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="8" />
        <path d="M10 6v4l2.5 2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  paid: {
    label:     "Deposit Paid",
    accent:    "bg-emerald-500",
    iconBg:    "bg-emerald-50",
    iconColor: "text-emerald-600",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6">
        <circle cx="10" cy="10" r="8" />
        <path d="M6.5 10.5l2.5 2.5 4-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  applied: {
    label:     "Deposit Applied",
    accent:    "bg-sky-500",
    iconBg:    "bg-sky-50",
    iconColor: "text-sky-600",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6">
        <path d="M4 10h12M10 4l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  refunded: {
    label:     "Deposit Refunded",
    accent:    "bg-slate-400",
    iconBg:    "bg-slate-100",
    iconColor: "text-slate-500",
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="1.6">
        <path d="M16 10H7M7 10l4-4M7 10l4 4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

// The 3-step linear flow shown in the progress bar
const FLOW: DepositStatus[] = ["requested", "paid", "applied"];

const MANUAL_OPTIONS: { value: DepositStatus; label: string }[] = [
  { value: "paid",     label: "Deposit Paid" },
  { value: "applied",  label: "Deposit Applied" },
  { value: "refunded", label: "Deposit Refunded" },
];

export default function DepositStatusWidget({ patientId }: { patientId: string }) {
  const [deposit, setDeposit] = useState<DepositInvoice | null | undefined>(undefined);
  const [saving, setSaving]   = useState(false);

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
    setDeposit(prev => prev ? { ...prev, deposit_status: newStatus } : prev);
    try {
      await fetch("/api/patients/deposit-status", {
        method:  "PATCH",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ invoiceId: deposit.id, deposit_status: newStatus }),
      });
    } catch {
      void load();
    } finally {
      setSaving(false);
    }
  }

  if (deposit === undefined) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 animate-pulse rounded-lg bg-slate-100" />
          <div className="space-y-1.5">
            <div className="h-2.5 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-2 w-16 animate-pulse rounded bg-slate-100" />
          </div>
        </div>
      </div>
    );
  }

  if (!deposit) return null;

  // Derive effective status: if deposit_status is not set yet (e.g. invoice was
  // marked paid manually before deposit_status sync was in place), fall back to
  // "paid" when the invoice status is already PAID, otherwise "requested".
  const currentStatus: DepositStatus =
    deposit.deposit_status ??
    (deposit.status === "PAID" || deposit.status === "PARTIAL_PAID" ? "paid" : "requested");
  const meta = STATUS_META[currentStatus];
  const canEdit = currentStatus !== "requested";

  // Progress bar: which flow step are we on (refunded counts as step 1 = paid)
  const flowIndex = currentStatus === "refunded" ? 1 : FLOW.indexOf(currentStatus);

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 shadow-[0_16px_40px_rgba(15,23,42,0.08)] overflow-hidden">
      {/* Coloured top accent bar */}
      <div className={`h-0.5 w-full ${meta.accent}`} />

      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Deposit Status
          </span>
          <Link
            href="/deposits"
            className="text-[11px] font-medium text-slate-400 hover:text-sky-600 transition-colors"
          >
            View all →
          </Link>
        </div>

        {/* Main row: icon + status + meta + action */}
        <div className="flex items-start justify-between gap-4">
          {/* Left: icon + label + meta */}
          <div className="flex items-start gap-3">
            {/* Icon */}
            <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${meta.iconBg} ${meta.iconColor}`}>
              {meta.icon}
            </div>

            {/* Text */}
            <div>
              <p className="text-sm font-semibold text-slate-900 leading-tight">
                {meta.label}
              </p>
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                <span className="font-medium text-slate-600">CHF {Number(deposit.total_amount).toFixed(2)}</span>
                {deposit.paid_at && (
                  <>
                    <span>·</span>
                    <span>
                      {new Date(deposit.paid_at).toLocaleDateString("fr-CH", {
                        day: "numeric", month: "short", year: "numeric",
                      })}
                    </span>
                  </>
                )}
                <span>·</span>
                <Link href="/deposits" className="text-sky-500 hover:text-sky-700 transition-colors">
                  #{deposit.invoice_number}
                </Link>
              </div>
            </div>
          </div>

          {/* Right: segmented status selector (only when editable) */}
          {canEdit && (
            <div className="shrink-0">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                Update status
              </p>
              <div className="flex items-stretch divide-x divide-slate-200 overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                {MANUAL_OPTIONS.map(opt => {
                  const isActive = currentStatus === opt.value;
                  const optMeta  = STATUS_META[opt.value];
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      disabled={saving || isActive}
                      onClick={() => void handleChange(opt.value)}
                      title={optMeta.label}
                      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium transition-colors disabled:cursor-default
                        ${isActive
                          ? `${optMeta.iconBg} ${optMeta.iconColor} font-semibold`
                          : "bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700 cursor-pointer"
                        }`}
                    >
                      {isActive && (
                        <svg viewBox="0 0 12 12" fill="none" className="h-3 w-3 shrink-0" stroke="currentColor" strokeWidth="2.5">
                          <path d="M1.5 6l3 3 6-6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      {opt.value === "paid"     && "Paid"}
                      {opt.value === "applied"  && "Applied"}
                      {opt.value === "refunded" && "Refunded"}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Progress steps */}
        <div className="mt-4 flex items-center gap-0">
          {FLOW.map((step, i) => {
            const isDone   = i < flowIndex;
            const isActive = i === flowIndex && currentStatus !== "refunded";
            const stepMeta = STATUS_META[step];

            return (
              <div key={step} className="flex flex-1 items-center">
                {/* Node */}
                <div className="flex flex-col items-center gap-1">
                  <div className={`flex h-5 w-5 items-center justify-center rounded-full border transition-all
                    ${isActive
                      ? `border-current ${stepMeta.iconBg} ${stepMeta.iconColor} shadow-sm`
                      : isDone
                        ? "border-transparent bg-slate-300 text-white"
                        : "border-slate-200 bg-white text-slate-300"
                    }`}
                  >
                    {isDone ? (
                      <svg viewBox="0 0 12 12" fill="none" className="h-2.5 w-2.5" stroke="currentColor" strokeWidth="2">
                        <path d="M2 6l2.5 2.5 5.5-5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    ) : (
                      <div className={`h-1.5 w-1.5 rounded-full ${isActive ? "bg-current" : "bg-slate-200"}`} />
                    )}
                  </div>
                  <span className={`text-[9px] font-medium whitespace-nowrap
                    ${isActive ? stepMeta.iconColor : isDone ? "text-slate-400" : "text-slate-300"}`}
                  >
                    {step === "requested" ? "Requested" : step === "paid" ? "Paid" : "Applied"}
                  </span>
                </div>

                {/* Connector (not after last) */}
                {i < FLOW.length - 1 && (
                  <div className={`mx-1 h-px flex-1 transition-colors ${isDone || isActive ? "bg-slate-300" : "bg-slate-150 bg-slate-200"}`} />
                )}
              </div>
            );
          })}

          {/* Refunded branch — shown when refunded */}
          {currentStatus === "refunded" && (
            <div className="ml-3 flex items-center gap-1.5">
              <div className="h-px w-4 bg-slate-300" />
              <div className="flex flex-col items-center gap-1">
                <div className={`flex h-5 w-5 items-center justify-center rounded-full border border-current ${STATUS_META.refunded.iconBg} ${STATUS_META.refunded.iconColor} shadow-sm`}>
                  <div className="h-1.5 w-1.5 rounded-full bg-current" />
                </div>
                <span className={`text-[9px] font-medium ${STATUS_META.refunded.iconColor}`}>Refunded</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
