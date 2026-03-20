"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { useEmailNotifications } from "@/components/EmailNotificationsContext";

type EmailNotification = {
  id: string;
  created_at: string;
  read_at: string | null;
  patient_id: string;
  original_email_id: string;
  reply_email_id: string;
  reply_email: {
    id: string;
    subject: string | null;
    body: string | null;
    from_address: string | null;
    sent_at: string | null;
    created_at: string | null;
  } | null;
  original_email: {
    id: string;
    subject: string | null;
    to_address: string | null;
    sent_at: string | null;
  } | null;
  patient: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export default function EmailRepliesNotificationsPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const itemsPerPage = 10;
  const { refreshNotifications: refreshContextNotifications } = useEmailNotifications();

  async function loadNotifications() {
    try {
      setLoading(true);
      setError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const user = authData?.user;

      if (!user) {
        setError("You must be logged in to view email notifications.");
        setNotifications([]);
        setLoading(false);
        return;
      }

      const { data, error: fetchError } = await supabaseClient
        .from("email_reply_notifications")
        .select(`
          id,
          created_at,
          read_at,
          patient_id,
          original_email_id,
          reply_email_id,
          reply_email:emails!reply_email_id(id, subject, body, from_address, sent_at, created_at),
          original_email:emails!original_email_id(id, subject, to_address, sent_at),
          patient:patients(id, first_name, last_name)
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (fetchError) {
        setError(fetchError.message);
        setNotifications([]);
        setLoading(false);
        return;
      }

      setNotifications((data || []) as unknown as EmailNotification[]);
      setLoading(false);
    } catch {
      setError("Failed to load email notifications.");
      setNotifications([]);
      setLoading(false);
    }
  }

  useEffect(() => {
    loadNotifications();
  }, []);

  async function handleMarkAsRead(id: string) {
    const nowIso = new Date().toISOString();

    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: nowIso } : n))
    );

    try {
      await supabaseClient
        .from("email_reply_notifications")
        .update({ read_at: nowIso })
        .eq("id", id);
      
      refreshContextNotifications();
    } catch {
      // Revert on error
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read_at: null } : n))
      );
    }
  }

  async function handleMarkAllRead() {
    const unreadIds = notifications
      .filter((n) => !n.read_at)
      .map((n) => n.id);

    if (unreadIds.length === 0) return;

    try {
      setMarkingAllRead(true);
      const nowIso = new Date().toISOString();

      const { error: updateError } = await supabaseClient
        .from("email_reply_notifications")
        .update({ read_at: nowIso })
        .in("id", unreadIds);

      if (updateError) {
        setMarkingAllRead(false);
        return;
      }

      setNotifications((prev) =>
        prev.map((n) =>
          unreadIds.includes(n.id) ? { ...n, read_at: nowIso } : n
        )
      );

      refreshContextNotifications();
    } catch {
    } finally {
      setMarkingAllRead(false);
    }
  }

  function stripHtml(html: string | null): string {
    if (!html) return "";
    return html.replace(/<[^>]*>/g, "").trim();
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return "";
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString();
  }

  // Filter and paginate
  const filteredNotifications = notifications.filter((n) => {
    if (filter === "unread") return !n.read_at;
    if (filter === "read") return !!n.read_at;
    return true;
  });

  const totalPages = Math.ceil(filteredNotifications.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedNotifications = filteredNotifications.slice(
    startIndex,
    startIndex + itemsPerPage
  );

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Email Replies</h1>
          <p className="text-xs text-slate-500">
            Patient replies to emails you&apos;ve sent.
            {unreadCount > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                {unreadCount} unread
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-1 py-0.5 text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => {
                setFilter("all");
                setCurrentPage(1);
              }}
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (filter === "all"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              All
            </button>
            <button
              type="button"
              onClick={() => {
                setFilter("unread");
                setCurrentPage(1);
              }}
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (filter === "unread"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              Unread
            </button>
            <button
              type="button"
              onClick={() => {
                setFilter("read");
                setCurrentPage(1);
              }}
              className={
                "rounded-full px-2 py-0.5 text-[11px] " +
                (filter === "read"
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:text-slate-900")
              }
            >
              Read
            </button>
          </div>
          <button
            type="button"
            onClick={() => loadNotifications()}
            disabled={loading}
            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAllRead}
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingAllRead ? "Marking..." : "Mark all as read"}
            </button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        {loading ? (
          <p className="text-xs text-slate-500">Loading email notifications...</p>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : filteredNotifications.length === 0 ? (
          <div className="text-center py-8">
            <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="mt-2 text-xs text-slate-500">
              {filter === "all"
                ? "No email replies yet. When patients reply to your emails, they'll appear here."
                : filter === "unread"
                  ? "No unread email replies."
                  : "No read email replies."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {paginatedNotifications.map((notification) => {
              const isRead = !!notification.read_at;
              const isExpanded = expandedId === notification.id;
              const patient = notification.patient;
              const patientName = patient
                ? `${patient.first_name || ""} ${patient.last_name || ""}`.trim() || "Unknown"
                : "Unknown patient";
              const replyEmail = notification.reply_email;
              const originalEmail = notification.original_email;
              const replySubject = replyEmail?.subject || "(no subject)";
              const replyBody = stripHtml(replyEmail?.body ?? null);
              const replyFrom = replyEmail?.from_address || "Unknown sender";
              const replyDate = formatDate(replyEmail?.sent_at ?? replyEmail?.created_at ?? notification.created_at ?? null);
              const originalSubject = originalEmail?.subject || "(no subject)";

              return (
                <div
                  key={notification.id}
                  className={`rounded-lg border transition-all ${
                    isRead
                      ? "border-slate-200 bg-slate-50/50"
                      : "border-sky-200 bg-sky-50/50"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      if (!isRead) {
                        handleMarkAsRead(notification.id);
                      }
                      setExpandedId(isExpanded ? null : notification.id);
                    }}
                    className="w-full text-left px-4 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span>{replyDate}</span>
                          {!isRead && (
                            <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700">
                              New
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm font-medium text-slate-900 truncate">
                          {replySubject}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-600">
                          From: <span className="font-medium">{replyFrom}</span>
                          {" • "}
                          Patient:{" "}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (patient?.id) {
                                router.push(`/patients/${patient.id}?m_tab=crm&crm_sub=emails`);
                              }
                            }}
                            className="font-medium text-sky-700 hover:text-sky-800 hover:underline"
                          >
                            {patientName}
                          </button>
                        </p>
                        {!isExpanded && replyBody && (
                          <p className="mt-1 text-[11px] text-slate-500 truncate">
                            {replyBody.slice(0, 100)}
                            {replyBody.length > 100 ? "..." : ""}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <svg
                          className={`h-4 w-4 text-slate-400 transition-transform ${
                            isExpanded ? "rotate-180" : ""
                          }`}
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="border-t border-slate-200 px-4 py-3">
                      <div className="mb-3 rounded-lg bg-slate-100 p-3">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                          In reply to your email:
                        </p>
                        <p className="text-xs text-slate-700">{originalSubject}</p>
                        {originalEmail?.sent_at && (
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            Sent: {formatDate(originalEmail.sent_at)}
                          </p>
                        )}
                      </div>

                      <div className="mb-3">
                        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                          Patient&apos;s Reply:
                        </p>
                        <div
                          className="text-xs text-slate-700 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{
                            __html: replyEmail?.body || "<p>No content</p>",
                          }}
                        />
                      </div>

                      <div className="flex items-center gap-2 pt-2 border-t border-slate-200">
                        <button
                          type="button"
                          onClick={() => {
                            if (patient?.id) {
                              router.push(`/patients/${patient.id}?m_tab=crm&crm_sub=emails`);
                            }
                          }}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          View All Emails
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (patient?.id) {
                              router.push(`/patients/${patient.id}`);
                            }
                          }}
                          className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <svg className="mr-1.5 h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                          </svg>
                          View Patient
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2 pt-4 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Previous
                </button>
                <span className="text-[11px] text-slate-600">
                  Page {currentPage} of {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    setCurrentPage((prev) => Math.min(totalPages, prev + 1))
                  }
                  disabled={currentPage === totalPages}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Next
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
