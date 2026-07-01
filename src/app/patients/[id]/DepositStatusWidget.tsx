"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";

type DepositStatus = "requested" | "paid" | "applied" | "refunded";

type DepositInvoice = {
  id: string;
  invoice_number: string;
  total_amount: number;
  paid_at: string | null;
  deposit_status: DepositStatus;
  status: string;
  deposit_deadline_at: string | null;
  appointment_id: string | null;
};

const STATUS_CONFIG: Record<
  DepositStatus,
  { emoji: string; label: string; color: string; bg: string; border: string }
> = {
  requested: {
    emoji: "⏳",
    label: "Deposit Requested",
    color: "text-amber-700",
    bg: "bg-amber-50",
    border: "border-amber-200",
  },
  paid: {
    emoji: "🟢",
    label: "Deposit Paid",
    color: "text-emerald-700",
    bg: "bg-emerald-50",
    border: "border-emerald-200",
  },
  applied: {
    emoji: "✅",
    label: "Deposit Applied",
    color: "text-sky-700",
    bg: "bg-sky-50",
    border: "border-sky-200",
  },
  refunded: {
    emoji: "↩️",
    label: "Deposit Refunded",
    color: "text-slate-600",
    bg: "bg-slate-50",
    border: "border-slate-200",
  },
};

// Statuses staff can manually set (only after deposit is paid)
const MANUAL_OPTIONS: { value: DepositStatus; label: string; emoji: string }[] = [
  { value: "paid", label: "Deposit Paid", emoji: "🟢" },
  { value: "applied", label: "Deposit Applied", emoji: "✅" },
  { value: "refunded", label: "Deposit Refunded", emoji: "↩️" },
];

export default function DepositStatusWidget({ patientId }: { patientId: string }) {
  const [deposit, setDeposit] = useState<DepositInvoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/patients/deposit-status?patientId=${patientId}`);
      const json = await res.json();
      setDeposit(json.deposit ?? null);
    } catch {
      setDeposit(null);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleStatusChange(newStatus: DepositStatus) {
    if (!deposit) return;
    setSaving(true);
    try {
      await fetch("/api/patients/deposit-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: deposit.id, deposit_status: newStatus }),
      });
      setDeposit((prev) => prev ? { ...prev, deposit_status: newStatus } : prev);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="h-3 w-24 animate-pulse rounded bg-slate-100" />
      </div>
    );
  }

  if (!deposit) return null;

  const cfg = STATUS_CONFIG[deposit.deposit_status];
  const canManuallyUpdate = deposit.deposit_status !== "requested";

  return (
    <div className={`rounded-xl border ${cfg.border} ${cfg.bg} p-4 shadow-[0_16px_40px_rgba(15,23,42,0.06)]`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        {/* Left: status + details */}
        <div className="space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Deposit Status
          </h3>
          <div className={`flex items-center gap-2 text-sm font-semibold ${cfg.color}`}>
            <span className="text-base leading-none">{cfg.emoji}</span>
            <span>{cfg.label}</span>
          </div>

          {/* Details row */}
          <div className="flex flex-wrap items-center gap-3 pt-0.5 text-[11px] text-slate-500">
            <span>
              <span className="font-medium text-slate-700">CHF</span>{" "}
              {Number(deposit.total_amount).toFixed(2)}
            </span>
            {deposit.paid_at && (
              <span>
                <span className="font-medium text-slate-700">Paid</span>{" "}
                {new Date(deposit.paid_at).toLocaleDateString(undefined, {
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                })}
              </span>
            )}
            <Link
              href={`/invoices?search=${deposit.invoice_number}`}
              className="font-medium text-sky-600 hover:underline"
            >
              #{deposit.invoice_number}
            </Link>
          </div>
        </div>

        {/* Right: manual status dropdown (only after deposit is paid) */}
        {canManuallyUpdate && (
          <div className="flex items-center gap-2">
            <select
              value={deposit.deposit_status}
              onChange={(e) => void handleStatusChange(e.target.value as DepositStatus)}
              disabled={saving}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50"
            >
              {MANUAL_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.emoji} {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Timeline steps */}
      <div className="mt-3 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
        {(["requested", "paid", "applied"] as DepositStatus[]).map((step, i) => {
          const stepCfg = STATUS_CONFIG[step];
          const isActive = deposit.deposit_status === step;
          const isPast =
            (step === "requested" && ["paid", "applied", "refunded"].includes(deposit.deposit_status)) ||
            (step === "paid" && ["applied", "refunded"].includes(deposit.deposit_status));
          return (
            <span key={step} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-slate-200">→</span>}
              <span
                className={`${
                  isActive
                    ? `${stepCfg.color} font-semibold`
                    : isPast
                    ? "text-slate-400 line-through"
                    : "text-slate-300"
                }`}
              >
                {stepCfg.emoji} {stepCfg.label}
              </span>
            </span>
          );
        })}
        {deposit.deposit_status === "refunded" && (
          <>
            <span className="text-slate-200">→</span>
            <span className={`${STATUS_CONFIG.refunded.color} font-semibold`}>
              {STATUS_CONFIG.refunded.emoji} {STATUS_CONFIG.refunded.label}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
