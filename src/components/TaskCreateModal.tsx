"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type TaskStatus = "not_started" | "in_progress" | "completed";
type TaskPriority = "low" | "medium" | "high";
type TaskType = "todo" | "call" | "email" | "other";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TaskPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type TaskCreateModalProps = {
  open: boolean;
  onClose: () => void;
  onTaskCreated?: (newTask: any) => void;
};

export default function TaskCreateModal({
  open,
  onClose,
  onTaskCreated,
}: TaskCreateModalProps) {
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("todo");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskContent, setTaskContent] = useState("");
  const [taskActivityDate, setTaskActivityDate] = useState("");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState<string>("");
  const [taskAssignedUserSearch, setTaskAssignedUserSearch] = useState("");
  const [taskAssignedUserDropdownOpen, setTaskAssignedUserDropdownOpen] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState<string>("");
  const [patientSearch, setPatientSearch] = useState("");
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [searchResults, setSearchResults] = useState<TaskPatient[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);

  // Use React 19 useTransition for non-blocking updates
  const [, startTransition] = useTransition();
  
  // Debounce timer ref for server-side search
  const searchTimerRef = useRef<NodeJS.Timeout | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (open) {
      // Reset form
      setTaskName("");
      setTaskType("todo");
      setTaskPriority("medium");
      setTaskContent("");
      setTaskActivityDate("");
      setTaskAssignedUserId("");
      setTaskAssignedUserSearch("");
      setSelectedPatientId("");
      setPatientSearch("");
      setSearchResults([]);
      setError(null);

      // Load users only
      if (!usersLoaded) {
        loadUsers();
      }
    }
    
    // Cleanup on close
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current);
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [open, usersLoaded]);

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

  // Server-side patient search with debouncing
  async function searchPatients(searchTerm: string) {
    // Cancel previous request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    
    const trimmed = searchTerm.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    // Create new abort controller for this request
    abortControllerRef.current = new AbortController();
    
    try {
      setIsSearching(true);
      
      const searchPattern = `%${trimmed}%`;
      
      const { data, error } = await supabaseClient
        .from("patients")
        .select("id, first_name, last_name, email, phone")
        .or(`first_name.ilike.${searchPattern},last_name.ilike.${searchPattern},email.ilike.${searchPattern},phone.ilike.${searchPattern}`)
        .order("last_name", { ascending: true })
        .limit(20);

      if (!error && data) {
        startTransition(() => {
          setSearchResults(data as TaskPatient[]);
        });
      }
    } catch {
      // Ignore abort errors
    } finally {
      setIsSearching(false);
    }
  }

  // Handle patient search input with debouncing
  function handlePatientSearchChange(value: string) {
    setPatientSearch(value);
    
    if (value.trim()) {
      setShowPatientDropdown(true);
    } else {
      setShowPatientDropdown(false);
      setSelectedPatientId("");
    }

    // Clear previous timer
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current);
    }

    // Debounce the search - 150ms for fast response
    searchTimerRef.current = setTimeout(() => {
      void searchPatients(value);
    }, 150);
  }

  const filteredUsers = users.filter((user) => {
    if (!taskAssignedUserSearch.trim()) return true;
    const search = taskAssignedUserSearch.toLowerCase();
    return (
      (user.full_name?.toLowerCase() || "").includes(search) ||
      (user.email?.toLowerCase() || "").includes(search)
    );
  });

  function handleUserSelect(user: PlatformUser) {
    setTaskAssignedUserId(user.id);
    setTaskAssignedUserSearch(user.full_name || user.email || "");
    setTaskAssignedUserDropdownOpen(false);
  }

  function handlePatientSelect(patient: TaskPatient) {
    setSelectedPatientId(patient.id);
    const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Unnamed patient";
    setPatientSearch(name);
    setShowPatientDropdown(false);
    setSearchResults([]);
  }

  async function handleCreateTask() {
    if (!selectedPatientId) {
      setError("Please select a patient for this task.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setError("You must be logged in to create a task.");
        setSaving(false);
        return;
      }

      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const createdByName = [first, last].filter(Boolean).join(" ") || authUser.email || null;

      const { data, error: insertError } = await supabaseClient
        .from("tasks")
        .insert({
          patient_id: selectedPatientId,
          name: taskName.trim() || "Untitled task",
          type: taskType,
          priority: taskPriority,
          content: taskContent.trim() || null,
          activity_date: taskActivityDate || null,
          status: "not_started" as TaskStatus,
          assigned_user_id: taskAssignedUserId || authUser.id,
          assigned_user_name: taskAssignedUserSearch || createdByName,
          created_by_name: createdByName,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select("id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_id, assigned_user_name, patient:patients(id, first_name, last_name, email, phone)")
        .single();

      if (insertError || !data) {
        setError(insertError?.message ?? "Failed to create task.");
        setSaving(false);
        return;
      }

      if (onTaskCreated) {
        onTaskCreated(data);
      }

      onClose();
    } catch {
      setError("Failed to create task.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create New Task</h2>
            <p className="text-sm text-slate-500">Create a task for a patient</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Patient Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Patient *</label>
            <div className="relative">
              <input
                type="text"
                value={patientSearch}
                onChange={(e) => handlePatientSearchChange(e.target.value)}
                onBlur={() => {
                  setTimeout(() => setShowPatientDropdown(false), 200);
                }}
                placeholder="Search patient..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {selectedPatientId && (
                <button
                  type="button"
                  onClick={() => {
                    setSelectedPatientId("");
                    setPatientSearch("");
                    setSearchResults([]);
                  }}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {showPatientDropdown && patientSearch.trim() && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {isSearching ? (
                    <div className="px-4 py-3 text-sm text-slate-500">Searching...</div>
                  ) : searchResults.length === 0 ? (
                    <div className="px-4 py-3 text-sm text-slate-500">No patients found</div>
                  ) : (
                    searchResults.map((patient) => {
                      const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Unnamed patient";
                      return (
                        <button
                          key={patient.id}
                          type="button"
                          onClick={() => handlePatientSelect(patient)}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-emerald-50 ${
                            selectedPatientId === patient.id ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                          }`}
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

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Name</label>
            <input
              type="text"
              value={taskName}
              onChange={(e) => setTaskName(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="todo">Todo</option>
                <option value="call">Call</option>
                <option value="email">Email</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Priority</label>
              <select
                value={taskPriority}
                onChange={(e) => setTaskPriority(e.target.value as TaskPriority)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Assigned User</label>
              <div className="relative">
                <input
                  type="text"
                  value={taskAssignedUserSearch}
                  onChange={(e) => {
                    setTaskAssignedUserSearch(e.target.value);
                    setTaskAssignedUserDropdownOpen(true);
                    if (!e.target.value.trim()) {
                      setTaskAssignedUserId("");
                    }
                  }}
                  onFocus={() => setTaskAssignedUserDropdownOpen(true)}
                  onBlur={() => {
                    setTimeout(() => setTaskAssignedUserDropdownOpen(false), 200);
                  }}
                  placeholder="Search user..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {taskAssignedUserId && (
                  <button
                    type="button"
                    onClick={() => {
                      setTaskAssignedUserId("");
                      setTaskAssignedUserSearch("");
                    }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
                {taskAssignedUserDropdownOpen && filteredUsers.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {filteredUsers.map((user) => (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleUserSelect(user)}
                        className={`w-full px-4 py-2 text-left text-sm hover:bg-emerald-50 ${
                          taskAssignedUserId === user.id ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                        }`}
                      >
                        <div className="font-medium">{user.full_name || "Unnamed"}</div>
                        {user.email && <div className="text-xs text-slate-500">{user.email}</div>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">Activity Date</label>
              <input
                type="datetime-local"
                value={taskActivityDate}
                onChange={(e) => setTaskActivityDate(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">Content</label>
            <textarea
              value={taskContent}
              onChange={(e) => setTaskContent(e.target.value)}
              rows={3}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleCreateTask()}
            disabled={saving}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? "Creating..." : "Create Task"}
          </button>
        </div>
      </div>
    </div>
  );
}
