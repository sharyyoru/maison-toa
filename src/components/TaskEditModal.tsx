"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";

type TaskStatus = "not_started" | "in_progress" | "completed";
type TaskPriority = "low" | "medium" | "high";
type TaskType = "todo" | "call" | "email" | "other";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type TaskComment = {
  id: string;
  task_id: string;
  author_user_id: string;
  author_name: string | null;
  body: string;
  created_at: string;
};

type TaskPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type Task = {
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
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  patient?: TaskPatient | null;
};

type TaskEditModalProps = {
  open: boolean;
  onClose: () => void;
  task: Task | null;
  onTaskUpdated?: (updatedTask: Task) => void;
  showMarkAsRead?: boolean;
  onMarkAsRead?: () => void;
  isMessageRead?: boolean;
};

function renderTextWithMentions(text: string): React.ReactNode {
  const mentionRegex = /@([^\s@]+(?:\s+[^\s@]+)?)/g;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    parts.push(
      <span key={match.index} className="font-semibold text-sky-600">
        @{match[1]}
      </span>
    );
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

export default function TaskEditModal({
  open,
  onClose,
  task,
  onTaskUpdated,
  showMarkAsRead = false,
  onMarkAsRead,
  isMessageRead = true,
}: TaskEditModalProps) {
  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("todo");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskContent, setTaskContent] = useState("");
  const [taskActivityDate, setTaskActivityDate] = useState("");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState<string>("");
  const [taskAssignedUserSearch, setTaskAssignedUserSearch] = useState("");
  const [taskAssignedUserDropdownOpen, setTaskAssignedUserDropdownOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [usersLoaded, setUsersLoaded] = useState(false);

  const [comments, setComments] = useState<TaskComment[]>([]);
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [commentInput, setCommentInput] = useState("");
  const [commentError, setCommentError] = useState<string | null>(null);
  const [commentSaving, setCommentSaving] = useState(false);
  const [commentMentionUserIds, setCommentMentionUserIds] = useState<string[]>([]);
  const [activeMentionQuery, setActiveMentionQuery] = useState("");
  const commentInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open && task) {
      setTaskName(task.name || "");
      setTaskType(task.type || "todo");
      setTaskPriority(task.priority || "medium");
      setTaskContent(task.content || "");
      setTaskAssignedUserId(task.assigned_user_id || "");
      setTaskAssignedUserSearch(task.assigned_user_name || "");
      
      if (task.activity_date) {
        const d = new Date(task.activity_date);
        if (!Number.isNaN(d.getTime())) {
          const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
          setTaskActivityDate(
            `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
          );
        }
      } else {
        setTaskActivityDate("");
      }

      setError(null);
      setCommentInput("");
      setCommentError(null);
      setCommentMentionUserIds([]);
      setActiveMentionQuery("");

      loadComments(task.id);
      if (!usersLoaded) {
        loadUsers();
      }
    }
  }, [open, task]);

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

  async function loadComments(taskId: string) {
    try {
      setCommentsLoading(true);
      const { data, error } = await supabaseClient
        .from("task_comments")
        .select("id, task_id, author_user_id, author_name, body, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setComments(data as TaskComment[]);
      } else {
        setComments([]);
      }
    } catch {
      setComments([]);
    } finally {
      setCommentsLoading(false);
    }
  }

  const filteredUsers = users.filter((user) => {
    if (!taskAssignedUserSearch.trim()) return true;
    const search = taskAssignedUserSearch.toLowerCase();
    return (
      (user.full_name?.toLowerCase() || "").includes(search) ||
      (user.email?.toLowerCase() || "").includes(search)
    );
  });

  const trimmedMentionQuery = activeMentionQuery.trim().toLowerCase();
  const mentionOptions =
    trimmedMentionQuery && users.length > 0
      ? users
          .filter((user) => {
            const hay = (user.full_name || user.email || "").toLowerCase();
            return hay.includes(trimmedMentionQuery);
          })
          .slice(0, 6)
      : [];

  function handleUserSelect(user: PlatformUser) {
    setTaskAssignedUserId(user.id);
    setTaskAssignedUserSearch(user.full_name || user.email || "");
    setTaskAssignedUserDropdownOpen(false);
  }

  function handleCommentInputChange(value: string) {
    setCommentInput(value);
    setCommentError(null);

    const match = value.match(/@([^\s@]{0,50})$/);
    if (match) {
      setActiveMentionQuery(match[1].toLowerCase());
    } else {
      setActiveMentionQuery("");
    }
  }

  function handleMentionSelect(user: PlatformUser) {
    const display = user.full_name || user.email || "User";
    setCommentInput((prev) => prev.replace(/@([^\s@]{0,50})$/, `@${display} `));
    setCommentMentionUserIds((prev) => {
      if (prev.includes(user.id)) return prev;
      return [...prev, user.id];
    });
    setActiveMentionQuery("");
    // Refocus the input after selecting a mention to prevent "kicking out"
    setTimeout(() => {
      commentInputRef.current?.focus();
    }, 0);
  }

  async function handleCommentSubmit() {
    if (!task) return;
    const trimmed = commentInput.trim();
    if (!trimmed) {
      setCommentError("Comment cannot be empty.");
      return;
    }

    try {
      setCommentSaving(true);
      setCommentError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setCommentError("You must be logged in to comment.");
        setCommentSaving(false);
        return;
      }

      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const fullName = [first, last].filter(Boolean).join(" ") || authUser.email || null;

      const { data: inserted, error: insertError } = await supabaseClient
        .from("task_comments")
        .insert({
          task_id: task.id,
          author_user_id: authUser.id,
          author_name: fullName,
          body: trimmed,
        })
        .select("id, task_id, author_user_id, author_name, body, created_at")
        .single();

      if (insertError || !inserted) {
        setCommentError(insertError?.message ?? "Failed to save comment.");
        setCommentSaving(false);
        return;
      }

      const comment = inserted as TaskComment;
      setComments((prev) => [...prev, comment]);

      // Insert mentions
      if (commentMentionUserIds.length > 0) {
        const rows = commentMentionUserIds.map((mentionedUserId) => ({
          task_comment_id: comment.id,
          task_id: task.id,
          mentioned_user_id: mentionedUserId,
        }));

        try {
          await supabaseClient.from("task_comment_mentions").insert(rows);
        } catch {
        }
      }

      setCommentInput("");
      setCommentMentionUserIds([]);
      setActiveMentionQuery("");
    } catch {
      setCommentError("Failed to save comment.");
    } finally {
      setCommentSaving(false);
    }
  }

  async function handleUpdateTask() {
    if (!task) return;

    try {
      setSaving(true);
      setError(null);

      const { data, error: updateError } = await supabaseClient
        .from("tasks")
        .update({
          name: taskName.trim() || "Untitled task",
          type: taskType,
          priority: taskPriority,
          content: taskContent.trim() || null,
          activity_date: taskActivityDate || null,
          assigned_user_id: taskAssignedUserId || null,
          assigned_user_name: taskAssignedUserSearch || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id)
        .select("id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_id, assigned_user_name")
        .single();

      if (updateError || !data) {
        setError(updateError?.message ?? "Failed to update task.");
        setSaving(false);
        return;
      }

      if (onTaskUpdated) {
        onTaskUpdated(data as Task);
      }

      onClose();
    } catch {
      setError("Failed to update task.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetComplete() {
    if (!task) return;

    try {
      setCompleting(true);
      setError(null);

      const { data, error: updateError } = await supabaseClient
        .from("tasks")
        .update({
          status: "completed" as TaskStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id)
        .select("id, patient_id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_id, assigned_user_name")
        .single();

      if (updateError || !data) {
        setError(updateError?.message ?? "Failed to mark task as complete.");
        setCompleting(false);
        return;
      }

      if (onTaskUpdated) {
        onTaskUpdated(data as Task);
      }

      onClose();
    } catch {
      setError("Failed to mark task as complete.");
    } finally {
      setCompleting(false);
    }
  }

  if (!open || !task) return null;

  const patient = task.patient;
  const patientName = patient
    ? `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim().replace(/\s+/g, " ")
    : "Unknown patient";

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/50 px-4 py-6 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Edit Task</h2>
            {patient && (
              <p className="text-sm text-slate-500">
                Patient:{" "}
                <Link
                  href={`/patients/${patient.id}?mode=crm&tab=tasks&taskId=${task?.id || ""}`}
                  className="text-sky-600 hover:text-sky-700 hover:underline"
                  onClick={onClose}
                >
                  {patientName}
                </Link>
              </p>
            )}
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
              <label className="block text-sm font-medium text-slate-700">User</label>
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

          {/* Comments Section */}
          <div className="border-t border-slate-200 pt-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">Comments</p>
            {commentsLoading ? (
              <p className="text-xs text-slate-500">Loading comments...</p>
            ) : comments.length === 0 ? (
              <p className="text-xs text-slate-400 mb-2">No comments yet.</p>
            ) : (
              <div className="mb-3 max-h-48 space-y-2 overflow-y-auto">
                {comments.map((comment) => {
                  const cDate = comment.created_at ? new Date(comment.created_at) : null;
                  const cLabel = cDate && !Number.isNaN(cDate.getTime()) ? cDate.toLocaleDateString() : null;

                  return (
                    <div
                      key={comment.id}
                      className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-800"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-medium text-slate-700">{comment.author_name || "Unknown"}</p>
                          <p className="mt-0.5 whitespace-pre-wrap">{renderTextWithMentions(comment.body)}</p>
                        </div>
                        {cLabel && <p className="shrink-0 text-[10px] text-slate-400">{cLabel}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void handleCommentSubmit();
              }}
            >
              <div className="relative flex items-center gap-2">
                <input
                  ref={commentInputRef}
                  type="text"
                  value={commentInput}
                  onChange={(e) => handleCommentInputChange(e.target.value)}
                  placeholder="Add a comment... Use @ to mention."
                  className="flex-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  disabled={commentSaving}
                />
                <button
                  type="submit"
                  disabled={commentSaving}
                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-600 text-xs font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {commentSaving ? "…" : "→"}
                </button>
              </div>
              {commentError && (
                <p className="mt-1 text-[10px] text-red-600">{commentError}</p>
              )}

              {mentionOptions.length > 0 && (
                <div className="mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-xs shadow">
                  {mentionOptions.map((user) => {
                    const display = user.full_name || user.email || "Unnamed user";
                    return (
                      <button
                        key={user.id}
                        type="button"
                        onClick={() => handleMentionSelect(user)}
                        className="block w-full cursor-pointer px-3 py-2 text-left text-slate-700 hover:bg-slate-50"
                      >
                        {display}
                      </button>
                    );
                  })}
                </div>
              )}
            </form>
          </div>
        </div>

        <div className="flex justify-between items-center gap-3 border-t border-slate-200 px-5 py-4">
          <div className="flex gap-2">
            {showMarkAsRead && !isMessageRead && onMarkAsRead && (
              <button
                type="button"
                onClick={() => {
                  onMarkAsRead();
                }}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                Mark as Read
              </button>
            )}
            {task.status !== "completed" && (
              <button
                type="button"
                onClick={() => void handleSetComplete()}
                disabled={completing || saving}
                className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {completing ? "Completing..." : "Set Complete"}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving || completing}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleUpdateTask()}
              disabled={saving || completing}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Updating..." : "Update Task"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
