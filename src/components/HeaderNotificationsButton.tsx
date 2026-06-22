"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEmailNotifications } from "@/components/EmailNotificationsContext";
import { usePDFJobNotifications } from "@/components/PDFJobNotificationsContext";

type Tab = "emails" | "pdfs";

export default function HeaderNotificationsButton() {
  const router = useRouter();
  const t = useTranslations("header");
  const emailCtx = useEmailNotifications();
  const pdfCtx = usePDFJobNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("emails");
  const dropdownRef = useRef<HTMLDivElement>(null);

  const emailCount = emailCtx.unreadCount ?? 0;
  const pdfCount = pdfCtx.pendingCount + pdfCtx.completedUnreadCount;
  const totalCount = emailCount + pdfCount;
  const displayCount = totalCount > 9 ? "9+" : totalCount;
  const hasUnread = totalCount > 0;

  // Mark PDF jobs as read when opening the PDF tab
  useEffect(() => {
    if (dropdownOpen && activeTab === "pdfs") {
      pdfCtx.markCompletedAsRead();
    }
  }, [dropdownOpen, activeTab, pdfCtx]);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  function formatTimeAgo(dateString: string | null): string {
    if (!dateString) return "";
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("justNow");
    if (diffMins < 60) return t("minutesAgo", { n: diffMins });
    if (diffHours < 24) return t("hoursAgo", { n: diffHours });
    if (diffDays < 7) return t("daysAgo", { n: diffDays });
    return date.toLocaleDateString();
  }

  function getPatientName(patient: { first_name: string | null; last_name: string | null } | null): string {
    if (!patient) return t("unknownPatient");
    return `${patient.first_name || ""} ${patient.last_name || ""}`.trim() || t("unknownPatient");
  }

  function stripHtml(html: string | null): string {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").slice(0, 100);
  }

  function statusLabel(status: string): string {
    switch (status) {
      case "pending": return "⏳ Pending";
      case "processing": return "⏳ Processing";
      case "completed": return "✅ Done";
      case "failed": return "❌ Failed";
      default: return status;
    }
  }

  function typeLabel(type: string, reminderLevel: number | null): string {
    const suffix = type === "reminder" && reminderLevel ? ` L${reminderLevel}` : "";
    return `${type.toUpperCase()}${suffix}`;
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
        title={t("notifications")}
      >
        <span className="sr-only">{t("notifications")}</span>
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {hasUnread ? (
          <span className="absolute -top-0.5 -right-0.5 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white shadow-sm">
            {displayCount}
          </span>
        ) : null}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg">
          {/* Tabs */}
          <div className="flex border-b border-slate-100">
            <button
              type="button"
              onClick={() => setActiveTab("emails")}
              className={`flex-1 px-3 py-2.5 text-[11px] font-medium ${
                activeTab === "emails"
                  ? "border-b-2 border-sky-500 text-sky-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              Emails {emailCount > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-600">{emailCount}</span>}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("pdfs")}
              className={`flex-1 px-3 py-2.5 text-[11px] font-medium ${
                activeTab === "pdfs"
                  ? "border-b-2 border-sky-500 text-sky-700"
                  : "text-slate-500 hover:text-slate-700"
              }`}
            >
              PDFs {pdfCount > 0 && <span className="ml-1 rounded-full bg-rose-100 px-1.5 py-0.5 text-[9px] text-rose-600">{pdfCount}</span>}
            </button>
          </div>

          {/* Emails tab */}
          {activeTab === "emails" && (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <h3 className="text-xs font-semibold text-slate-700">{t("emailReplies")}</h3>
                {emailCount > 0 && (
                  <button
                    type="button"
                    onClick={() => void emailCtx.markAllAsRead()}
                    className="text-[10px] font-medium text-sky-600 hover:text-sky-700"
                  >
                    {t("markAllRead")}
                  </button>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {emailCtx.loading ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">{t("loadingUser")}</p>
                ) : emailCtx.notifications.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">{t("noEmailNotifications")}</p>
                ) : (
                  emailCtx.notifications.map((notification) => (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        if (!notification.read_at) {
                          void emailCtx.markAsRead(notification.id);
                        }
                        setDropdownOpen(false);
                        router.push(`/patients/${notification.patient_id}?m_tab=crm&crm_sub=emails`);
                      }}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        !notification.read_at ? "bg-sky-50/50" : ""
                      }`}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                        !notification.read_at ? "bg-sky-100 text-sky-600" : "bg-slate-100 text-slate-500"
                      }`}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                          <path d="M22 6l-10 7L2 6" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`truncate text-xs ${!notification.read_at ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                            {getPatientName(notification.patient)}
                          </p>
                          <span className="flex-shrink-0 text-[10px] text-slate-400">
                            {formatTimeAgo(notification.reply_email?.created_at || notification.created_at)}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-slate-600">
                          {notification.reply_email?.subject || t("newReply")}
                        </p>
                        <p className="mt-0.5 truncate text-[10px] text-slate-400">
                          {stripHtml(notification.reply_email?.body ?? null)}
                        </p>
                      </div>
                      {!notification.read_at && (
                        <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-sky-500" />
                      )}
                    </button>
                  ))
                )}
              </div>
              <div className="border-t border-slate-100 px-4 py-2">
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    router.push("/notifications/email-replies");
                  }}
                  className="w-full text-center text-[11px] font-medium text-sky-600 hover:text-sky-700"
                >
                  {t("viewAllNotifications")}
                </button>
              </div>
            </>
          )}

          {/* PDFs tab */}
          {activeTab === "pdfs" && (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2">
                <h3 className="text-xs font-semibold text-slate-700">PDF Generation</h3>
                {pdfCount > 0 && (
                  <span className="text-[10px] text-slate-500">{pdfCtx.pendingCount} active</span>
                )}
              </div>
              <div className="max-h-80 overflow-y-auto">
                {pdfCtx.loading ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">{t("loadingUser")}</p>
                ) : pdfCtx.jobs.length === 0 ? (
                  <p className="px-4 py-6 text-center text-xs text-slate-500">No PDF jobs yet</p>
                ) : (
                  pdfCtx.jobs.map((job) => (
                    <div
                      key={job.id}
                      className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 ${
                        job.status === "pending" || job.status === "processing" ? "bg-sky-50/30" : ""
                      }`}
                    >
                      <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                        job.status === "completed" ? "bg-emerald-100 text-emerald-600" :
                        job.status === "failed" ? "bg-rose-100 text-rose-600" :
                        "bg-amber-100 text-amber-600"
                      }`}>
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                          <polyline points="14 2 14 8 20 8" />
                        </svg>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-2">
                          <p className="truncate text-xs font-medium text-slate-900">
                            #{job.invoice_number || job.invoice_id.slice(0, 8)} — {typeLabel(job.invoice_type, job.reminder_level)}
                          </p>
                          <span className="flex-shrink-0 text-[10px] text-slate-400">
                            {formatTimeAgo(job.completed_at || job.created_at)}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          {statusLabel(job.status)}
                        </p>
                        {job.error_message && (
                          <p className="mt-0.5 truncate text-[10px] text-rose-500" title={job.error_message}>
                            {job.error_message}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
