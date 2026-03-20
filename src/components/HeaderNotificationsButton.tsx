"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useEmailNotifications } from "@/components/EmailNotificationsContext";

export default function HeaderNotificationsButton() {
  const router = useRouter();
  const { unreadCount, notifications, loading, markAsRead, markAllAsRead } = useEmailNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const count = unreadCount ?? 0;
  const displayCount = count > 9 ? "9+" : count;
  const hasUnread = count > 0;

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

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  }

  function getPatientName(patient: { first_name: string | null; last_name: string | null } | null): string {
    if (!patient) return "Unknown";
    return `${patient.first_name || ""} ${patient.last_name || ""}`.trim() || "Unknown";
  }

  function stripHtml(html: string | null): string {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").slice(0, 100);
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
        title="Email Notifications"
      >
        <span className="sr-only">Email notifications</span>
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
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <h3 className="text-sm font-semibold text-slate-900">Email Replies</h3>
            {hasUnread && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-[10px] font-medium text-sky-600 hover:text-sky-700"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">No email notifications</p>
            ) : (
              notifications.map((notification) => (
                <button
                  key={notification.id}
                  type="button"
                  onClick={() => {
                    if (!notification.read_at) {
                      void markAsRead(notification.id);
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
                      {notification.reply_email?.subject || "New reply"}
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
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
