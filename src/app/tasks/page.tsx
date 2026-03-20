"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import TaskEditModal from "@/components/TaskEditModal";
import TaskCreateModal from "@/components/TaskCreateModal";
import { useTasksNotifications } from "@/components/TasksNotificationsContext";

type TaskStatus = "not_started" | "in_progress" | "completed";

type TaskPriority = "low" | "medium" | "high";

type TaskType = "todo" | "call" | "email" | "other";

type TaskPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type TaskRow = {
  id: string;
  patient_id: string;
  name: string;
  content: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  activity_date: string | null;
  created_at: string;
  created_by_name: string | null;
  assigned_user_name: string | null;
  assigned_user_id: string | null;
  patient: TaskPatient | null;
};

type PlatformUser = {
  id: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
};

type DateFilter = "today" | "all" | "past" | "future";

type PriorityFilter = "all" | "high" | "medium" | "low";

type StatusFilter = "open" | "completed";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { refreshOpenTasksCount } = useTasksNotifications();

  // Mark all unread tasks as read for the current user
  const markTasksAsRead = useCallback(async (userId: string) => {
    try {
      await supabaseClient
        .from("tasks")
        .update({ assigned_read_at: new Date().toISOString() })
        .eq("assigned_user_id", userId)
        .is("assigned_read_at", null);
      
      // Refresh the count after marking as read
      await refreshOpenTasksCount();
    } catch (err) {
      console.error("Failed to mark tasks as read:", err);
    }
  }, [refreshOpenTasksCount]);

  const [patientSearch, setPatientSearch] = useState("");
  const [patientFilterId, setPatientFilterId] = useState<string | null>(null);
  const [showPatientSuggestions, setShowPatientSuggestions] = useState(false);

  const [dateFilter, setDateFilter] = useState<DateFilter>("today");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("open");
  const [searchQuery, setSearchQuery] = useState("");

  const [updatingTaskIds, setUpdatingTaskIds] = useState<string[]>([]);

  // Task edit modal
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTask, setSelectedTask] = useState<TaskRow | null>(null);

  // Task create modal
  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);

  // Admin user selector
  const [allUsers, setAllUsers] = useState<PlatformUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [userSearchQuery, setUserSearchQuery] = useState("");
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [usersLoading, setUsersLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadTasks() {
      try {
        setLoading(true);
        setError(null);

        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user;
        if (!user) {
          if (!isMounted) return;
          setError("You must be logged in to view tasks.");
          setTasks([]);
          setLoading(false);
          return;
        }

        // Store current user ID
        if (!currentUserId) {
          setCurrentUserId(user.id);
        }

        // Use selectedUserId if set (admin viewing another user), otherwise use current user
        const targetUserId = selectedUserId ?? user.id;

        const { data, error } = await supabaseClient
          .from("tasks")
          .select(
            "id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_name, assigned_user_id, patient:patients(id, first_name, last_name, email, phone)",
          )
          .eq("assigned_user_id", targetUserId)
          .order("activity_date", { ascending: false });

        if (!isMounted) return;

        if (error || !data) {
          setError(error?.message ?? "Failed to load tasks.");
          setTasks([]);
          setLoading(false);
          return;
        }

        setTasks(data as unknown as TaskRow[]);
        setLoading(false);

        // Mark tasks as read when viewing own tasks (not when admin views another user's tasks)
        if (!selectedUserId || selectedUserId === user.id) {
          void markTasksAsRead(user.id);
        }
      } catch {
        if (!isMounted) return;
        setError("Failed to load tasks.");
        setTasks([]);
        setLoading(false);
      }
    }

    void loadTasks();

    return () => {
      isMounted = false;
    };
  }, [selectedUserId]);

  // Load all users for admin selector
  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        setUsersLoading(true);
        const response = await fetch("/api/users/list");
        if (!response.ok) {
          if (!isMounted) return;
          setAllUsers([]);
          setUsersLoading(false);
          return;
        }
        const json = await response.json();
        const data = (json.users ?? json) as PlatformUser[];
        if (!isMounted) return;
        setAllUsers(Array.isArray(data) ? data : []);
        setUsersLoading(false);
      } catch {
        if (!isMounted) return;
        setAllUsers([]);
        setUsersLoading(false);
      }
    }

    void loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  // Helper to get display name for a user
  function getUserDisplayName(u: PlatformUser): string {
    if (u.fullName) return u.fullName;
    const parts = [u.firstName, u.lastName].filter(Boolean);
    if (parts.length > 0) return parts.join(" ");
    return u.email || "Unnamed";
  }

  // Filter users based on search query
  const filteredUsers = useMemo(() => {
    const safeUsers = Array.isArray(allUsers) ? allUsers : [];
    const term = userSearchQuery.trim().toLowerCase();
    if (!term) return safeUsers;
    return safeUsers.filter((u) => {
      const name = getUserDisplayName(u).toLowerCase();
      const email = (u.email ?? "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [allUsers, userSearchQuery]);

  // Get selected user display name
  const selectedUserDisplay = useMemo(() => {
    if (!selectedUserId) return "My Tasks";
    const safeUsers = Array.isArray(allUsers) ? allUsers : [];
    const user = safeUsers.find((u) => u.id === selectedUserId);
    if (!user) return "My Tasks";
    return getUserDisplayName(user);
  }, [selectedUserId, allUsers]);

  const patientOptions = useMemo(() => {
    const map = new Map<string, TaskPatient>();
    tasks.forEach((row) => {
      const p = row.patient;
      if (p && !map.has(p.id)) {
        map.set(p.id, p);
      }
    });
    return Array.from(map.values());
  }, [tasks]);

  const filteredPatientSuggestions = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (!term) return patientOptions;

    return patientOptions.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`
        .trim()
        .toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const phone = (p.phone ?? "").toLowerCase();
      return (
        name.includes(term) || email.includes(term) || phone.includes(term)
      );
    });
  }, [patientSearch, patientOptions]);

  const filteredTasks = useMemo(() => {
    const term = searchQuery.trim().toLowerCase();
    const today = new Date();
    const todayYmd = today.toISOString().slice(0, 10);

    return tasks.filter((task) => {
      if (statusFilter === "open" && task.status === "completed") return false;
      if (statusFilter === "completed" && task.status !== "completed")
        return false;

      if (patientFilterId && task.patient?.id !== patientFilterId) return false;

      if (priorityFilter !== "all" && task.priority !== priorityFilter)
        return false;

      const rawDate = task.activity_date ?? task.created_at;
      let ymd: string | null = null;
      if (rawDate) {
        const d = new Date(rawDate);
        if (!Number.isNaN(d.getTime())) {
          ymd = d.toISOString().slice(0, 10);
        }
      }

      if (dateFilter === "today") {
        if (!ymd || ymd !== todayYmd) return false;
      } else if (dateFilter === "past" && ymd) {
        if (ymd >= todayYmd) return false;
      } else if (dateFilter === "future" && ymd) {
        if (ymd <= todayYmd) return false;
      }

      if (!term) return true;

      const p = task.patient;
      const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`
        .trim()
        .toLowerCase();
      const email = (p?.email ?? "").toLowerCase();
      const phone = (p?.phone ?? "").toLowerCase();
      const tName = task.name.toLowerCase();
      const tContent = (task.content ?? "").toLowerCase();

      return (
        name.includes(term) ||
        email.includes(term) ||
        phone.includes(term) ||
        tName.includes(term) ||
        tContent.includes(term)
      );
    });
  }, [tasks, statusFilter, patientFilterId, priorityFilter, dateFilter, searchQuery]);

  async function handleMarkTaskCompleted(task: TaskRow) {
    if (task.status === "completed") return;

    try {
      setUpdatingTaskIds((prev) => [...prev, task.id]);

      const nowIso = new Date().toISOString();

      const { data, error } = await supabaseClient
        .from("tasks")
        .update({ status: "completed" satisfies TaskStatus, updated_at: nowIso })
        .eq("id", task.id)
        .select(
          "id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_name, patient:patients(id, first_name, last_name, email, phone)",
        )
        .single();

      if (error || !data) {
        setUpdatingTaskIds((prev) => prev.filter((id) => id !== task.id));
        return;
      }

      const updated = data as unknown as TaskRow;
      setTasks((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
      setUpdatingTaskIds((prev) => prev.filter((id) => id !== task.id));
    } catch {
      setUpdatingTaskIds((prev) => prev.filter((id) => id !== task.id));
    }
  }

  function formatDateLabel(raw: string | null): string {
    if (!raw) return "—";
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Tasks</h1>
          <p className="text-xs text-slate-500">
            {selectedUserId && selectedUserId !== currentUserId
              ? `Viewing tasks for ${selectedUserDisplay}`
              : "Tasks assigned to you across all patients."}
          </p>
        </div>
        {/* Admin user selector */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowUserDropdown(!showUserDropdown)}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <svg className="h-3.5 w-3.5 text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
              <path d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
            </svg>
            <span>{selectedUserDisplay}</span>
            <svg className="h-3 w-3 text-slate-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
            </svg>
          </button>
          {showUserDropdown && (
            <div className="absolute right-0 z-30 mt-1 w-64 rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
              <div className="px-2 pb-1">
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={(e) => setUserSearchQuery(e.target.value)}
                  placeholder="Search users..."
                  className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedUserId(null);
                    setShowUserDropdown(false);
                    setUserSearchQuery("");
                  }}
                  className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-slate-50 ${
                    !selectedUserId ? "bg-sky-50 text-sky-700" : "text-slate-700"
                  }`}
                >
                  <span className="font-medium">My Tasks</span>
                </button>
                {usersLoading ? (
                  <p className="px-3 py-2 text-slate-500">Loading users...</p>
                ) : !Array.isArray(filteredUsers) || filteredUsers.length === 0 ? (
                  <p className="px-3 py-2 text-slate-500">No users found</p>
                ) : (
                  (Array.isArray(filteredUsers) ? filteredUsers : []).map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => {
                        setSelectedUserId(user.id);
                        setShowUserDropdown(false);
                        setUserSearchQuery("");
                      }}
                      className={`flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-slate-50 ${
                        selectedUserId === user.id ? "bg-sky-50 text-sky-700" : "text-slate-700"
                      }`}
                    >
                      <span className="font-medium">{getUserDisplayName(user)}</span>
                      <span className="text-[10px] text-slate-500">{user.email}</span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Top filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Patient search with autosuggest */}
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <input
            type="text"
            value={patientSearch}
            onChange={(event) => {
              setPatientSearch(event.target.value);
              setShowPatientSuggestions(true);
              setPatientFilterId(null);
            }}
            onFocus={() => setShowPatientSuggestions(true)}
            placeholder="Search patient"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          {showPatientSuggestions && filteredPatientSuggestions.length > 0 ? (
            <div className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
              <button
                type="button"
                className="flex w-full items-center px-3 py-1.5 text-left text-slate-600 hover:bg-slate-50"
                onClick={() => {
                  setPatientFilterId(null);
                  setPatientSearch("");
                  setShowPatientSuggestions(false);
                }}
              >
                All patients
              </button>
              {filteredPatientSuggestions.map((p) => {
                const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
                  "Unnamed patient";
                return (
                  <button
                    key={p.id}
                    type="button"
                    className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-slate-50"
                    onClick={() => {
                      setPatientFilterId(p.id);
                      setPatientSearch(name);
                      setShowPatientSuggestions(false);
                    }}
                  >
                    <span className="text-[11px] font-medium text-slate-800">
                      {name}
                    </span>
                    <span className="text-[10px] text-slate-500">
                      {p.email || p.phone || "No contact details"}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>

        {/* Date filter */}
        <div>
          <select
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value as DateFilter)}
            className="min-w-[120px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="today">Today</option>
            <option value="all">All</option>
            <option value="past">Past</option>
            <option value="future">Future</option>
          </select>
        </div>

        {/* Priority filter */}
        <div>
          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as PriorityFilter)
            }
            className="min-w-[120px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">Show All</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Main card */}
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-xs shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Type a name, email, mobile"
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCreateTaskModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
            >
              <span className="inline-flex h-3 w-3 items-center justify-center">
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M10 4v12" />
                  <path d="M4 10h12" />
                </svg>
              </span>
              <span>Create Task</span>
            </button>
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 p-0.5 text-[11px] text-slate-600">
              <button
                type="button"
                onClick={() => setStatusFilter("open")}
                className={
                  "rounded-full px-3 py-0.5 " +
                  (statusFilter === "open"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "hover:text-slate-900")
                }
              >
                Not Started
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("completed")}
                className={
                  "rounded-full px-3 py-0.5 " +
                  (statusFilter === "completed"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "hover:text-slate-900")
                }
              >
                Completed
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <p className="text-[11px] text-slate-500">Loading tasks...</p>
        ) : error ? (
          <p className="text-[11px] text-red-600">{error}</p>
        ) : filteredTasks.length === 0 ? (
          <p className="text-[11px] text-slate-500">No matching records found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Associated Contact</th>
                  <th className="py-2 pr-3 font-medium">Date</th>
                  <th className="py-2 pr-3 font-medium">Content</th>
                  <th className="py-2 pr-3 font-medium">Priority</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTasks.map((task) => {
                  const patient = task.patient;
                  const patientName = patient
                    ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() ||
                      "Unknown patient"
                    : "Unknown patient";
                  const dateLabel = formatDateLabel(task.activity_date ?? task.created_at);

                  const isUpdating = updatingTaskIds.includes(task.id);

                  return (
                    <tr
                      key={task.id}
                      className="hover:bg-slate-50/70"
                    >
                      <td className="py-2 pr-3 align-top text-slate-800">
                        {patient ? (
                          <Link
                            href={`/patients/${patient.id}?mode=crm&tab=tasks`}
                            className="text-sky-700 underline-offset-2 hover:underline"
                          >
                            {patientName}
                          </Link>
                        ) : (
                          patientName
                        )}
                        <div className="text-[10px] text-slate-500">
                          {patient?.email || patient?.phone || ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {dateLabel}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-800">
                        <div className="font-semibold">{task.name}</div>
                        {task.content ? (
                          <div className="mt-0.5 line-clamp-2 text-[10px] text-slate-600">
                            {task.content}
                          </div>
                        ) : null}
                        <div className="mt-0.5 text-[10px] text-slate-500">
                          Created by{" "}
                          <span className="font-medium">
                            {task.created_by_name || "Unknown"}
                          </span>
                          {" "}• Assigned to{" "}
                          <span className="font-medium">
                            {task.assigned_user_name || "Unassigned"}
                          </span>
                        </div>
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700 capitalize">
                        {task.priority}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700 capitalize">
                        {task.status.replace("_", " ")}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedTask(task);
                              setTaskModalOpen(true);
                            }}
                            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            View
                          </button>
                          {task.status !== "completed" ? (
                            <button
                              type="button"
                              onClick={() => void handleMarkTaskCompleted(task)}
                              disabled={isUpdating}
                              className="inline-flex items-center rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm hover:bg-slate-300 disabled:cursor-not-allowed disabled:opacity-70"
                            >
                              {isUpdating ? "Updating..." : "Set complete"}
                            </button>
                          ) : null}
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

      {/* Task Create Modal */}
      <TaskCreateModal
        open={createTaskModalOpen}
        onClose={() => setCreateTaskModalOpen(false)}
        onTaskCreated={(newTask) => {
          setTasks((prev) => [newTask, ...prev]);
        }}
      />

      {/* Task Edit Modal */}
      <TaskEditModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setSelectedTask(null);
        }}
        task={selectedTask ? {
          ...selectedTask,
          patient: selectedTask.patient ? {
            id: selectedTask.patient.id,
            first_name: selectedTask.patient.first_name,
            last_name: selectedTask.patient.last_name,
            email: selectedTask.patient.email,
            phone: selectedTask.patient.phone,
          } : null,
        } : null}
        onTaskUpdated={(updatedTask) => {
          setTasks((prev) =>
            prev.map((t) =>
              t.id === updatedTask.id
                ? { ...t, ...updatedTask }
                : t
            )
          );
        }}
      />
    </div>
  );
}
