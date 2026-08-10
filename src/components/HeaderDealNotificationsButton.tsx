"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useDealNotifications } from "@/components/DealNotificationsContext";

export default function HeaderDealNotificationsButton() {
  const router = useRouter();
  const { unreadCount, notifications, loading, markAsRead, markAllAsRead } = useDealNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const count = unreadCount ?? 0;
  const displayCount = count > 9 ? "9+" : count;
  const hasUnread = count > 0;

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

  function getNotificationText(notification: typeof notifications[0]): string {
    switch (notification.notification_type) {
      case 'stage_changed':
        return `Deal moved from "${notification.old_stage_name || 'Unknown'}" to "${notification.new_stage_name || 'Unknown'}"`;
      case 'deal_created':
        return 'New deal created';
      case 'deal_assigned':
        return 'Deal assigned to you';
      case 'deal_updated':
        return 'Deal updated';
      default:
        return 'Deal notification';
    }
  }

  function getNotificationIcon(type: string) {
    switch (type) {
      case 'stage_changed':
        return (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
          </svg>
        );
      case 'deal_created':
        return (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="16" />
            <line x1="8" y1="12" x2="16" y2="12" />
          </svg>
        );
      case 'deal_assigned':
        return (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        );
      default:
        return (
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
        );
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setDropdownOpen(!dropdownOpen)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        title="Deal Notifications"
      >
        <span className="sr-only">Deal notifications</span>
        <svg
          className="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
        {hasUnread ? (
          <span className="absolute -top-0.5 -right-0.5 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-purple-500 px-1 text-[9px] font-semibold text-white shadow-sm">
            {displayCount}
          </span>
        ) : null}
      </button>

      {dropdownOpen && (
        <div className="absolute right-0 z-50 mt-2 w-80 rounded-xl border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Deal Updates</h3>
            {hasUnread && (
              <button
                type="button"
                onClick={() => void markAllAsRead()}
                className="text-[10px] font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400"
              >
                Mark all read
              </button>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">Loading...</p>
            ) : notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-xs text-slate-500">No deal notifications</p>
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
                    router.push(`/patients/${notification.patient_id}?m_tab=crm`);
                  }}
                  className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-700 ${
                    !notification.read_at ? "bg-purple-50/50 dark:bg-purple-900/20" : ""
                  }`}
                >
                  <div className={`mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                    !notification.read_at ? "bg-purple-100 text-purple-600 dark:bg-purple-900/40 dark:text-purple-300" : "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
                  }`}>
                    {getNotificationIcon(notification.notification_type)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate text-xs ${!notification.read_at ? "font-semibold text-slate-900 dark:text-slate-100" : "font-medium text-slate-700 dark:text-slate-300"}`}>
                        {getPatientName(notification.patient)}
                      </p>
                      <span className="flex-shrink-0 text-[10px] text-slate-400">
                        {formatTimeAgo(notification.created_at)}
                      </span>
                    </div>
                    {notification.deal?.title && (
                      <p className="truncate text-[11px] text-slate-600 dark:text-slate-400">
                        {notification.deal.title}
                      </p>
                    )}
                    <p className="mt-0.5 truncate text-[10px] text-slate-400 dark:text-slate-500">
                      {getNotificationText(notification)}
                    </p>
                    {notification.changed_by_name && (
                      <p className="mt-0.5 truncate text-[9px] text-slate-400 dark:text-slate-500">
                        by {notification.changed_by_name}
                      </p>
                    )}
                  </div>
                  {!notification.read_at && (
                    <div className="mt-2 h-2 w-2 flex-shrink-0 rounded-full bg-purple-500" />
                  )}
                </button>
              ))
            )}
          </div>
          <div className="border-t border-slate-100 px-4 py-2 dark:border-slate-700">
            <button
              type="button"
              onClick={() => {
                setDropdownOpen(false);
                router.push("/notifications/deals");
              }}
              className="w-full text-center text-[11px] font-medium text-purple-600 hover:text-purple-700 dark:text-purple-400"
            >
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
