"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import RequireAuth from "@/components/RequireAuth";

type DepositStatus = "requested" | "paid" | "applied" | "refunded";

interface DepositInvoice {
  id: string;
  invoice_number: string;
  title: string | null;
  status: string;
  deposit_status: DepositStatus | null;
  total_amount: number;
  paid_amount: number;
  paid_at: string | null;
  deposit_deadline_at: string | null;
  created_at: string;
  appointment_id: string | null;
  payment_link_token: string | null;
  patient: {
    id: string;
    first_name: string;
    last_name: string;
    email: string | null;
    phone: string | null;
  } | null;
  appointment: {
    id: string;
    start_time: string;
    status: string;
    reason: string | null;
    title: string | null;
  } | null;
}

type Tab = "pending" | "overdue" | "paid" | "all";

function getTimeLeft(deadline: string): { label: string; urgent: boolean; expired: boolean } {
  const diff = new Date(deadline).getTime() - Date.now();
  if (diff <= 0) return { label: "Expiré", urgent: true, expired: true };
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  if (hours < 6) return { label: `${hours}h ${minutes}m restantes`, urgent: true, expired: false };
  if (hours < 24) return { label: `${hours}h restantes`, urgent: true, expired: false };
  const days = Math.floor(hours / 24);
  return { label: `${days}j ${hours % 24}h restantes`, urgent: false, expired: false };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("fr-CH", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Zurich",
  });
}

function StatusBadge({ status, deadlineAt, depositStatus }: { status: string; deadlineAt: string | null; depositStatus: DepositStatus | null }) {
  // Applied / Refunded — manual lifecycle tags take visual priority when deposit is paid
  if (depositStatus === "applied") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-sky-100 text-sky-700">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-500" />
        Imputé
      </span>
    );
  }
  if (depositStatus === "refunded") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Remboursé
      </span>
    );
  }
  if (status === "PARTIAL_PAID" || status === "PAID") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100 text-emerald-700">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
        Payé
      </span>
    );
  }
  if (status === "CANCELLED") {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-500">
        <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
        Annulé
      </span>
    );
  }
  if (status === "OPEN" && deadlineAt) {
    const { expired, urgent } = getTimeLeft(deadlineAt);
    if (expired) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-red-100 text-red-700">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
          En retard
        </span>
      );
    }
    if (urgent) {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-orange-100 text-orange-700">
          <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
          Urgent
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
        En attente
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100 text-blue-700">
      <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
      Ouvert
    </span>
  );
}

