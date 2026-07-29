"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Check, X, ChevronDown, AlertCircle, Users, Calendar } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";

type TaskPriority = "low" | "medium" | "high";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ExtractedTask = {
  title: string;
  description: string;
  priority: "High" | "Medium" | "Low";
  assignee: string;
  dueDate: string | null;
};

type EditableTask = {
  id: string;
  title: string;
  description: string;
  priority: TaskPriority;
  assignedUserId: string;
  assignedUserName: string;
  patientId: string;
  patientName: string;
  dueDate: string;
};

type PatientResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type TaskReviewListProps = {
  initialTasks: ExtractedTask[];
  onConfirm: () => void;
  onCancel: () => void;
};

export default function TaskReviewList({
  initialTasks,
  onConfirm,
  onCancel,
}: TaskReviewListProps) {
  const [tasks, setTasks] = useState<EditableTask[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  // Which task card currently has its patient search dropdown open. The search
  // state is shared, but scoped to one card at a time so multiple cards don't
  // all show the same dropdown/text simultaneously.
  const [activePatientTaskId, setActivePatientTaskId] = useState<string | null>(null);
  const [patientResults, setPatientResults] = useState<PatientResult[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Bulk "assign all tasks to one patient" search state (independent of the
  // per-card search above).
  const [bulkSearch, setBulkSearch] = useState("");
  const [bulkResults, setBulkResults] = useState<PatientResult[]>([]);
  const [showBulkDropdown, setShowBulkDropdown] = useState(false);
  const [isSearchingBulk, setIsSearchingBulk] = useState(false);
  const [bulkPatientName, setBulkPatientName] = useState("");
  const bulkTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize tasks from extracted data
  useEffect(() => {
    const editableTasks: EditableTask[] = initialTasks.map((task, index) => ({
      id: `temp-${index}`,
      title: task.title,
      description: task.description,
      priority: task.priority.toLowerCase() as TaskPriority,
      assignedUserId: "",
      assignedUserName: task.assignee,
      patientId: "",
      patientName: "",
      dueDate: task.dueDate ?? "",
    }));
    setTasks(editableTasks);
  }, [initialTasks]);

  // Load users
  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/users/list");
        if (response.ok) {
          const data = await response.json();
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch {
      } finally {
        setUsersLoaded(true);
      }
    }
    loadUsers();
  }, []);

  // Shared patient query used by both the per-card and bulk search boxes.
  async function queryPatients(searchTerm: string): Promise<PatientResult[]> {
    const trimmed = searchTerm.trim();
    if (!trimmed) return [];
    const searchPattern = `%${trimmed}%`;
    const { data, error } = await supabaseClient
      .from("patients")
      .select("id, first_name, last_name, email, phone")
      .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`)
      .order("last_name", { ascending: true })
      .limit(20);
    if (error || !data) return [];
    return data as PatientResult[];
  }

  function patientLabel(patient: PatientResult): string {
    return `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Unnamed patient";
  }

  // Per-card patient search with debouncing
  async function searchPatients(searchTerm: string) {
    if (!searchTerm.trim()) {
      setPatientResults([]);
      setIsSearchingPatients(false);
      return;
    }
    try {
      setIsSearchingPatients(true);
      setPatientResults(await queryPatients(searchTerm));
    } catch {
    } finally {
      setIsSearchingPatients(false);
    }
  }

  function handleBulkSearchChange(value: string) {
    setBulkSearch(value);
    setBulkPatientName("");
    setShowBulkDropdown(!!value.trim());
    if (bulkTimerRef.current) clearTimeout(bulkTimerRef.current);
    bulkTimerRef.current = setTimeout(async () => {
      if (!value.trim()) {
        setBulkResults([]);
        return;
      }
      setIsSearchingBulk(true);
      try {
        setBulkResults(await queryPatients(value));
      } finally {
        setIsSearchingBulk(false);
      }
    }, 150);
  }

  function handleBulkPatientSelect(patient: PatientResult) {
    const name = patientLabel(patient);
    setTasks((prev) =>
      prev.map((task) => ({ ...task, patientId: patient.id, patientName: name }))
    );
    setBulkPatientName(name);
    setBulkSearch("");
    setShowBulkDropdown(false);
    setBulkResults([]);
  }

  function clearBulkPatient() {
    setBulkPatientName("");
    setBulkSearch("");
    setTasks((prev) => prev.map((task) => ({ ...task, patientId: "", patientName: "" })));
  }

  function handlePatientSearchChange(value: string, taskId: string) {
    setActivePatientTaskId(taskId);
    setPatientSearch(value);
    // Typing clears any previously-selected patient for this card.
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, patientId: "", patientName: "" } : task
      )
    );

    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = setTimeout(() => {
      void searchPatients(value);
    }, 150);
  }

  function handlePatientSelect(patient: any, taskId: string) {
    const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Unnamed patient";
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, patientId: patient.id, patientName: name }
          : task
      )
    );
    setPatientSearch("");
    setActivePatientTaskId(null);
    setPatientResults([]);
  }

  function handleTaskChange(taskId: string, field: keyof EditableTask, value: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId ? { ...task, [field]: value } : task
      )
    );
  }

  function handleUserSelect(taskId: string, user: PlatformUser) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === taskId
          ? { ...task, assignedUserId: user.id, assignedUserName: user.full_name || user.email || "" }
          : task
      )
    );
  }

  function removeTask(taskId: string) {
    setTasks((prev) => prev.filter((task) => task.id !== taskId));
  }

  async function handleConfirm() {
    // Validate all tasks have a patient assigned
    const tasksWithoutPatient = tasks.filter((task) => !task.patientId);
    if (tasksWithoutPatient.length > 0) {
      setError("Please assign a patient to all tasks before creating.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setError("You must be logged in to create tasks.");
        setSaving(false);
        return;
      }

      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const createdByName = [first, last].filter(Boolean).join(" ") || authUser.email || null;

      // Create all tasks
      const createdTasks = await Promise.all(
        tasks.map(async (task) => {
          const { data, error } = await supabaseClient
            .from("tasks")
            .insert({
              patient_id: task.patientId,
              name: task.title.trim() || "Untitled task",
              type: "todo",
              priority: task.priority,
              content: task.description.trim() || null,
              status: "not_started",
              activity_date: task.dueDate ? task.dueDate : null,
              assigned_user_id: task.assignedUserId || authUser.id,
              assigned_user_name: task.assignedUserName || createdByName,
              created_by_name: createdByName,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .select("id")
            .single();

          if (error) throw error;
          return data;
        })
      );

      // Show success animation
      setSuccess(true);
      setTimeout(() => {
        onConfirm();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tasks");
    } finally {
      setSaving(false);
    }
  }

  const priorityColors = {
    high: "bg-red-100 text-red-700 border-red-200",
    medium: "bg-amber-100 text-amber-700 border-amber-200",
    low: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <div className="w-full max-w-3xl mx-auto">
      <AnimatePresence mode="wait">
        {!success ? (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="space-y-6"
          >
            <div className="text-center">
              <h2 className="text-2xl font-semibold text-slate-900 mb-2">Review Tasks</h2>
              <p className="text-sm text-slate-500">
                Edit the extracted tasks and assign them to patients and users
              </p>
            </div>

            {error && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2"
              >
                <AlertCircle className="w-4 h-4" />
                {error}
              </motion.div>
            )}

            {/* Bulk patient assignment */}
            {tasks.length > 1 && (
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="w-4 h-4 text-sky-600" />
                  <span className="text-sm font-medium text-slate-700">
                    Assign all {tasks.length} tasks to one patient
                  </span>
                </div>
                <div className="relative max-w-md">
                  <input
                    type="text"
                    value={bulkPatientName || bulkSearch}
                    onChange={(e) => handleBulkSearchChange(e.target.value)}
                    onFocus={() => setShowBulkDropdown(!!bulkSearch.trim())}
                    placeholder="Search a patient to apply to every task..."
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {bulkPatientName && (
                    <button
                      type="button"
                      onClick={clearBulkPatient}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                  {showBulkDropdown && !bulkPatientName && (isSearchingBulk || bulkResults.length > 0) && (
                    <div className="absolute z-20 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                      {isSearchingBulk ? (
                        <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
                      ) : bulkResults.length === 0 ? (
                        <div className="px-4 py-3 text-sm text-slate-500">No patients found</div>
                      ) : (
                        bulkResults.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            onClick={() => handleBulkPatientSelect(patient)}
                            className="w-full px-4 py-2 text-left text-sm hover:bg-sky-50 text-slate-700"
                          >
                            <div className="font-medium">{patientLabel(patient)}</div>
                            <div className="text-xs text-slate-500">
                              {patient.email || patient.phone || "No contact details"}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  )}
                </div>
                {bulkPatientName && (
                  <p className="mt-2 text-xs text-emerald-700">
                    All tasks assigned to <strong>{bulkPatientName}</strong>. You can still override individual tasks below.
                  </p>
                )}
              </div>
            )}

            <div className="space-y-4">
              {tasks.map((task, index) => (
                <motion.div
                  key={task.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div className="flex-1 space-y-3">
                      {/* Title */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Task Title
                        </label>
                        <input
                          type="text"
                          value={task.title}
                          onChange={(e) => handleTaskChange(task.id, "title", e.target.value)}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                      </div>

                      {/* Description */}
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">
                          Description
                        </label>
                        <textarea
                          value={task.description}
                          onChange={(e) => handleTaskChange(task.id, "description", e.target.value)}
                          rows={2}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 resize-none"
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => removeTask(task.id)}
                      className="shrink-0 p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Priority */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Priority
                      </label>
                      <select
                        value={task.priority}
                        onChange={(e) => handleTaskChange(task.id, "priority", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                      </select>
                    </div>

                    {/* Due Date */}
                    <div>
                      <label className="flex items-center gap-1 text-xs font-medium text-slate-500 mb-1">
                        <Calendar className="w-3 h-3" />
                        Due Date
                      </label>
                      <input
                        type="date"
                        value={task.dueDate}
                        onChange={(e) => handleTaskChange(task.id, "dueDate", e.target.value)}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                    </div>

                    {/* Patient Assignment */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Patient *
                      </label>
                      <div className="relative">
                        <input
                          type="text"
                          value={
                            task.patientId
                              ? task.patientName
                              : activePatientTaskId === task.id
                                ? patientSearch
                                : ""
                          }
                          onChange={(e) => handlePatientSearchChange(e.target.value, task.id)}
                          onFocus={() => setActivePatientTaskId(task.id)}
                          placeholder="Search patient..."
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                        />
                        {task.patientId && (
                          <button
                            type="button"
                            onClick={() => {
                              setTasks((prev) =>
                                prev.map((t) =>
                                  t.id === task.id
                                    ? { ...t, patientId: "", patientName: "" }
                                    : t
                                )
                              );
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                        {activePatientTaskId === task.id &&
                          !task.patientId &&
                          (isSearchingPatients || patientResults.length > 0) && (
                          <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                            {isSearchingPatients ? (
                              <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
                            ) : patientResults.length === 0 ? (
                              <div className="px-4 py-3 text-sm text-slate-500">No patients found</div>
                            ) : (
                              patientResults.map((patient) => {
                                const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Unnamed patient";
                                return (
                                  <button
                                    key={patient.id}
                                    type="button"
                                    onClick={() => handlePatientSelect(patient, task.id)}
                                    className="w-full px-4 py-2 text-left text-sm hover:bg-sky-50 text-slate-700"
                                  >
                                    <div className="font-medium">{name}</div>
                                    <div className="text-xs text-slate-500">
                                      {patient.email || patient.phone || "No contact details"}
                                    </div>
                                  </button>
                                );
                              })
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* User Assignment */}
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">
                        Assignee
                      </label>
                      <div className="relative">
                        <select
                          value={task.assignedUserId}
                          onChange={(e) => {
                            const user = users.find((u) => u.id === e.target.value);
                            if (user) handleUserSelect(task.id, user);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 appearance-none cursor-pointer"
                        >
                          <option value="">Unassigned</option>
                          {users.map((user) => (
                            <option key={user.id} value={user.id}>
                              {user.full_name || user.email || "Unnamed"}
                            </option>
                          ))}
                        </select>
                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>

            {tasks.length === 0 && (
              <div className="text-center py-8 text-slate-500 text-sm">
                No tasks to review. Click "Cancel" to start over.
              </div>
            )}

            <div className="flex justify-center gap-3 pt-4">
              <button
                type="button"
                onClick={onCancel}
                disabled={saving}
                className="rounded-lg border border-slate-200 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirm()}
                disabled={saving || tasks.length === 0}
                className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    Confirm & Create Tasks
                  </>
                )}
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="text-center py-12"
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
              className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-emerald-100 mb-4"
            >
              <Check className="w-10 h-10 text-emerald-600" />
            </motion.div>
            <motion.h3
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
              className="text-2xl font-semibold text-slate-900 mb-2"
            >
              Tasks Created Successfully!
            </motion.h3>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="text-sm text-slate-500"
            >
              {tasks.length} task{tasks.length !== 1 ? "s have" : " has"} been added to your task list
            </motion.p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
