"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCommentsUnread } from "@/components/CommentsUnreadContext";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

function renderTextWithMentions(text: string) {
  const parts = text.split(/(\s+)/);
  return parts.map((part, index) => {
    if (part.startsWith("@") && part.length > 1 && part[1] !== "@") {
      return (
        <span key={index} className="font-semibold text-emerald-600">
          {part}
        </span>
      );
    }
    return (
      <span key={index}>{part}</span>
    );
  });
}

export default function Home() {
  const [appointments, setAppointments] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [mentions, setMentions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  const { unreadCount } = useCommentsUnread();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [taskDetails, setTaskDetails] = useState<any | null>(null);
  const [taskDetailsLoading, setTaskDetailsLoading] = useState(false);
  const [taskComments, setTaskComments] = useState<any[]>([]);
  const [taskCommentsLoading, setTaskCommentsLoading] = useState(false);
  const [taskCommentInput, setTaskCommentInput] = useState("");
  const [taskCommentError, setTaskCommentError] = useState<string | null>(null);
  const [taskCommentSaving, setTaskCommentSaving] = useState(false);
  const [taskCommentMentionUserIds, setTaskCommentMentionUserIds] = useState<
    string[]
  >([]);
  const [mentionUsers, setMentionUsers] = useState<PlatformUser[]>([]);
  const [mentionUsersLoaded, setMentionUsersLoaded] = useState(false);
  const [activeMentionQuery, setActiveMentionQuery] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);

        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user ?? null;

        // Extract user's first name from metadata
        if (user) {
          const meta = (user.user_metadata || {}) as Record<string, unknown>;
          const firstName = (meta["first_name"] as string) || null;
          setUserFirstName(firstName);
        }

        const today = new Date();
        const dayStart = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          0,
          0,
          0,
          0,
        ).toISOString();
        const dayEnd = new Date(
          today.getFullYear(),
          today.getMonth(),
          today.getDate(),
          23,
          59,
          59,
          999,
        ).toISOString();

        const appointmentsPromise = supabaseClient
          .from("appointments")
          .select(
            "id, start_time, status, reason, title, notes, patient:patients(id, first_name, last_name)",
          )
          .neq("status", "cancelled")
          .gte("start_time", dayStart)
          .lte("start_time", dayEnd)
          .order("start_time", { ascending: true })
          .limit(3);

        const tasksPromise = user
          ? supabaseClient
              .from("tasks")
              .select(
                "id, name, content, activity_date, created_at, patient_id, patient:patients(id, first_name, last_name)",
              )
              .eq("assigned_user_id", user.id)
              .neq("status", "completed")
              .lte("activity_date", dayEnd) // Only show tasks up to today (not future)
              .order("activity_date", { ascending: true })
              .limit(5)
          : Promise.resolve({ data: [], error: null } as any);

        const mentionsPromise = user
          ? supabaseClient
              .from("patient_note_mentions")
              .select(
                "id, created_at, read_at, patient_id, note:patient_notes(id, body, author_name, created_at), patient:patients(id, first_name, last_name)",
              )
              .eq("mentioned_user_id", user.id)
              .is("read_at", null)
              .order("created_at", { ascending: false })
              .limit(3)
          : Promise.resolve({ data: [], error: null } as any);

        const [appointmentsResult, tasksResult, mentionsResult] =
          await Promise.all([appointmentsPromise, tasksPromise, mentionsPromise]);

        if (cancelled) return;

        setAppointments(
          !appointmentsResult.error && appointmentsResult.data
            ? (appointmentsResult.data as any[])
            : [],
        );

        setTasks(
          !tasksResult.error && tasksResult.data ? (tasksResult.data as any[]) : [],
        );

        setMentions(
          !mentionsResult.error && mentionsResult.data
            ? (mentionsResult.data as any[])
            : [],
        );
      } catch {
        if (cancelled) return;
        setAppointments([]);
        setTasks([]);
        setMentions([]);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (unreadCount === null) return;

    let cancelled = false;

    async function reloadMentions() {
      try {
        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user ?? null;
        if (!user) {
          if (!cancelled) setMentions([]);
          return;
        }

        const { data, error } = await supabaseClient
          .from("patient_note_mentions")
          .select(
            "id, created_at, read_at, patient_id, note:patient_notes(id, body, author_name, created_at), patient:patients(id, first_name, last_name)",
          )
          .eq("mentioned_user_id", user.id)
          .is("read_at", null)
          .order("created_at", { ascending: false })
          .limit(3);

        if (cancelled) return;

        setMentions(!error && data ? (data as any[]) : []);
      } catch {
        if (!cancelled) {
          setMentions([]);
        }
      }
    }

    void reloadMentions();

    return () => {
      cancelled = true;
    };
  }, [unreadCount]);

  const trimmedMentionQuery = activeMentionQuery.trim();
  const mentionOptions =
    trimmedMentionQuery && mentionUsers.length > 0
      ? mentionUsers
          .filter((user) => {
            const hay = (user.full_name || user.email || "").toLowerCase();
            return hay.includes(trimmedMentionQuery);
          })
          .slice(0, 6)
      : [];

  async function handleOpenTaskModal(task: any) {
    setSelectedTask(task);
    setTaskModalOpen(true);
    setTaskDetails(null);
    setTaskComments([]);
    setTaskCommentInput("");
    setTaskCommentError(null);
    setTaskCommentMentionUserIds([]);
    setActiveMentionQuery("");
    setTaskDetailsLoading(true);
    setTaskCommentsLoading(true);

    try {
      const [taskResult, commentsResult] = await Promise.all([
        supabaseClient
          .from("tasks")
          .select(
            "id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_name, patient:patients(id, first_name, last_name, email, phone)",
          )
          .eq("id", task.id)
          .single(),
        supabaseClient
          .from("task_comments")
          .select(
            "id, task_id, author_user_id, author_name, body, created_at",
          )
          .eq("task_id", task.id)
          .order("created_at", { ascending: true }),
      ]);

      if (!taskResult.error && taskResult.data) {
        setTaskDetails(taskResult.data as any);
      } else {
        setTaskDetails(task);
      }

      if (!commentsResult.error && commentsResult.data) {
        setTaskComments(commentsResult.data as any[]);
      } else {
        setTaskComments([]);
      }

      if (!mentionUsersLoaded) {
        try {
          const response = await fetch("/api/users/list");
          if (response.ok) {
            const json = (await response.json()) as PlatformUser[];
            setMentionUsers(json);
          }
        } catch {
        } finally {
          setMentionUsersLoaded(true);
        }
      }
    } catch {
      setTaskDetails(task);
      setTaskComments([]);
    } finally {
      setTaskDetailsLoading(false);
      setTaskCommentsLoading(false);
    }
  }

  function handleCloseTaskModal() {
    setTaskModalOpen(false);
    setSelectedTask(null);
    setTaskDetails(null);
    setTaskComments([]);
    setTaskCommentInput("");
    setTaskCommentError(null);
    setTaskCommentMentionUserIds([]);
    setActiveMentionQuery("");
  }

  function handleTaskCommentInputChangeDashboard(value: string) {
    setTaskCommentInput(value);
    setTaskCommentError(null);

    const match = value.match(/@([^\s@]{0,50})$/);
    if (match) {
      setActiveMentionQuery(match[1].toLowerCase());
    } else {
      setActiveMentionQuery("");
    }
  }

  function handleTaskMentionSelectDashboard(user: PlatformUser) {
    const display =
      (user.full_name && user.full_name.length > 0
        ? user.full_name
        : user.email) || "User";

    setTaskCommentInput((prev) =>
      prev.replace(/@([^\s@]{0,50})$/, `@${display} `),
    );

    setTaskCommentMentionUserIds((prev) => {
      if (prev.includes(user.id)) return prev;
      return [...prev, user.id];
    });

    setActiveMentionQuery("");
  }

  async function handleTaskCommentSubmitDashboard() {
    const current = taskCommentInput;
    const trimmed = current.trim();
    const task = selectedTask;
    if (!task) return;

    if (!trimmed) {
      setTaskCommentError("Comment cannot be empty.");
      return;
    }

    try {
      setTaskCommentSaving(true);
      setTaskCommentError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setTaskCommentError("You must be logged in to comment.");
        setTaskCommentSaving(false);
        return;
      }

      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const fullName =
        [first, last].filter(Boolean).join(" ") || authUser.email || null;

      const { data: inserted, error: insertError } = await supabaseClient
        .from("task_comments")
        .insert({
          task_id: task.id as string,
          author_user_id: authUser.id,
          author_name: fullName,
          body: trimmed,
        })
        .select("id, task_id, author_user_id, author_name, body, created_at")
        .single();

      if (insertError || !inserted) {
        setTaskCommentError(insertError?.message ?? "Failed to save comment.");
        setTaskCommentSaving(false);
        return;
      }

      const comment = inserted as any;
      setTaskComments((prev) => [...prev, comment]);

      const mentionedUserIds = taskCommentMentionUserIds;
      if (mentionedUserIds.length > 0) {
        const rows = mentionedUserIds.map((mentionedUserId) => ({
          task_comment_id: comment.id as string,
          task_id: task.id as string,
          mentioned_user_id: mentionedUserId,
        }));

        try {
          await supabaseClient.from("task_comment_mentions").insert(rows);
        } catch {
        }
      }

      setTaskCommentInput("");
      setTaskCommentMentionUserIds([]);
      setActiveMentionQuery("");
      setTaskCommentSaving(false);
    } catch {
      setTaskCommentError("Failed to save comment.");
      setTaskCommentSaving(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            Hi{userFirstName ? ` ${userFirstName}` : ""}
          </h1>
          <p className="text-sm text-slate-500">
            Let&apos;s get you on a productive routine today!
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs sm:text-sm">
          <Link
            href="/add-patients"
            className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-4 py-1.5 font-medium text-sky-700 shadow-[0_10px_25px_rgba(15,23,42,0.16)] backdrop-blur hover:bg-white hover:text-sky-800"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-sky-500 text-[12px] font-semibold text-white shadow-sm">
              +
            </span>
            <span>Add patient</span>
          </Link>
          <Link
            href="/appointments"
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/60 px-4 py-1.5 font-medium text-slate-700 shadow-[0_10px_25px_rgba(15,23,42,0.10)] backdrop-blur hover:bg-white hover:text-slate-900"
          >
            <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-slate-900/80 text-[11px] text-white shadow-sm">
              <svg
                className="h-3.5 w-3.5"
                viewBox="0 0 24 24"
                aria-hidden="true"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M16 3v4M8 3v4M3 11h18" />
              </svg>
            </span>
            <span>Schedule appointment</span>
          </Link>
        </div>
      </header>

      <section className="space-y-4">
        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">
                Today&apos;s appointments
              </h2>
              <p className="text-xs text-slate-500">
                Quick view of your upcoming consultations and surgeries.
              </p>
            </div>
            <Link
              href="/appointments"
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View all
            </Link>
          </div>
          {loading ? (
            <p className="text-xs text-slate-500">
              Loading today&apos;s appointments...
            </p>
          ) : appointments.length === 0 ? (
            <p className="text-xs text-slate-500">
              No appointments scheduled for today.
            </p>
          ) : (
            <div className="divide-y divide-slate-100 text-sm">
              {appointments.map((appt) => {
                const start = appt.start_time ? new Date(appt.start_time as string) : null;
                const timeLabel =
                  start && !Number.isNaN(start.getTime())
                    ? start.toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "";
                const patientName = appt.patient
                  ? `${appt.patient.first_name ?? ""} ${
                      appt.patient.last_name ?? ""
                    }`
                      .trim()
                      .replace(/\s+/g, " ")
                  : "Unknown patient";
                const rawService = (appt.reason as string | null) ?? null;
                const service = rawService
                  ? (rawService.split("[")[0] || "Appointment").trim()
                  : "Appointment";

                let badgeLabel = "Scheduled";
                let badgeClasses =
                  "rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700";
                if (appt.status === "confirmed") {
                  badgeLabel = "Confirmed";
                  badgeClasses =
                    "rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700";
                } else if (appt.status === "completed") {
                  badgeLabel = "Completed";
                  badgeClasses =
                    "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700";
                }

                return (
                  <div
                    key={appt.id as string}
                    className="flex items-center justify-between py-2"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {timeLabel} · {service || "Appointment"}
                      </p>
                      <p className="text-xs text-slate-500">{patientName}</p>
                    </div>
                    <span className={badgeClasses}>{badgeLabel}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Tasks</h2>
              <p className="text-xs text-slate-500">
                Your most important follow-ups and admin items.
              </p>
            </div>
            <Link
              href="/tasks"
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View all tasks
            </Link>
          </div>
          {loading ? (
            <p className="text-xs text-slate-500">Loading your tasks...</p>
          ) : tasks.length === 0 ? (
            <p className="text-xs text-slate-500">
              No open tasks assigned to you.
            </p>
          ) : (
            <div className="space-y-2 text-sm">
              {tasks.map((task) => {
                const patient = task.patient;
                const patientName = patient
                  ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`
                      .trim()
                      .replace(/\s+/g, " ")
                  : null;

                const rawDate =
                  (task.activity_date as string | null) ?? (task.created_at as string);
                let badgeLabel = "Pending";
                let badgeClasses =
                  "rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700";
                if (rawDate) {
                  const today = new Date();
                  today.setHours(0, 0, 0, 0);
                  const d = new Date(rawDate);
                  if (!Number.isNaN(d.getTime())) {
                    const taskDate = new Date(
                      d.getFullYear(),
                      d.getMonth(),
                      d.getDate(),
                    );
                    const diffMs = taskDate.getTime() - today.getTime();
                    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
                    if (diffDays === 0) {
                      badgeLabel = "Today";
                      badgeClasses =
                        "rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700";
                    } else if (diffDays < 0) {
                      badgeLabel = "Overdue";
                      badgeClasses =
                        "rounded-full bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700";
                    } else if (diffDays <= 7) {
                      badgeLabel = "This week";
                      badgeClasses =
                        "rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700";
                    }
                  }
                }

                return (
                  <button
                    key={task.id as string}
                    type="button"
                    onClick={() => void handleOpenTaskModal(task)}
                    className="flex w-full items-center justify-between rounded-lg bg-slate-50/80 px-3 py-2 text-left hover:bg-slate-100"
                  >
                    <div>
                      <p className="font-medium text-slate-800">
                        {task.name as string}
                      </p>
                      <p className="text-xs text-slate-500">
                        {task.content
                          ? (task.content as string)
                          : patientName || "Task"}
                      </p>
                    </div>
                    <span className={badgeClasses}>{badgeLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Mentions</h2>
              <p className="text-xs text-slate-500">
                Notes and comments where you were tagged.
              </p>
            </div>
            <Link
              href="/comments"
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View inbox
            </Link>
          </div>
          {loading ? (
            <p className="text-xs text-slate-500">Loading mentions...</p>
          ) : mentions.length === 0 ? (
            <p className="text-xs text-slate-500">No new mentions.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {mentions.map((mention) => {
                const createdLabel = mention.created_at
                  ? (() => {
                      const d = new Date(mention.created_at as string);
                      return Number.isNaN(d.getTime()) ? null : d.toLocaleString();
                    })()
                  : null;
                const patient = mention.patient;
                const patientName = patient
                  ? `${patient.first_name} ${patient.last_name}`.trim()
                  : "Unknown patient";
                const note = mention.note;

                return (
                  <Link
                    key={mention.id as string}
                    href="/comments"
                    className="flex items-start justify-between rounded-lg bg-slate-50/80 px-3 py-2 hover:bg-slate-100"
                  >
                    <div className="pr-4">
                      <p className="text-xs font-medium text-slate-500">
                        {createdLabel ?? ""} {createdLabel ? "· " : ""}
                        {patientName}
                      </p>
                      <p className="mt-0.5 text-slate-800">
                        {note?.author_name ? (
                          <span className="font-medium">
                            {note.author_name}:{" "}
                          </span>
                        ) : null}
                        <span>{note?.body ?? "(Note unavailable)"}</span>
                      </p>
                    </div>
                    <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-sky-500" />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {taskModalOpen && selectedTask ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/50 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-4 text-sm shadow-xl">
            <div className="mb-3 flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">
                  {((taskDetails ?? selectedTask) as any).name as string}
                </h3>
                <p className="text-xs text-slate-500">
                  Task details and comments.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCloseTaskModal}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-xs text-slate-500 hover:bg-slate-50"
              >
                ×
              </button>
            </div>

            {taskDetailsLoading ? (
              <p className="text-xs text-slate-500">Loading task details...</p>
            ) : (
              <div className="space-y-2 text-xs text-slate-700">
                {(() => {
                  const task = (taskDetails ?? selectedTask) as any;
                  const statusLabel = task?.status
                    ? (task.status === "completed"
                        ? "Completed"
                        : task.status === "in_progress"
                          ? "In progress"
                          : "Not started")
                    : null;
                  const priorityLabel = task?.priority ?? null;

                  const whenRaw =
                    (task?.activity_date as string | null) ??
                    (task?.created_at as string | null);
                  let whenLabel: string | null = null;
                  if (whenRaw) {
                    const d = new Date(whenRaw);
                    if (!Number.isNaN(d.getTime())) {
                      whenLabel = d.toLocaleString();
                    }
                  }

                  const patient = task?.patient as
                    | {
                        first_name: string | null;
                        last_name: string | null;
                        email: string | null;
                        phone: string | null;
                      }
                    | null
                    | undefined;
                  const patientName = patient
                    ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`
                        .trim()
                        .replace(/\s+/g, " ")
                    : null;

                  return (
                    <>
                      {task?.content ? (
                        <p className="text-slate-800">{task.content as string}</p>
                      ) : null}
                      <div className="flex flex-wrap gap-2 text-[11px] text-slate-500">
                        {statusLabel ? (
                          <span>
                            Status: <span className="font-medium">{statusLabel}</span>
                          </span>
                        ) : null}
                        {priorityLabel ? (
                          <span>
                            Priority:{" "}
                            <span className="font-medium capitalize">
                              {priorityLabel as string}
                            </span>
                          </span>
                        ) : null}
                        {whenLabel ? (
                          <span>
                            When: <span className="font-medium">{whenLabel}</span>
                          </span>
                        ) : null}
                      </div>
                      {patientName || patient?.email || patient?.phone ? (
                        <p className="text-[11px] text-slate-500">
                          Patient:{" "}
                          <span className="font-medium">
                            {patientName || "Unknown patient"}
                          </span>
                          {patient?.email || patient?.phone ? (
                            <span className="text-slate-400">
                              {" "}• {patient.email || patient.phone}
                            </span>
                          ) : null}
                        </p>
                      ) : null}
                      {task?.patient_id ? (
                        <div className="mt-3 flex gap-2">
                          <Link
                            href={`/patients/${task.patient_id}?tab=tasks`}
                            className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit Task
                          </Link>
                        </div>
                      ) : null}
                    </>
                  );
                })()}
              </div>
            )}

            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="mb-1 text-[11px] font-semibold text-slate-600">
                Comments
              </p>
              {taskCommentsLoading ? (
                <p className="text-[11px] text-slate-500">Loading comments...</p>
              ) : taskComments.length === 0 ? (
                <p className="text-[11px] text-slate-400">No comments yet.</p>
              ) : (
                <div className="mb-2 max-h-48 space-y-1.5 overflow-y-auto">
                  {taskComments.map((comment) => {
                    const cDate = comment.created_at
                      ? new Date(comment.created_at as string)
                      : null;
                    const cLabel =
                      cDate && !Number.isNaN(cDate.getTime())
                        ? cDate.toLocaleDateString()
                        : null;

                    return (
                      <div
                        key={comment.id as string}
                        className="rounded-md bg-slate-50 px-2 py-1 text-[11px] text-slate-800"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">
                              {(comment.author_name as string) || "Unknown"}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap">
                              {renderTextWithMentions(comment.body as string)}
                            </p>
                          </div>
                          {cLabel ? (
                            <p className="shrink-0 text-[10px] text-slate-400">
                              {cLabel}
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleTaskCommentSubmitDashboard();
                }}
              >
                <div className="relative flex items-center gap-1">
                  <input
                    type="text"
                    value={taskCommentInput}
                    onChange={(event) =>
                      handleTaskCommentInputChangeDashboard(event.target.value)
                    }
                    placeholder="Add a comment... Use @ to mention."
                    className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    disabled={taskCommentSaving}
                  />
                  <button
                    type="submit"
                    disabled={taskCommentSaving}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-200/80 bg-sky-600 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {taskCommentSaving ? "…" : ">"}
                  </button>
                </div>
                {taskCommentError ? (
                  <p className="mt-0.5 text-[10px] text-red-600">
                    {taskCommentError}
                  </p>
                ) : null}

                {mentionOptions.length > 0 ? (
                  <div className="mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow">
                    {mentionOptions.map((user) => {
                      const display =
                        user.full_name || user.email || "Unnamed user";
                      return (
                        <button
                          key={user.id}
                          type="button"
                          onClick={() => handleTaskMentionSelectDashboard(user)}
                          className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                        >
                          {display}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </form>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
