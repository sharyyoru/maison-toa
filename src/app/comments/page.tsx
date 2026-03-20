"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { useCommentsUnread } from "@/components/CommentsUnreadContext";
import TaskEditModal from "@/components/TaskEditModal";

// Helper function to strip HTML tags from text
function stripHtmlTags(html: string): string {
  if (!html) return "";
  // Remove HTML tags
  const withoutTags = html.replace(/<[^>]*>/g, "");
  // Decode HTML entities
  const textarea = document.createElement("textarea");
  textarea.innerHTML = withoutTags;
  return textarea.value;
}

type MentionNote = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

type MentionPatient = {
  id: string;
  first_name: string;
  last_name: string;
};

type NoteMentionRow = {
  id: string;
  created_at: string;
  read_at: string | null;
  patient_id: string;
  note: MentionNote | null;
  patient: MentionPatient | null;
  type: "note";
};

type TaskComment = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

type TaskInfo = {
  id: string;
  name: string;
  content: string | null;
  status: "not_started" | "in_progress" | "completed";
  priority: "low" | "medium" | "high";
  type: "todo" | "call" | "email" | "other";
  activity_date: string | null;
  created_at: string;
  created_by_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  patient_id: string;
};

type TaskMentionRow = {
  id: string;
  created_at: string;
  read_at: string | null;
  task_id: string;
  comment: TaskComment | null;
  task: TaskInfo | null;
  patient: MentionPatient | null;
  type: "task";
};

type MentionRow = NoteMentionRow | TaskMentionRow;

