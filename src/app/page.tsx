"use client";

import { useEffect, useState, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCommentsUnread } from "@/components/CommentsUnreadContext";
import { SkeletonCard, SkeletonLine } from "@/components/SkeletonLoader";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

// Strip HTML tags and decode entities from rich-text content (comments/notes)
function stripHtmlTags(html: string): string {
  if (!html) return "";
  const withoutTags = html.replace(/<[^>]*>/g, "");
  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value;
}

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
  const router = useRouter();
  const [appointments, setAppointments] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [mentions, setMentions] = useState<any[]>([]);
  const [mentionsPage, setMentionsPage] = useState(1);
  const MENTIONS_PER_PAGE = 3;
  const [loading, setLoading] = useState(true);
  const [userFirstName, setUserFirstName] = useState<string | null>(null);

  // Task productivity stats
  const [weekTasks, setWeekTasks] = useState<any[]>([]);

  const { unreadCount } = useCommentsUnread();

  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [currentTime, setCurrentTime] = useState<Date | null>(null);
  const [weather, setWeather] = useState<{ temp: number; code: number; city?: string } | null>(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
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

        const noteMentionsPromise = user
          ? supabaseClient
              .from("patient_note_mentions")
              .select(
                "id, created_at, read_at, patient_id, note:patient_notes(id, body, author_name, created_at), patient:patients(id, first_name, last_name)",
              )
              .eq("mentioned_user_id", user.id)
              .is("read_at", null)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null } as any);

        const taskMentionsPromise = user
          ? supabaseClient
              .from("task_comment_mentions")
              .select(
                "id, created_at, read_at, task_id, comment:task_comments(id, body, author_name, created_at), task:tasks(id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_id, assigned_user_name, patient_id, patient:patients(id, first_name, last_name))",
              )
              .eq("mentioned_user_id", user.id)
              .is("read_at", null)
              .order("created_at", { ascending: false })
          : Promise.resolve({ data: [], error: null } as any);

        // Fetch task stats for the past 7 days (productivity chart)
        const weekStart = new Date();
        weekStart.setDate(weekStart.getDate() - 6);
        weekStart.setHours(0, 0, 0, 0);
        const weekTasksPromise = user
          ? supabaseClient
              .from("tasks")
              .select("id, status, activity_date, created_at")
              .eq("assigned_user_id", user.id)
              .gte("created_at", weekStart.toISOString())
          : Promise.resolve({ data: [], error: null } as any);

        const [appointmentsResult, tasksResult, noteMentionsResult, taskMentionsResult, weekTasksResult] =
          await Promise.all([
            appointmentsPromise,
            tasksPromise,
            noteMentionsPromise,
            taskMentionsPromise,
            weekTasksPromise,
          ]);

        if (cancelled) return;

        setAppointments(
          !appointmentsResult.error && appointmentsResult.data
            ? (appointmentsResult.data as any[])
            : [],
        );

        setTasks(
          !tasksResult.error && tasksResult.data ? (tasksResult.data as any[]) : [],
        );

        const noteRows = !noteMentionsResult.error && noteMentionsResult.data
          ? (noteMentionsResult.data as any[]).map((m) => ({ ...m, type: "note" as const }))
          : [];
        const taskRows = !taskMentionsResult.error && taskMentionsResult.data
          ? (taskMentionsResult.data as any[]).map((m) => ({
              ...m,
              type: "task" as const,
              patient: m.task?.patient || null,
            }))
          : [];

        setMentions(
          [...noteRows, ...taskRows].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        );
        setMentionsPage(1);

        setWeekTasks(
          !weekTasksResult.error && weekTasksResult.data
            ? (weekTasksResult.data as any[])
            : [],
        );
      } catch {
        if (cancelled) return;
        setAppointments([]);
        setTasks([]);
        setMentions([]);
        setWeekTasks([]);
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

        const [{ data: noteData, error: noteError }, { data: taskData, error: taskError }] = await Promise.all([
          supabaseClient
            .from("patient_note_mentions")
            .select(
              "id, created_at, read_at, patient_id, note:patient_notes(id, body, author_name, created_at), patient:patients(id, first_name, last_name)",
            )
            .eq("mentioned_user_id", user.id)
            .is("read_at", null)
            .order("created_at", { ascending: false }),
          supabaseClient
            .from("task_comment_mentions")
            .select(
              "id, created_at, read_at, task_id, comment:task_comments(id, body, author_name, created_at), task:tasks(id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_id, assigned_user_name, patient_id, patient:patients(id, first_name, last_name))",
            )
            .eq("mentioned_user_id", user.id)
            .is("read_at", null)
            .order("created_at", { ascending: false }),
        ]);

        if (cancelled) return;

        const noteRows = !noteError && noteData ? (noteData as any[]).map((m) => ({ ...m, type: "note" as const })) : [];
        const taskRows =
          !taskError && taskData
            ? (taskData as any[]).map((m) => ({
                ...m,
                type: "task" as const,
                patient: m.task?.patient || null,
              }))
            : [];

        setMentions(
          [...noteRows, ...taskRows].sort(
            (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
          ),
        );
        setMentionsPage(1);
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

  // Clock tick
  useEffect(() => {
    setCurrentTime(new Date());
    const interval = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Weather via Open-Meteo (free, no API key)
  useEffect(() => {
    let cancelled = false;

    async function fetchWeather(lat: number, lon: number, city?: string) {
      try {
        const res = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`
        );
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data?.current_weather) {
          setWeather({
            temp: Math.round(data.current_weather.temperature),
            code: data.current_weather.weathercode,
            city,
          });
        }
      } catch {
        // ignore weather errors
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    }

    setWeatherLoading(true);

    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
        () => fetchWeather(46.2044, 6.1432, "Geneva"), // fallback
        { timeout: 5000 }
      );
    } else {
      void fetchWeather(46.2044, 6.1432, "Geneva");
    }

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDashboardSearch(query: string) {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone")
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(8);
        setSearchResults((data || []) as any[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  function weatherIcon(code: number) {
    // WMO Weather interpretation codes (WW)
    if (code === 0) return "☀️";
    if ([1, 2, 3].includes(code)) return "🌤️";
    if ([45, 48].includes(code)) return "🌫️";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "🌧️";
    if ([71, 73, 75, 77, 85, 86].includes(code)) return "🌨️";
    if ([95, 96, 99].includes(code)) return "⛈️";
    return "🌡️";
  }

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

  // Productivity chart: tasks completed per day over last 7 days
  const chartData = useMemo(() => {
    const days: { label: string; completed: number; total: number }[] = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const ymd = d.toISOString().slice(0, 10);
      const dayLabel = d.toLocaleDateString(undefined, { weekday: "short" });
      const dayTasks = weekTasks.filter((t: any) => {
        const created = (t.created_at as string | null) ?? "";
        return created.startsWith(ymd);
      });
      const completed = dayTasks.filter((t: any) => t.status === "completed").length;
      days.push({ label: dayLabel, completed, total: dayTasks.length });
    }
    return days;
  }, [weekTasks]);

  const todayCompleted = chartData[chartData.length - 1]?.completed ?? 0;
  const overdueCount = tasks.length; // tasks state already filters for non-completed, overdue/today
  const weekCompleted = chartData.reduce((sum, d) => sum + d.completed, 0);
  const weekTotal = chartData.reduce((sum, d) => sum + d.total, 0);
  const completionRate = weekTotal > 0 ? Math.round((weekCompleted / weekTotal) * 100) : 0;
  const maxBarValue = Math.max(...chartData.map((d) => d.completed), 1);

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
          <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
            {currentTime ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 shadow-sm backdrop-blur">
                <svg className="h-3.5 w-3.5 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 6v6l4 2" />
                </svg>
                {currentTime.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
              </span>
            ) : null}
            {weatherLoading ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 shadow-sm backdrop-blur text-slate-400">
                <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                </svg>
                Loading weather…
              </span>
            ) : weather ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 shadow-sm backdrop-blur">
                <span className="text-base leading-none" title="Weather icon">{weatherIcon(weather.code)}</span>
                <span>{weather.temp}°C</span>
                {weather.city ? <span className="text-slate-400">· {weather.city}</span> : null}
              </span>
            ) : null}
          </div>
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

      {/* Productivity Stats Row */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-4">
        <div className="rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Completed Today</p>
          {loading ? <SkeletonLine width="40px" height="28px" className="mt-2" /> : (
            <p className="mt-1 text-2xl font-bold text-emerald-600">{todayCompleted}</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Open Tasks</p>
          {loading ? <SkeletonLine width="40px" height="28px" className="mt-2" /> : (
            <p className="mt-1 text-2xl font-bold text-amber-600">{overdueCount}</p>
          )}
        </div>
        <div className="rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Week Rate</p>
          {loading ? <SkeletonLine width="50px" height="28px" className="mt-2" /> : (
            <p className="mt-1 text-2xl font-bold text-sky-600">{completionRate}%</p>
          )}
        </div>
        {/* Mini bar chart */}
        <div className="rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-2">7-Day Activity</p>
          {loading ? <SkeletonLine width="100%" height="48px" /> : (
            <div className="flex items-end gap-1 h-12">
              {chartData.map((day, i) => (
                <div key={day.label} className="flex flex-1 flex-col items-center gap-0.5">
                  <div
                    className={`w-full rounded-sm transition-all ${i === chartData.length - 1 ? "bg-sky-500" : "bg-slate-300"}`}
                    style={{ height: `${Math.max((day.completed / maxBarValue) * 100, 8)}%` }}
                  />
                  <span className="text-[8px] text-slate-400">{day.label.slice(0, 2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Patient search */}
      <section className="relative">
        <div className="relative">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-300"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => void handleDashboardSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && searchQuery.trim()) {
                setSearchQuery("");
                setSearchResults([]);
                router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
              }
            }}
            placeholder="Search patients by name, email, or phone..."
            className="w-full rounded-2xl border border-slate-200/60 bg-white/95 py-3 pl-10 pr-12 text-sm text-slate-900 shadow-lg backdrop-blur-sm placeholder-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          {searching ? (
            <svg
              className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-slate-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M21 12a9 9 0 1 1-6.219-8.56" />
            </svg>
          ) : (
            <button
              type="button"
              onClick={() => {
                if (searchQuery.trim()) {
                  setSearchQuery("");
                  setSearchResults([]);
                  router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
                }
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-sky-500 p-2 text-white shadow-sm hover:bg-sky-600 transition-colors"
              aria-label="Search"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          )}
        </div>
        {searchQuery && (
          <div className="absolute z-30 mt-2 w-full rounded-2xl border border-slate-200/60 bg-white/95 p-2 shadow-xl backdrop-blur-sm">
            {searching ? (
              <div className="py-4 text-center text-xs text-slate-500">Searching…</div>
            ) : searchResults.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                {searchResults.map((p) => {
                  const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() || "Unknown patient";
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => {
                        setSearchQuery("");
                        setSearchResults([]);
                        router.push(`/patients/${p.id}`);
                      }}
                      className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left hover:bg-slate-50"
                    >
                      <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">
                        {name.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?"}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{name}</p>
                        {(p.email || p.phone) && (
                          <p className="truncate text-xs text-slate-500">{p.email || p.phone}</p>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="py-4 text-center text-xs text-slate-500">No patients found</div>
            )}
          </div>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
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
            <SkeletonCard rows={3} />
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

        <div className="lg:col-span-2 rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
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
            <SkeletonCard rows={4} />
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

        <div className="lg:col-span-1 rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
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
              Inbox
            </Link>
          </div>
          {loading ? (
            <SkeletonCard rows={3} />
          ) : mentions.length === 0 ? (
            <p className="text-xs text-slate-500">No new mentions.</p>
          ) : (
            <div className="space-y-2 text-sm">
              {mentions
                .slice((mentionsPage - 1) * MENTIONS_PER_PAGE, mentionsPage * MENTIONS_PER_PAGE)
                .map((mention) => {
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

                  if (mention.type === "task") {
                    const comment = mention.comment;
                    const task = mention.task;
                    return (
                      <Link
                        key={mention.id as string}
                        href="/comments"
                        className="flex items-start justify-between rounded-lg bg-slate-50/80 px-3 py-2 hover:bg-slate-100"
                      >
                        <div className="pr-4">
                          <p className="text-xs font-medium text-slate-500">
                            {createdLabel ?? ""} {createdLabel ? "· " : ""}
                            {patientName} · Task
                          </p>
                          <p className="mt-0.5 text-slate-800">
                            {comment?.author_name ? (
                              <span className="font-medium">{comment.author_name}: </span>
                            ) : null}
                            <span>
                              {task?.name ? <span className="font-medium">[{task.name}] </span> : null}
                              {stripHtmlTags(comment?.body ?? "(Comment unavailable)")}
                            </span>
                          </p>
                        </div>
                        <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-sky-500" />
                      </Link>
                    );
                  }

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
                          <span>{stripHtmlTags(note?.body ?? "(Note unavailable)")}</span>
                        </p>
                      </div>
                      <span className="mt-1 inline-flex h-2 w-2 rounded-full bg-sky-500" />
                    </Link>
                  );
                })}
              {mentions.length > MENTIONS_PER_PAGE && (
                <div className="flex items-center justify-between pt-2">
                  <button
                    type="button"
                    disabled={mentionsPage === 1}
                    onClick={() => setMentionsPage((p) => Math.max(1, p - 1))}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:text-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
                  >
                    Previous
                  </button>
                  <span className="text-xs text-slate-500">
                    Page {mentionsPage} of {Math.ceil(mentions.length / MENTIONS_PER_PAGE)}
                  </span>
                  <button
                    type="button"
                    disabled={mentionsPage >= Math.ceil(mentions.length / MENTIONS_PER_PAGE)}
                    onClick={() => setMentionsPage((p) => p + 1)}
                    className="rounded-lg px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 disabled:text-slate-300 dark:text-slate-400 dark:hover:bg-slate-800 dark:disabled:text-slate-600"
                  >
                    Next
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Shortcuts */}
        <div className="lg:col-span-3 rounded-2xl border border-slate-200/60 bg-white/95 p-5 shadow-lg backdrop-blur-sm">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Shortcuts</h2>
              <p className="text-xs text-slate-500">
                Jump to your most used tools.
              </p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            <Link
              href="/workflows"
              className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300/70 hover:shadow-md hover:shadow-sky-500/10 dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-900"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-100 text-indigo-600 shadow-sm transition-colors group-hover:bg-indigo-600 group-hover:text-white dark:bg-indigo-500/20 dark:text-indigo-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5z" />
                  <path d="M2 17l10 5 10-5" />
                  <path d="M2 12l10 5 10-5" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-sky-700 dark:text-white">Workflows</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Automations</p>
            </Link>
            <Link
              href="/invoices"
              className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-emerald-300/70 hover:shadow-md hover:shadow-emerald-500/10 dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-900"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 shadow-sm transition-colors group-hover:bg-emerald-600 group-hover:text-white dark:bg-emerald-500/20 dark:text-emerald-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <path d="M14 2v6h6" />
                  <path d="M16 13H8M16 17H8M10 9H8" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-emerald-700 dark:text-white">Invoices</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Billing</p>
            </Link>
            <Link
              href="/email-reports"
              className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-amber-300/70 hover:shadow-md hover:shadow-amber-500/10 dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-900"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-amber-100 text-amber-600 shadow-sm transition-colors group-hover:bg-amber-600 group-hover:text-white dark:bg-amber-500/20 dark:text-amber-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                  <polyline points="22,6 12,13 2,6" />
                  <path d="M2 20l7-7" />
                  <path d="M22 20l-7-7" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-amber-700 dark:text-white">Email Reports</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Communications</p>
            </Link>
            <Link
              href="/agents"
              className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-violet-300/70 hover:shadow-md hover:shadow-violet-500/10 dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-900"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-600 shadow-sm transition-colors group-hover:bg-violet-600 group-hover:text-white dark:bg-violet-500/20 dark:text-violet-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 8V4H8" />
                  <path d="M2 2h20v20H2z" />
                  <path d="M6 12h4m4 0h4" />
                  <path d="M9 17a3 3 0 0 0 6 0" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-violet-700 dark:text-white">AI Agents</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Assistants</p>
            </Link>
            <Link
              href="/chatlogs"
              className="group relative overflow-hidden rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-sky-300/70 hover:shadow-md hover:shadow-sky-500/10 dark:border-slate-700/60 dark:from-slate-800 dark:to-slate-900"
            >
              <span className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-sky-100 text-sky-600 shadow-sm transition-colors group-hover:bg-sky-600 group-hover:text-white dark:bg-sky-500/20 dark:text-sky-300">
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 6h16v9H8l-4 3z" />
                  <path d="M8 10h8" />
                  <path d="M8 13h5" />
                </svg>
              </span>
              <p className="text-sm font-semibold text-slate-800 transition-colors group-hover:text-sky-700 dark:text-white">Chat Logs</p>
              <p className="mt-0.5 text-[10px] text-slate-500 dark:text-slate-400">Conversations</p>
            </Link>
          </div>
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
              <div className="space-y-2"><SkeletonLine width="80%" height="12px" /><SkeletonLine width="60%" height="10px" /><SkeletonLine width="40%" height="10px" /></div>
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
                <div className="space-y-1.5"><SkeletonLine width="100%" height="24px" /><SkeletonLine width="80%" height="24px" /></div>
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
