"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useAuth } from "@/components/AuthContext";
import { useTasksNotifications } from "@/components/TasksNotificationsContext";
import { supabaseClient } from "@/lib/supabaseClient";

type TaskNotification = {
  id: string; name: string | null; content: string | null; status: string;
  priority: string; activity_date: string | null; assigned_read_at: string | null;
  created_by_name: string | null;
  document_name: string | null; document_path: string | null; document_bucket: string | null;
  patient: { id: string; first_name: string | null; last_name: string | null } | null;
  notificationKey: string;
  notificationType: "assignment" | "comment";
  notificationId: string;
  notificationCreatedAt: string;
  commentBody: string | null;
};

export default function HeaderTasksButton() {
  const router = useRouter();
  const t = useTranslations("header");
  const { user } = useAuth();
  const { openTasksCount, refreshOpenTasksCount, setOpenTasksCountOptimistic } = useTasksNotifications();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifications, setNotifications] = useState<TaskNotification[]>([]);
  const [loading, setLoading] = useState(false);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const count = openTasksCount ?? 0;

  const loadNotifications = useCallback(async () => {
    if (!user) { setNotifications([]); return; }
    setLoading(true);
    const [tasksResult, commentsResult] = await Promise.all([
      supabaseClient.from("tasks")
        .select("id, name, content, status, priority, activity_date, created_at, assigned_read_at, created_by_name, document_name, document_path, document_bucket, patient:patients(id, first_name, last_name)")
        .eq("assigned_user_id", user.id).order("created_at", { ascending: false }),
      supabaseClient.from("task_comment_mentions")
        .select("id, created_at, read_at, comment:task_comments(body, author_name), task:tasks(id, name, content, status, priority, activity_date, created_by_name, document_name, document_path, document_bucket, patient:patients(id, first_name, last_name))")
        .eq("mentioned_user_id", user.id).order("created_at", { ascending: false }),
    ]);
    const assigned = (tasksResult.data ?? []).map((row: any) => ({
      ...row, notificationKey: `assignment-${row.id}`, notificationType: "assignment" as const,
      notificationId: row.id, notificationCreatedAt: row.created_at, commentBody: null,
    }));
    const comments = (commentsResult.data ?? []).filter((row: any) => row.task).map((row: any) => ({
      ...row.task, assigned_read_at: row.read_at,
      created_by_name: row.comment?.author_name ?? row.task.created_by_name,
      notificationKey: `comment-${row.id}`, notificationType: "comment" as const,
      notificationId: row.id, notificationCreatedAt: row.created_at,
      commentBody: row.comment?.body ?? null,
    }));
    setNotifications([...assigned, ...comments].sort((a, b) =>
      new Date(b.notificationCreatedAt).getTime() - new Date(a.notificationCreatedAt).getTime(),
    ) as TaskNotification[]);
    setLoading(false);
  }, [user]);

  useEffect(() => { if (dropdownOpen) void loadNotifications(); }, [dropdownOpen, loadNotifications]);
  useEffect(() => {
    function closeOnOutsideClick(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setDropdownOpen(false);
    }
    if (dropdownOpen) document.addEventListener("mousedown", closeOnOutsideClick);
    return () => document.removeEventListener("mousedown", closeOnOutsideClick);
  }, [dropdownOpen]);

  async function markAsRead(task: TaskNotification) {
    if (task.assigned_read_at) return;
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => item.notificationKey === task.notificationKey ? { ...item, assigned_read_at: readAt } : item));
    if (task.notificationType === "comment") {
      setOpenTasksCountOptimistic((current) => current - 1);
    }
    const { error } = task.notificationType === "comment"
      ? await supabaseClient.from("task_comment_mentions").update({ read_at: readAt }).eq("id", task.notificationId)
      : await supabaseClient.from("tasks").update({ assigned_read_at: readAt }).eq("id", task.id);
    if (error) { await loadNotifications(); await refreshOpenTasksCount(); }
  }

  function viewTask(task: TaskNotification) {
    if (!task.assigned_read_at) void markAsRead(task);
    setDropdownOpen(false);
    if (
      task.notificationType === "comment" &&
      task.patient?.id &&
      task.document_path &&
      task.document_bucket
    ) {
      const params = new URLSearchParams({
        m_tab: "documents",
        openDocumentPath: task.document_path,
        openDocumentBucket: task.document_bucket,
      });
      router.push(`/patients/${task.patient.id}?${params.toString()}`);
      return;
    }
    router.push(`/tasks?task=${encodeURIComponent(task.id)}`);
  }

  async function markAllAsRead() {
    const unreadAssignments = notifications.filter((task) => !task.assigned_read_at && task.notificationType === "assignment").map((task) => task.notificationId);
    const unreadComments = notifications.filter((task) => !task.assigned_read_at && task.notificationType === "comment").map((task) => task.notificationId);
    if (!unreadAssignments.length && !unreadComments.length) return;
    setMarkingAllRead(true);
    const readAt = new Date().toISOString();
    const results = await Promise.all([
      unreadAssignments.length ? supabaseClient.from("tasks").update({ assigned_read_at: readAt }).in("id", unreadAssignments) : Promise.resolve({ error: null }),
      unreadComments.length ? supabaseClient.from("task_comment_mentions").update({ read_at: readAt }).in("id", unreadComments) : Promise.resolve({ error: null }),
    ]);
    if (!results.some((result) => result.error)) {
      setNotifications((current) => current.map((task) => !task.assigned_read_at ? { ...task, assigned_read_at: readAt } : task));
      setOpenTasksCountOptimistic((current) => current - unreadComments.length);
    }
    setMarkingAllRead(false);
  }

  function patientName(task: TaskNotification) {
    if (!task.patient) return t("unknownPatient");
    return `${task.patient.first_name ?? ""} ${task.patient.last_name ?? ""}`.trim() || t("unknownPatient");
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button type="button" onClick={() => setDropdownOpen((open) => !open)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
        title={t("taskNotifications")} aria-expanded={dropdownOpen} aria-haspopup="menu">
        <span className="sr-only">{t("taskNotifications")}</span>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
        </svg>
        {count > 0 ? <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold text-white shadow-sm">{count > 9 ? "9+" : count}</span> : null}
      </button>

      {dropdownOpen ? <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg" role="menu">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
          <h3 className="text-xs font-semibold text-slate-700">{t("taskNotifications")}</h3>
          {notifications.some((task) => !task.assigned_read_at) ? <button type="button" onClick={() => void markAllAsRead()} disabled={markingAllRead} className="text-[10px] font-medium text-amber-600 hover:text-amber-700 disabled:opacity-50">{markingAllRead ? t("markingAllRead") : t("markAllRead")}</button> : null}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {loading ? <p className="px-4 py-6 text-center text-xs text-slate-500">{t("loadingTaskNotifications")}</p>
          : notifications.length === 0 ? <p className="px-4 py-6 text-center text-xs text-slate-500">{t("noTaskNotifications")}</p>
          : notifications.map((task) => {
            const unread = !task.assigned_read_at;
            const isCompletion = task.notificationType === "comment";
            const date = task.activity_date ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(task.activity_date)) : null;
            return <button key={task.notificationKey} type="button" onClick={() => viewTask(task)} role="menuitem" className={`flex w-full items-start gap-3 border-b border-slate-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-slate-50 ${unread ? (isCompletion ? "bg-emerald-50/70" : "bg-amber-50/60") : ""}`}>
              {isCompletion ? (
                <span className={`mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full ${unread ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-emerald-500"}`}>
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12 4 4L19 6" /></svg>
                </span>
              ) : (
                <span className={`mt-1 h-2 w-2 flex-none rounded-full ${unread ? "bg-amber-500" : "bg-slate-200"}`} />
              )}
              <span className="min-w-0 flex-1">
                {isCompletion ? <span className="mb-0.5 block text-[9px] font-semibold uppercase tracking-wide text-emerald-600">{t("taskCompleted")}</span> : null}
                <span className={`block truncate text-xs ${unread ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>{task.name || t("untitledTask")}</span>
                <span className="mt-0.5 block truncate text-[11px] text-slate-500">{patientName(task)}{task.created_by_name ? ` · ${t("createdBy", { name: task.created_by_name })}` : ""}</span>
                {task.commentBody || task.content ? <span className="mt-0.5 block truncate text-[10px] text-slate-400">{task.commentBody || task.content}</span> : null}
                <span className="mt-1 flex items-center gap-2 text-[10px] text-slate-400"><span className="capitalize">{task.status.replaceAll("_", " ")}</span><span>·</span><span className="capitalize">{task.priority}</span>{date ? <><span>·</span><span>{date}</span></> : null}</span>
              </span>
            </button>;
          })}
        </div>
        <div className="border-t border-slate-100 px-4 py-2"><button type="button" onClick={() => { setDropdownOpen(false); router.push("/notifications"); }} className="w-full text-center text-[11px] font-medium text-amber-600 hover:text-amber-700">{t("viewAllTaskNotifications")}</button></div>
      </div> : null}
    </div>
  );
}
