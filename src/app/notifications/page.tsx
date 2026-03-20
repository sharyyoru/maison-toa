"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTasksNotifications } from "@/components/TasksNotificationsContext";
import TaskEditModal from "@/components/TaskEditModal";

type NotificationPatient = {
  id: string;
  first_name: string;
  last_name: string;
};

type NotificationTask = {
  id: string;
  patient_id: string;
  name: string;
  content: string | null;
  status: "not_started" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  type: "todo" | "call" | "email" | "other";
  activity_date: string | null;
  created_at: string;
  assigned_read_at: string | null;
  created_by_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
};

type TaskNotificationRow = {
  id: string;
  task: NotificationTask | null;
  patient: NotificationPatient | null;
};

export default function NotificationsPage() {
  const router = useRouter();
  const [rows, setRows] = useState<TaskNotificationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [updatingTaskIds, setUpdatingTaskIds] = useState<string[]>([]);
  const [markingAllRead, setMarkingAllRead] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<NotificationTask | null>(null);
  const [selectedPatient, setSelectedPatient] = useState<NotificationPatient | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const { refreshOpenTasksCount, setOpenTasksCountOptimistic } =
    useTasksNotifications();

  useEffect(() => {
    let isMounted = true;

    async function loadNotifications() {
      try {
        setLoading(true);
        setError(null);

        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user;

        if (!user) {
          if (!isMounted) return;
          setError("You must be logged in to view notifications.");
          setRows([]);
          setLoading(false);
          return;
        }

        const { data, error } = await supabaseClient
          .from("tasks")
          .select(
            "id, patient_id, name, content, status, priority, type, activity_date, assigned_read_at, created_at, created_by_name, assigned_user_id, assigned_user_name, patient:patients(id, first_name, last_name)",
          )
          .eq("assigned_user_id", user.id)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error || !data) {
          setError(error?.message ?? "Failed to load notifications.");
          setRows([]);
          setLoading(false);
          return;
        }

        const mapped: TaskNotificationRow[] = (data as any[]).map((row) => ({
          id: row.id as string,
          task: {
            id: row.id as string,
            patient_id: row.patient_id as string,
            name: (row.name as string) ?? "Untitled task",
            content: (row.content as string | null) ?? null,
            status: row.status as NotificationTask["status"],
            priority: row.priority as NotificationTask["priority"],
            type: row.type as NotificationTask["type"],
            activity_date: (row.activity_date as string | null) ?? null,
            created_at: row.created_at as string,
            assigned_read_at: (row.assigned_read_at as string | null) ?? null,
            created_by_name: (row.created_by_name as string | null) ?? null,
            assigned_user_id: (row.assigned_user_id as string | null) ?? null,
            assigned_user_name: (row.assigned_user_name as string | null) ?? null,
          },
          patient: row.patient
            ? {
                id: row.patient.id as string,
                first_name: (row.patient.first_name as string) ?? "",
                last_name: (row.patient.last_name as string) ?? "",
              }
            : null,
        }));

        setRows(mapped);
        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError("Failed to load notifications.");
        setRows([]);
        setLoading(false);
      }
    }

    void loadNotifications();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  async function handleMarkNotificationRead(row: TaskNotificationRow) {
    const task = row.task;
    if (!task || task.assigned_read_at) return;

    const nowIso = new Date().toISOString();

    setRows((prev) =>
      prev.map((r) =>
        r.id === row.id && r.task && !r.task.assigned_read_at
          ? {
              ...r,
              task: {
                ...r.task,
                assigned_read_at: nowIso,
              },
            }
          : r,
      ),
    );

    setOpenTasksCountOptimistic((prev) => prev - 1);

    try {
      await supabaseClient
        .from("tasks")
        .update({ assigned_read_at: nowIso })
        .eq("id", task.id);
    } catch {
    }
  }

  async function handleMarkAllRead() {
    const unreadTaskIds = rows
      .filter((row) => row.task && !row.task.assigned_read_at)
      .map((row) => row.task!.id);

    if (unreadTaskIds.length === 0) return;

    try {
      setMarkingAllRead(true);
      const nowIso = new Date().toISOString();

      const { error } = await supabaseClient
        .from("tasks")
        .update({ assigned_read_at: nowIso })
        .in("id", unreadTaskIds);

      if (error) {
        setMarkingAllRead(false);
        return;
      }

      setRows((prev) =>
        prev.map((row) =>
          row.task &&
          !row.task.assigned_read_at &&
          unreadTaskIds.includes(row.task.id)
            ? { ...row, task: { ...row.task, assigned_read_at: nowIso } }
            : row,
        ),
      );

      setOpenTasksCountOptimistic((prev) => prev - unreadTaskIds.length);
    } catch {
    } finally {
      setMarkingAllRead(false);
    }
  }

  async function handleMarkTaskCompleted(row: TaskNotificationRow) {
    const task = row.task;
    if (!task || task.status === "completed") return;

    try {
      setUpdatingTaskIds((prev) => [...prev, task.id]);

      const nowIso = new Date().toISOString();

      const { data, error } = await supabaseClient
        .from("tasks")
        .update({
          status: "completed",
          updated_at: nowIso,
          assigned_read_at: task.assigned_read_at ?? nowIso,
        })
        .eq("id", task.id)
        .select(
          "id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_read_at, assigned_user_id, assigned_user_name",
        )
        .single();

      if (error || !data) {
        setUpdatingTaskIds((prev) => prev.filter((id) => id !== task.id));
        return;
      }

      const updated = data as any;

      setRows((prev) =>
        prev.map((r) =>
          r.id === row.id
            ? {
                ...r,
                task: {
                  id: updated.id as string,
                  patient_id: updated.patient_id as string,
                  name: (updated.name as string) ?? "Untitled task",
                  content: (updated.content as string | null) ?? null,
                  status: updated.status as NotificationTask["status"],
                  priority: updated.priority as NotificationTask["priority"],
                  type: updated.type as NotificationTask["type"],
                  activity_date: (updated.activity_date as string | null) ?? null,
                  created_at: updated.created_at as string,
                  assigned_read_at:
                    (updated.assigned_read_at as string | null) ??
                    task.assigned_read_at ??
                    nowIso,
                  created_by_name:
                    (updated.created_by_name as string | null) ?? null,
                  assigned_user_id: task.assigned_user_id,
                  assigned_user_name: task.assigned_user_name,
                },
              }
            : r,
        ),
      );

      if (!task.assigned_read_at) {
        setOpenTasksCountOptimistic((prev) => prev - 1);
      }
    } catch {
    } finally {
      setUpdatingTaskIds((prev) => prev.filter((id) => id !== task.id));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Notifications</h1>
          <p className="text-xs text-slate-500">
            Tasks assigned to you across all patients.
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
            onClick={() => {
              setRefreshKey((prev) => prev + 1);
              refreshOpenTasksCount().catch(() => {});
            }}
            disabled={loading}
            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {rows.some((row) => row.task && !row.task.assigned_read_at) ? (
            <button
              type="button"
              onClick={() => void handleMarkAllRead()}
              disabled={markingAllRead}
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingAllRead ? "Marking..." : "Mark all as read"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        {loading ? (
          <p className="text-xs text-slate-500">Loading notifications...</p>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-xs text-slate-500">No task notifications yet.</p>
        ) : (
          <div className="space-y-4 text-xs">
            {(() => {
              const filteredRows = rows.filter((row) => {
                const task = row.task;
                if (!task) return false;
                const isRead = !!task.assigned_read_at;
                if (filter === "unread") return !isRead;
                if (filter === "read") return isRead;
                return true;
              });

              const openRows = filteredRows.filter(
                (row) => row.task && row.task.status !== "completed",
              );
              const completedRows = filteredRows.filter(
                (row) => row.task && row.task.status === "completed",
              );

              // Calculate pagination
              const allRows = [...openRows, ...completedRows];
              const totalPages = Math.ceil(allRows.length / itemsPerPage);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedRows = allRows.slice(startIndex, endIndex);

              // Separate paginated rows
              const paginatedOpen = paginatedRows.filter(
                (row) => row.task && row.task.status !== "completed",
              );
              const paginatedCompleted = paginatedRows.filter(
                (row) => row.task && row.task.status === "completed",
              );

              const renderRow = (row: TaskNotificationRow) => {
                const task = row.task;
                if (!task) return null;

                const createdDate = task.activity_date
                  ? new Date(task.activity_date)
                  : task.created_at
                    ? new Date(task.created_at)
                    : null;
                const createdLabel =
                  createdDate && !Number.isNaN(createdDate.getTime())
                    ? createdDate.toLocaleString()
                    : null;

                const patient = row.patient;
                const patientName = patient
                  ? `${patient.first_name} ${patient.last_name}`
                  : "Unknown patient";
                const patientId = patient?.id;

                const isCompleted = task.status === "completed";
                const isRead = !!task.assigned_read_at;
                const isUpdating = updatingTaskIds.includes(task.id);

                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() => {
                      void handleMarkNotificationRead(row);
                      setSelectedTask(task);
                      setSelectedPatient(patient);
                      setEditModalOpen(true);
                    }}
                    className="w-full text-left flex items-start justify-between rounded-lg bg-slate-50/80 px-3 py-2 hover:bg-slate-100 transition-colors"
                  >
                    <div className="pr-4">
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                        {createdLabel ? <span>{createdLabel}</span> : null}
                        <span>
                          Task for:{" "}
                          {patientId ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                router.push(`/patients/${patientId}?m_tab=crm&crm_sub=tasks`);
                              }}
                              className="font-medium text-sky-700 hover:text-sky-800 hover:underline"
                            >
                              {patientName}
                            </button>
                          ) : (
                            <span className="font-medium text-sky-700">
                              {patientName}
                            </span>
                          )}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-slate-800">
                        <span className="font-semibold">{task.name}</span>
                        {task.content ? (
                          <span className="text-slate-600"> — {task.content}</span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 text-[10px] text-slate-500">
                        Status:{" "}
                        <span className="font-medium capitalize">
                          {task.status === "in_progress"
                            ? "In progress"
                            : task.status.replace("_", " ")}
                        </span>
                        {" "}• Priority:{" "}
                        <span className="font-medium capitalize">
                          {task.priority}
                        </span>
                        {" "}• Type:{" "}
                        <span className="font-medium capitalize">{task.type}</span>
                      </p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                        {task.created_by_name ? (
                          <span>
                            Created by{" "}
                            <span className="font-medium">
                              {task.created_by_name}
                            </span>
                          </span>
                        ) : null}
                        <span
                          className={
                            "inline-flex items-center rounded-full border px-1.5 py-0.5 text-[9px] font-medium " +
                            (isRead
                              ? "border-slate-200 bg-slate-50 text-slate-600"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700")
                          }
                        >
                          {isRead ? "Read" : "Unread"}
                        </span>
                      </div>
                    </div>
                    {!isCompleted ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleMarkTaskCompleted(row);
                        }}
                        className="mt-1 inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm hover:bg-slate-300 cursor-pointer"
                      >
                        {isUpdating ? "Updating..." : "Set complete"}
                      </span>
                    ) : (
                      <span className="mt-1 inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700">
                        Completed
                      </span>
                    )}
                  </button>
                );
              };

              return (
                <>
                  {paginatedOpen.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-slate-600">
                        Open tasks
                      </p>
                      {paginatedOpen.map((row) => renderRow(row))}
                    </div>
                  )}
                  {paginatedCompleted.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-slate-600">
                        Completed
                      </p>
                      {paginatedCompleted.map((row) => renderRow(row))}
                    </div>
                  )}
                  {allRows.length === 0 && (
                    <p className="text-xs text-slate-500">No notifications in this category.</p>
                  )}
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
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
                        disabled={currentPage === totalPages}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Next
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        )}
      </div>

      {/* Task Edit Modal */}
      <TaskEditModal
        open={editModalOpen}
        onClose={() => {
          setEditModalOpen(false);
          setSelectedTask(null);
          setSelectedPatient(null);
        }}
        task={selectedTask ? {
          ...selectedTask,
          patient: selectedPatient ? {
            id: selectedPatient.id,
            first_name: selectedPatient.first_name,
            last_name: selectedPatient.last_name,
            email: null,
            phone: null,
          } : null,
        } : null}
        onTaskUpdated={(updatedTask) => {
          setRows((prev) =>
            prev.map((r) =>
              r.task && r.task.id === updatedTask.id
                ? {
                    ...r,
                    task: {
                      ...r.task,
                      name: updatedTask.name,
                      content: updatedTask.content,
                      status: updatedTask.status,
                      priority: updatedTask.priority,
                      type: updatedTask.type,
                      activity_date: updatedTask.activity_date,
                      assigned_user_id: updatedTask.assigned_user_id,
                      assigned_user_name: updatedTask.assigned_user_name,
                    },
                  }
                : r
            )
          );
        }}
      />
    </div>
  );
}