export default function DepositsPage() {
  const [invoices, setInvoices] = useState<DepositInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("pending");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [updatingStatus, setUpdatingStatus] = useState<string | null>(null);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/deposits");
      const data = await res.json();
      setInvoices(data.invoices || []);
    } catch (err) {
      console.error("Failed to fetch deposits:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  async function handleCancel(invoiceId: string, appointmentId: string | null) {
    if (!confirm("Annuler cet acompte et le rendez-vous associé ?")) return;
    setCancelling(invoiceId);
    try {
      await fetch("/api/deposits/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, appointmentId }),
      });
      await fetchInvoices();
    } catch (err) {
      console.error("Failed to cancel:", err);
    } finally {
      setCancelling(null);
    }
  }

  async function handleDepositStatusChange(invoiceId: string, newStatus: DepositStatus) {
    setUpdatingStatus(invoiceId);
    try {
      await fetch("/api/patients/deposit-status", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId, deposit_status: newStatus }),
      });
      // Optimistic update in local state
      setInvoices(prev =>
        prev.map(inv => inv.id === invoiceId ? { ...inv, deposit_status: newStatus } : inv)
      );
    } catch (err) {
      console.error("Failed to update deposit status:", err);
    } finally {
      setUpdatingStatus(null);
    }
  }

  const now = Date.now();
  const filtered = invoices.filter(inv => {
    if (tab === "overdue") return inv.status === "OPEN" && inv.deposit_deadline_at && new Date(inv.deposit_deadline_at).getTime() < now;
    if (tab === "pending") return inv.status === "OPEN" && inv.deposit_deadline_at && new Date(inv.deposit_deadline_at).getTime() >= now;
    if (tab === "paid") return inv.status === "PARTIAL_PAID" || inv.status === "PAID";
    return true;
  });

  const overdueCount = invoices.filter(i => i.status === "OPEN" && i.deposit_deadline_at && new Date(i.deposit_deadline_at).getTime() < now).length;
  const pendingCount = invoices.filter(i => i.status === "OPEN" && i.deposit_deadline_at && new Date(i.deposit_deadline_at).getTime() >= now).length;
  const paidCount = invoices.filter(i => i.status === "PARTIAL_PAID" || i.status === "PAID").length;

  const tabs: { id: Tab; label: string; count?: number; color?: string }[] = [
    { id: "pending", label: "En attente", count: pendingCount, color: "amber" },
    { id: "overdue", label: "En retard", count: overdueCount, color: "red" },
    { id: "paid", label: "Payés", count: paidCount, color: "emerald" },
    { id: "all", label: "Tous" },
  ];

  return (
    <RequireAuth>
      <div className="min-h-screen bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 py-8">
          {/* Header */}
          <div className="mb-6">
            <div className="flex items-center gap-3 mb-1">
              <Link href="/financials" className="text-slate-400 hover:text-slate-600 text-sm">Finances</Link>
              <span className="text-slate-300">/</span>
              <span className="text-slate-700 text-sm font-medium">Acomptes 50%</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Suivi des acomptes 50%</h1>
            <p className="text-sm text-slate-500 mt-1">
              Factures d'acompte liées à un rendez-vous — annulation automatique après 48h si non payées.
            </p>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-2xl font-bold text-amber-600">{pendingCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">En attente de paiement</div>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4">
              <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">En retard (délai dépassé)</div>
            </div>
            <div className="bg-white rounded-xl border border-emerald-200 p-4">
              <div className="text-2xl font-bold text-emerald-600">{paidCount}</div>
              <div className="text-xs text-slate-500 mt-0.5">Acomptes reçus</div>
            </div>
            <div className="bg-white rounded-xl border border-slate-200 p-4">
              <div className="text-2xl font-bold text-slate-700">{invoices.length}</div>
              <div className="text-xs text-slate-500 mt-0.5">Total</div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mb-4 border-b border-slate-200">
            {tabs.map(t => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
                  tab === t.id
                    ? "border-slate-900 text-slate-900"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`}
              >
                {t.label}
                {t.count !== undefined && t.count > 0 && (
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                    t.color === "red" ? "bg-red-100 text-red-700" :
                    t.color === "amber" ? "bg-amber-100 text-amber-700" :
                    t.color === "emerald" ? "bg-emerald-100 text-emerald-700" :
                    "bg-slate-100 text-slate-600"
                  }`}>
                    {t.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-sm">Aucun acompte dans cette catégorie</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Patient</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Rendez-vous</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Acompte</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Délai</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wide">Statut</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(inv => {
                    const timeLeft = inv.deposit_deadline_at ? getTimeLeft(inv.deposit_deadline_at) : null;
                    const isPaid = inv.status === "PARTIAL_PAID" || inv.status === "PAID";
                    const isCancelled = inv.status === "CANCELLED";

                    return (
                      <tr key={inv.id} className={`hover:bg-slate-50 transition-colors ${timeLeft?.expired && !isPaid ? "bg-red-50/30" : ""}`}>
                        {/* Patient */}
                        <td className="px-4 py-3">
                          {inv.patient ? (
                            <div>
                              <Link
                                href={`/patients/${inv.patient.id}`}
                                className="font-medium text-slate-900 hover:text-blue-600 hover:underline"
                              >
                                {inv.patient.first_name} {inv.patient.last_name}
                              </Link>
                              {inv.patient.email && (
                                <div className="text-xs text-slate-400 truncate max-w-[180px]">{inv.patient.email}</div>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400">—</span>
                          )}
                        </td>

                        {/* Appointment */}
                        <td className="px-4 py-3">
                          {inv.appointment ? (
                            <div>
                              <div className="text-slate-700 font-medium">
                                {formatDate(inv.appointment.start_time)}
                              </div>
                              {(inv.appointment.title || inv.appointment.reason) && (
                                <div className="text-xs text-slate-400 truncate max-w-[160px]">
                                  {inv.appointment.title || inv.appointment.reason}
                                </div>
                              )}
                              {inv.appointment.status === "cancelled" && (
                                <span className="text-[10px] text-red-500 font-medium">RDV annulé</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-400 text-xs">Non lié</span>
                          )}
                        </td>

                        {/* Amount */}
                        <td className="px-4 py-3">
                          <div className="font-semibold text-slate-900">CHF {inv.total_amount.toFixed(2)}</div>
                          <div className="text-xs text-slate-400">Facture #{inv.invoice_number}</div>
                          {inv.title && <div className="text-xs text-slate-400 truncate max-w-[140px]">{inv.title}</div>}
                        </td>

                        {/* Deadline / time left */}
                        <td className="px-4 py-3">
                          {inv.deposit_deadline_at ? (
                            <div>
                              <div className="text-xs text-slate-500">{formatDate(inv.deposit_deadline_at)}</div>
                              {!isPaid && !isCancelled && timeLeft && (
                                <div className={`text-xs font-semibold mt-0.5 ${timeLeft.expired ? "text-red-600" : timeLeft.urgent ? "text-orange-600" : "text-slate-600"}`}>
                                  {timeLeft.label}
                                </div>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400">Chrono non démarré</span>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          <div className="flex flex-col gap-1.5">
                            <StatusBadge status={inv.status} deadlineAt={inv.deposit_deadline_at} depositStatus={inv.deposit_status} />
                            {/* Manual tagging dropdown — visible once deposit is paid */}
                            {isPaid && (
                              <select
                                value={inv.deposit_status ?? "paid"}
                                onChange={(e) => void handleDepositStatusChange(inv.id, e.target.value as DepositStatus)}
                                disabled={updatingStatus === inv.id}
                                className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400 disabled:opacity-50"
                              >
                                <option value="paid">🟢 Payé</option>
                                <option value="applied">✅ Imputé au traitement</option>
                                <option value="refunded">↩️ Remboursé</option>
                              </select>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2 justify-end">
                            {/* Payment link */}
                            {inv.status === "OPEN" && inv.payment_link_token && (
                              <a
                                href={`/invoice/pay/${inv.payment_link_token}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                              >
                                Voir lien
                              </a>
                            )}
                            {/* Cancel button — only for OPEN invoices with appointments */}
                            {inv.status === "OPEN" && inv.appointment_id && (
                              <button
                                onClick={() => handleCancel(inv.id, inv.appointment_id)}
                                disabled={cancelling === inv.id}
                                className="text-xs px-2.5 py-1 rounded-lg border border-red-200 text-red-600 hover:bg-red-50 transition-colors disabled:opacity-50"
                              >
                                {cancelling === inv.id ? "..." : "Annuler"}
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </RequireAuth>
  );
}