export default function CommentsPage() {
  const router = useRouter();
  const [mentions, setMentions] = useState<MentionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [markingRead, setMarkingRead] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const { setUnreadCountOptimistic, refreshUnread } = useCommentsUnread();
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [selectedTaskMention, setSelectedTaskMention] = useState<TaskMentionRow | null>(null);
  const [filter, setFilter] = useState<"all" | "unread" | "read">("all");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [priorityMode, setPriorityMode] = useState<"crm" | "medical">("crm");

  useEffect(() => {
    let isMounted = true;

    async function loadMentions() {
      try {
        setLoading(true);
        setError(null);

        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user;

        if (!user) {
          if (!isMounted) return;
          setError("You must be logged in to view comments.");
          setMentions([]);
          setLoading(false);
          return;
        }

        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const rawPriority = (meta["priority_mode"] as string) || "";
        const next: "crm" | "medical" =
          rawPriority === "medical" ? "medical" : "crm";
        setPriorityMode(next);

        // Fetch patient note mentions
        const { data: noteMentions, error: noteError } = await supabaseClient
          .from("patient_note_mentions")
          .select(
            "id, created_at, read_at, patient_id, note:patient_notes(id, body, author_name, created_at), patient:patients(id, first_name, last_name)",
          )
          .eq("mentioned_user_id", user.id)
          .order("created_at", { ascending: false });

        // Fetch task comment mentions
        const { data: taskMentions, error: taskError } = await supabaseClient
          .from("task_comment_mentions")
          .select(
            "id, created_at, read_at, task_id, comment:task_comments(id, body, author_name, created_at), task:tasks(id, name, content, status, priority, type, activity_date, created_at, created_by_name, assigned_user_id, assigned_user_name, patient_id, patient:patients(id, first_name, last_name))",
          )
          .eq("mentioned_user_id", user.id)
          .order("created_at", { ascending: false });

        // NOTE: Email reply notifications are NOT shown on Comments page
        // They have their own dedicated Email Replies page and notification dropdown

        if (!isMounted) return;

        if (noteError && taskError) {
          setError("Failed to load comments.");
          setMentions([]);
          setLoading(false);
          return;
        }

        // Combine and sort both types of mentions
        const noteRows: NoteMentionRow[] = (noteMentions || []).map((m: any) => ({
          ...m,
          type: "note" as const,
        }));

        const taskRows: TaskMentionRow[] = (taskMentions || []).map((m: any) => ({
          id: m.id,
          created_at: m.created_at,
          read_at: m.read_at,
          task_id: m.task_id,
          comment: m.comment,
          task: m.task ? {
            ...m.task,
            patient_id: m.task.patient_id,
          } : null,
          patient: m.task?.patient || null,
          type: "task" as const,
        }));

        const combined = [...noteRows, ...taskRows].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );

        setMentions(combined);
        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError("Failed to load comments.");
        setMentions([]);
        setLoading(false);
      }
    }

    loadMentions();

    return () => {
      isMounted = false;
    };
  }, [refreshKey]);

  async function handleMarkAllRead() {
    const unreadNotes = mentions.filter((m) => !m.read_at && m.type === "note").map((m) => m.id);
    const unreadTasks = mentions.filter((m) => !m.read_at && m.type === "task").map((m) => m.id);
    if (unreadNotes.length === 0 && unreadTasks.length === 0) return;

    try {
      setMarkingRead(true);
      const nowIso = new Date().toISOString();

      let noteError = null;
      let taskError = null;

      // Mark note mentions as read
      if (unreadNotes.length > 0) {
        const { error } = await supabaseClient
          .from("patient_note_mentions")
          .update({ read_at: nowIso })
          .in("id", unreadNotes);
        noteError = error;
      }

      // Mark task mentions as read
      if (unreadTasks.length > 0) {
        const { error } = await supabaseClient
          .from("task_comment_mentions")
          .update({ read_at: nowIso })
          .in("id", unreadTasks);
        taskError = error;
      }

      // Only update local state if database updates succeeded
      if (noteError || taskError) {
        console.error("Failed to mark comments as read:", noteError, taskError);
        setToastMessage("Failed to mark comments as read. Please try again.");
        setMarkingRead(false);
        return;
      }

      setMentions((prev) =>
        prev.map((m) =>
          m.read_at || (!unreadNotes.includes(m.id) && !unreadTasks.includes(m.id))
            ? m
            : { ...m, read_at: nowIso },
        ),
      );
      setUnreadCountOptimistic((prev) => prev - unreadNotes.length - unreadTasks.length);
      setToastMessage("All comments marked as read.");
      setMarkingRead(false);
    } catch (err) {
      console.error("Error marking comments as read:", err);
      setToastMessage("Failed to mark comments as read. Please try again.");
      setMarkingRead(false);
    }
  }

  function buildPatientHref(id: string) {
    // Always redirect to the CRM notes tab for patient note mentions
    return `/patients/${id}?m_tab=crm&crm_sub=notes`;
  }

  useEffect(() => {
    if (!toastMessage) return;

    const id = window.setTimeout(() => {
      setToastMessage(null);
    }, 3000);

    return () => {
      window.clearTimeout(id);
    };
  }, [toastMessage]);

  async function handleOpenMention(mention: MentionRow) {
    if (mention.read_at) return;

    const nowIso = new Date().toISOString();
    const tableName = mention.type === "task" 
      ? "task_comment_mentions" 
      : "patient_note_mentions";

    try {
      // Update database first, then update local state only if successful
      const { error } = await supabaseClient
        .from(tableName)
        .update({ read_at: nowIso })
        .eq("id", mention.id);

      if (error) {
        console.error("Failed to mark comment as read:", error);
        return;
      }

      // Only update local state after successful database update
      setMentions((prev) =>
        prev.map((m) => (m.id === mention.id ? { ...m, read_at: nowIso } : m)),
      );
      setUnreadCountOptimistic((prev) => prev - 1);
    } catch (err) {
      console.error("Error marking comment as read:", err);
    }
  }

  function handleOpenTaskMention(mention: TaskMentionRow) {
    setSelectedTaskMention(mention);
    setTaskModalOpen(true);
  }

  async function handleMarkTaskMentionAsRead() {
    if (!selectedTaskMention || selectedTaskMention.read_at) return;
    
    const nowIso = new Date().toISOString();
    const mentionId = selectedTaskMention.id;
    
    try {
      // Update database first, then update local state only if successful
      const { error } = await supabaseClient
        .from("task_comment_mentions")
        .update({ read_at: nowIso })
        .eq("id", mentionId);

      if (error) {
        console.error("Failed to mark task comment as read:", error);
        return;
      }

      // Only update local state after successful database update
      setMentions((prev) =>
        prev.map((m) => (m.id === mentionId ? { ...m, read_at: nowIso } : m)),
      );
      setUnreadCountOptimistic((prev) => prev - 1);
      
      // Update the selected task mention as well
      setSelectedTaskMention((prev) => prev ? { ...prev, read_at: nowIso } : null);
    } catch (err) {
      console.error("Error marking task comment as read:", err);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Comments</h1>
          <p className="text-xs text-slate-500">
            Notes where teammates mentioned you. Click through to open the patient.
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
              refreshUnread().catch(() => {});
            }}
            disabled={loading}
            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
          {mentions.some((m) => !m.read_at) ? (
            <button
              type="button"
              onClick={handleMarkAllRead}
              disabled={markingRead}
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {markingRead ? "Marking..." : "Mark all as read"}
            </button>
          ) : null}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        {loading ? (
          <p className="text-xs text-slate-500">Loading comments...</p>
        ) : error ? (
          <p className="text-xs text-red-600">{error}</p>
        ) : mentions.length === 0 ? (
          <p className="text-xs text-slate-500">No comments yet.</p>
        ) : (
          <div className="space-y-4 text-xs">
            {(() => {
              // Apply filter
              const filteredMentions = mentions.filter((m) => {
                const isRead = !!m.read_at;
                if (filter === "unread") return !isRead;
                if (filter === "read") return isRead;
                return true;
              });

              const unreadMentions = filteredMentions.filter((m) => !m.read_at);
              const readMentions = filteredMentions.filter((m) => m.read_at);

              // Calculate pagination
              const allMentions = [...unreadMentions, ...readMentions];
              const totalPages = Math.ceil(allMentions.length / itemsPerPage);
              const startIndex = (currentPage - 1) * itemsPerPage;
              const endIndex = startIndex + itemsPerPage;
              const paginatedMentions = allMentions.slice(startIndex, endIndex);

              // Separate paginated mentions
              const paginatedUnread = paginatedMentions.filter((m) => !m.read_at);
              const paginatedRead = paginatedMentions.filter((m) => m.read_at);

              const renderMentionRow = (mention: MentionRow) => {
                const createdDate = mention.created_at
                  ? new Date(mention.created_at)
                  : null;
                const createdLabel =
                  createdDate && !Number.isNaN(createdDate.getTime())
                    ? createdDate.toLocaleString()
                    : null;

                const patient = mention.patient;
                const patientName = patient
                  ? `${patient.first_name} ${patient.last_name}`
                  : "Unknown patient";
                const patientId = patient?.id;

                // Handle task mention
                if (mention.type === "task") {
                  const taskMention = mention as TaskMentionRow;
                  const comment = taskMention.comment;
                  const task = taskMention.task;

                  return (
                    <div
                      key={mention.id}
                      className="rounded-lg bg-slate-50/80 px-3 py-2 hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <button
                          type="button"
                          onClick={() => handleOpenTaskMention(taskMention)}
                          className="flex-1 text-left pr-4"
                        >
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                            {createdLabel ? <span>{createdLabel}</span> : null}
                            <span className="inline-flex items-center rounded-full bg-purple-100 px-1.5 py-0.5 text-[9px] font-medium text-purple-700">
                              Task Comment
                            </span>
                            <span>
                              Task:{" "}
                              <span className="font-medium text-purple-700">
                                {task?.name || "No Task Name"}
                              </span>
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-slate-800">
                            {comment?.author_name ? (
                              <span className="font-medium">{comment.author_name}: </span>
                            ) : null}
                            <span>{stripHtmlTags(comment?.body ?? "(Comment unavailable)")}</span>
                          </p>
                          <p className="mt-0.5 text-[10px] text-slate-500">
                            Patient:{" "}
                            {patientId ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(`/patients/${patientId}?m_tab=crm&crm_sub=tasks`);
                                }}
                                className="font-medium text-purple-700 hover:text-purple-800 hover:underline cursor-pointer"
                              >
                                {patientName}
                              </span>
                            ) : (
                              <span className="font-medium">{patientName}</span>
                            )}
                          </p>
                        </button>
                        <div className="flex items-center gap-2">
                          {!mention.read_at ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenMention(mention);
                                }}
                                className="inline-flex items-center rounded-full border border-purple-200 bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 hover:bg-purple-100 transition-colors"
                              >
                                Mark as read
                              </button>
                              <span className="inline-flex h-2 w-2 rounded-full bg-purple-500" />
                            </>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Handle note mention
                const noteMention = mention as NoteMentionRow;
                const note = noteMention.note;

                return (
                  <div
                    key={mention.id}
                    className="rounded-lg bg-slate-50/80 px-3 py-2 hover:bg-slate-100 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <button
                        type="button"
                        onClick={() => {
                          handleOpenMention(mention);
                          if (patientId) {
                            router.push(buildPatientHref(patientId));
                          }
                        }}
                        className="flex-1 text-left pr-4"
                      >
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                          {createdLabel ? <span>{createdLabel}</span> : null}
                          <span className="inline-flex items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-medium text-sky-700">
                            Patient Note
                          </span>
                          <span>
                            Patient:{" "}
                            {patientId ? (
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  router.push(buildPatientHref(patientId));
                                }}
                                className="font-medium text-sky-700 hover:text-sky-800 hover:underline cursor-pointer"
                              >
                                {patientName}
                              </span>
                            ) : (
                              <span className="font-medium text-sky-700">
                                {patientName}
                              </span>
                            )}
                          </span>
                        </div>
                        <p className="mt-1 text-[11px] text-slate-800">
                          {note?.author_name ? (
                            <span className="font-medium">{note.author_name}: </span>
                          ) : null}
                          <span>{stripHtmlTags(note?.body ?? "(Note unavailable)")}</span>
                        </p>
                      </button>
                      <div className="flex items-center gap-2">
                        {!mention.read_at ? (
                          <>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenMention(mention);
                              }}
                              className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                            >
                              Mark as read
                            </button>
                            <span className="inline-flex h-2 w-2 rounded-full bg-sky-500" />
                          </>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              };

              return (
                <>
                  {paginatedUnread.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-slate-600">Unread</p>
                      {paginatedUnread.map((m) => renderMentionRow(m))}
                    </div>
                  )}
                  {paginatedRead.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[11px] font-semibold text-slate-600">Read</p>
                      {paginatedRead.map((m) => renderMentionRow(m))}
                    </div>
                  )}
                  {allMentions.length === 0 && (
                    <p className="text-xs text-slate-500">No comments in this category.</p>
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
      {toastMessage ? (
        <div className="fixed bottom-6 right-6 z-40">
          <div className="rounded-full border border-slate-800/70 bg-slate-900/95 px-3 py-2 text-[11px] font-medium text-slate-50 shadow-[0_18px_40px_rgba(15,23,42,0.55)]">
            {toastMessage}
          </div>
        </div>
      ) : null}

      {/* Task Edit Modal */}
      <TaskEditModal
        open={taskModalOpen}
        onClose={() => {
          setTaskModalOpen(false);
          setSelectedTaskMention(null);
        }}
        task={selectedTaskMention?.task ? {
          ...selectedTaskMention.task,
          patient: selectedTaskMention.patient ? {
            id: selectedTaskMention.patient.id,
            first_name: selectedTaskMention.patient.first_name,
            last_name: selectedTaskMention.patient.last_name,
            email: null,
            phone: null,
          } : null,
        } : null}
        showMarkAsRead={true}
        isMessageRead={!!selectedTaskMention?.read_at}
        onMarkAsRead={() => void handleMarkTaskMentionAsRead()}
      />

    </div>
  );
}
