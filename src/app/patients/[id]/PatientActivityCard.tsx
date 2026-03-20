"use client";

import { ChangeEvent, FormEvent, useEffect, useState, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { stripEmailSignature } from "@/utils/emailCleaner";
import AppointmentModal, { type AppointmentData } from "@/components/AppointmentModal";
import RichTextEditor from "@/components/RichTextEditor";
import WhatsAppWebConversation from "@/components/WhatsAppWebConversation";
import { formatSwissDateTime, formatSwissDate, formatSwissShortDate, formatSwissTime } from "@/lib/swissTimezone";

type ActivityTab = "activity" | "notes" | "emails" | "whatsapp" | "tasks" | "deals";

type SortOrder = "desc" | "asc";

type PatientNote = {
  id: string;
  body: string;
  author_name: string | null;
  created_at: string;
};

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type NoteMentionSummary = {
  mentioned_user_id: string;
  mentioned_name: string;
  read_at: string | null;
};

type EmailStatus = "draft" | "queued" | "sent" | "read" | "failed";

type EmailDirection = "outbound" | "inbound";

type EmailFilter = "all" | "inbound" | "outbound" | "scheduled";

type PatientEmail = {
  id: string;
  to_address: string;
  from_address: string | null;
  subject: string;
  body: string;
  status: EmailStatus;
  direction: EmailDirection;
  sent_at: string | null;
  read_at: string | null;
  created_at: string;
};

type EmailAttachment = {
  id: string;
  email_id: string;
  file_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size: number | null;
  public_url: string | null;
};

type EmailAttachmentCount = {
  email_id: string;
  count: number;
};

type WhatsappStatus = "queued" | "sent" | "delivered" | "failed";

type WhatsappDirection = "outbound" | "inbound";

type WhatsappMessage = {
  id: string;
  patient_id: string | null;
  to_number: string;
  from_number: string | null;
  body: string;
  status: WhatsappStatus;
  direction: WhatsappDirection;
  sent_at: string | null;
  created_at: string;
};

type TaskStatus = "not_started" | "in_progress" | "completed";

type TaskPriority = "low" | "medium" | "high";

type TaskType = "todo" | "call" | "email" | "other";

type Task = {
  id: string;
  patient_id: string;
  name: string;
  content: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  type: TaskType;
  activity_date: string | null;
  created_by_user_id: string | null;
  created_by_name: string | null;
  assigned_user_id: string | null;
  assigned_user_name: string | null;
  created_at: string;
  updated_at: string;
};

type TaskComment = {
  id: string;
  task_id: string;
  author_user_id: string | null;
  author_name: string | null;
  body: string;
  created_at: string;
};

type DealStageType =
  | "lead"
  | "consultation"
  | "surgery"
  | "post_op"
  | "follow_up"
  | "other";

type DealStage = {
  id: string;
  name: string;
  type: DealStageType;
  sort_order: number;
  is_default: boolean;
};

type DealAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  reason: string | null;
  location: string | null;
};

type Deal = {
  id: string;
  patient_id: string;
  stage_id: string;
  service_id: string | null;
  pipeline: string | null;
  contact_label: string | null;
  location: string | null;
  title: string | null;
  value: number | null;
  notes: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  appointment?: DealAppointment | null;
};

type ServiceOption = {
  id: string;
  name: string;
};

function formatDateTimeLocal(date: Date) {
  const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

function formatDateOnly(date: Date) {
  const pad = (value: number) => (value < 10 ? `0${value}` : `${value}`);
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  return `${year}-${month}-${day}`;
}

export default function PatientActivityCard({
  patientId,
  createdAt,
  createdBy,
  patientEmail,
  patientPhone,
  patientName,
  contactOwnerName,
  defaultTab,
  controlledTab,
  onTabChange,
  hideTabNavigation = false,
}: {
  patientId: string;
  createdAt: string | null;
  createdBy: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientName?: string;
  contactOwnerName: string | null;
  defaultTab?: ActivityTab;
  controlledTab?: ActivityTab;
  onTabChange?: (tab: ActivityTab) => void;
  hideTabNavigation?: boolean;
}) {
  const [internalTab, setInternalTab] = useState<ActivityTab>(defaultTab ?? "activity");
  
  // Use controlled tab if provided, otherwise use internal state
  const activeTab = controlledTab ?? internalTab;
  
  const setActiveTab = (tab: ActivityTab) => {
    if (onTabChange) {
      onTabChange(tab);
    }
    setInternalTab(tab);
  };

  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [notes, setNotes] = useState<PatientNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);

  const [noteModalOpen, setNoteModalOpen] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<PatientNote | null>(null);

  const [userOptions, setUserOptions] = useState<PlatformUser[]>([]);
  const [selectedMentionIds, setSelectedMentionIds] = useState<string[]>([]);
  const [mentionsOpen, setMentionsOpen] = useState(false);

  const [noteMentionActive, setNoteMentionActive] = useState(false);
  const [noteMentionQuery, setNoteMentionQuery] = useState("");
  const [noteMentionUserIds, setNoteMentionUserIds] = useState<string[]>([]);

  const [noteMentionsByNoteId, setNoteMentionsByNoteId] = useState<
    Record<string, NoteMentionSummary[]>
  >({});

  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  const [emails, setEmails] = useState<PatientEmail[]>([]);
  const [emailsLoading, setEmailsLoading] = useState(false);
  const [emailsError, setEmailsError] = useState<string | null>(null);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [emailFullscreen, setEmailFullscreen] = useState(false);
  const [emailTo, setEmailTo] = useState(patientEmail ?? "");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailSaveError, setEmailSaveError] = useState<string | null>(null);

  const [emailAiDescription, setEmailAiDescription] = useState("");
  const [emailAiTone, setEmailAiTone] = useState("professional and reassuring");
  const [emailAiLoading, setEmailAiLoading] = useState(false);
  const [emailAiError, setEmailAiError] = useState<string | null>(null);

  const [emailFilter, setEmailFilter] = useState<EmailFilter>("inbound");
  const [viewEmail, setViewEmail] = useState<PatientEmail | null>(null);

  const [emailScheduleEnabled, setEmailScheduleEnabled] = useState(false);
  const [emailScheduledFor, setEmailScheduledFor] = useState("");

  const [emailSignatureHtml, setEmailSignatureHtml] = useState("");
  const [useSignature, setUseSignature] = useState(true);

  const [emailAttachments, setEmailAttachments] = useState<File[]>([]);
  const [emailAttachmentsError, setEmailAttachmentsError] = useState<string | null>(
    null,
  );

  const [invoiceModalOpen, setInvoiceModalOpen] = useState(false);
  const [invoiceSearchQuery, setInvoiceSearchQuery] = useState("");
  const [invoiceList, setInvoiceList] = useState<Array<{ name: string; path: string; created_at: string }>>([]);
  const [invoiceListLoading, setInvoiceListLoading] = useState(false);
  const [invoiceListError, setInvoiceListError] = useState<string | null>(null);
  const [invoiceAttaching, setInvoiceAttaching] = useState<string | null>(null);

  const [emailCreateFollowUpTask, setEmailCreateFollowUpTask] = useState(false);
  const [emailFollowUpDate, setEmailFollowUpDate] = useState<"3days" | "1week" | "custom">("3days");
  const [emailFollowUpCustomDate, setEmailFollowUpCustomDate] = useState("");
  const [emailFollowUpAssignedUserId, setEmailFollowUpAssignedUserId] = useState("");
  const [emailFollowUpAssignedUserSearch, setEmailFollowUpAssignedUserSearch] = useState("");
  const [emailFollowUpUserDropdownOpen, setEmailFollowUpUserDropdownOpen] = useState(false);
  const [platformUsers, setPlatformUsers] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);
  const [platformUsersLoaded, setPlatformUsersLoaded] = useState(false);

  const [viewEmailAttachments, setViewEmailAttachments] = useState<
    EmailAttachment[]
  >([]);
  const [viewEmailAttachmentsLoading, setViewEmailAttachmentsLoading] =
    useState(false);
  const [viewEmailAttachmentsError, setViewEmailAttachmentsError] = useState<
    string | null
  >(null);

  const [emailAttachmentCounts, setEmailAttachmentCounts] = useState<
    EmailAttachmentCount[]
  >([]);


  const [tasks, setTasks] = useState<Task[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [deals, setDeals] = useState<Deal[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [dealsLoading, setDealsLoading] = useState(false);
  const [dealsError, setDealsError] = useState<string | null>(null);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);

  const [taskStatusFilter, setTaskStatusFilter] = useState<"open" | "completed">(
    "open",
  );

  const [createTaskModalOpen, setCreateTaskModalOpen] = useState(false);
  const [editTask, setEditTask] = useState<Task | null>(null);

  const [taskName, setTaskName] = useState("");
  const [taskType, setTaskType] = useState<TaskType>("todo");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("medium");
  const [taskAssignedUserId, setTaskAssignedUserId] = useState<string | "">("");
  const [taskAssignedUserSearch, setTaskAssignedUserSearch] = useState("");
  const [taskAssignedUserDropdownOpen, setTaskAssignedUserDropdownOpen] = useState(false);
  const [taskActivityDate, setTaskActivityDate] = useState("");
  const [taskContent, setTaskContent] = useState("");
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskSaveError, setTaskSaveError] = useState<string | null>(null);

  const [taskCommentsByTaskId, setTaskCommentsByTaskId] = useState<
    Record<string, TaskComment[]>
  >({});
  const [taskCommentInputs, setTaskCommentInputs] = useState<
    Record<string, string>
  >({});
  const [taskCommentSavingIds, setTaskCommentSavingIds] = useState<string[]>([]);
  const [taskCommentErrors, setTaskCommentErrors] = useState<
    Record<string, string | null>
  >({});

  const [taskCommentMentionUserIds, setTaskCommentMentionUserIds] = useState<
    Record<string, string[]>
  >({});
  const [activeMentionTaskId, setActiveMentionTaskId] = useState<string | null>(
    null,
  );
  const [activeMentionQuery, setActiveMentionQuery] = useState("");
  const taskCommentInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [dealModalOpen, setDealModalOpen] = useState(false);
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null);

  // Deal navigation state - all deals assigned to current user across patients
  const [allUserDeals, setAllUserDeals] = useState<(Deal & { patient_name?: string })[]>([]);
  const [allUserDealsLoading, setAllUserDealsLoading] = useState(false);

  // Task navigation state - all tasks assigned to current user across patients
  type TaskDateFilter = "today" | "past" | "future" | "all";
  const [allUserTasks, setAllUserTasks] = useState<(Task & { patient_name?: string })[]>([]);
  const [allUserTasksLoading, setAllUserTasksLoading] = useState(false);
  const [taskNavDateFilter, setTaskNavDateFilter] = useState<TaskDateFilter>("today");

  // Appointment modal state
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentDeal, setAppointmentDeal] = useState<Deal | null>(null);
  const [appointmentPreviousStageId, setAppointmentPreviousStageId] = useState<string | null>(null);
  const appointmentSuccessRef = useRef(false);
  const [dealTitle, setDealTitle] = useState("");
  const [dealStageId, setDealStageId] = useState<string>("");
  const [dealServiceId, setDealServiceId] = useState<string>("");
  const [dealServiceSearch, setDealServiceSearch] = useState("");
  const [dealServiceDropdownOpen, setDealServiceDropdownOpen] = useState(false);
  const [dealPipeline, setDealPipeline] = useState("Geneva");
  const [dealContactLabel, setDealContactLabel] = useState("Marketing");
  const [dealLocation, setDealLocation] = useState("Rhône");
  const [dealNotes, setDealNotes] = useState("");
  const [dealOwnerId, setDealOwnerId] = useState<string>("");
  const [dealOwnerSearch, setDealOwnerSearch] = useState("");
  const [dealOwnerDropdownOpen, setDealOwnerDropdownOpen] = useState(false);
  const [dealSaving, setDealSaving] = useState(false);
  const [dealSaveError, setDealSaveError] = useState<string | null>(null);
  const [deletingDealId, setDeletingDealId] = useState<string | null>(null);

  const defaultEmailTo = patientEmail ?? "";

  const searchParams = useSearchParams();

  const router = useRouter();

  const [composeFromQueryHandled, setComposeFromQueryHandled] = useState(false);
  const [createTaskFromQueryHandled, setCreateTaskFromQueryHandled] =
    useState(false);
  const [highlightedTaskId, setHighlightedTaskId] = useState<string | null>(null);
  const [taskIdFromQueryHandled, setTaskIdFromQueryHandled] = useState(false);
  const [highlightedDealId, setHighlightedDealId] = useState<string | null>(null);
  const [dealIdFromQueryHandled, setDealIdFromQueryHandled] = useState(false);

  useEffect(() => {
    const tabParam = searchParams.get("tab");
    if (!tabParam) return;

    if (
      tabParam === "activity" ||
      tabParam === "notes" ||
      tabParam === "emails" ||
      tabParam === "whatsapp" ||
      tabParam === "tasks" ||
      tabParam === "deals"
    ) {
      setActiveTab(tabParam as ActivityTab);
    }
  }, [searchParams]);

  // Handle taskId URL parameter - scroll to and highlight specific task
  useEffect(() => {
    if (taskIdFromQueryHandled || tasksLoading) return;

    const taskIdParam = searchParams.get("taskId");
    if (!taskIdParam) return;

    // Check if the task exists in the loaded tasks
    const taskExists = tasks.some((t) => t.id === taskIdParam);
    if (!taskExists) return;

    setHighlightedTaskId(taskIdParam);
    setTaskIdFromQueryHandled(true);

    // Scroll to the task element after a short delay
    setTimeout(() => {
      const taskElement = document.getElementById(`task-${taskIdParam}`);
      if (taskElement) {
        taskElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Clear highlight after 3 seconds
      setTimeout(() => setHighlightedTaskId(null), 3000);
    }, 100);
  }, [searchParams, tasks, tasksLoading, taskIdFromQueryHandled]);

  // Handle dealId URL parameter - scroll to and highlight specific deal
  useEffect(() => {
    if (dealIdFromQueryHandled || dealsLoading) return;

    const dealIdParam = searchParams.get("dealId");
    if (!dealIdParam) return;

    // Check if the deal exists in the loaded deals
    const dealExists = deals.some((d) => d.id === dealIdParam);
    if (!dealExists) return;

    setHighlightedDealId(dealIdParam);
    setDealIdFromQueryHandled(true);

    // Scroll to the deal element after a short delay
    setTimeout(() => {
      const dealElement = document.getElementById(`deal-${dealIdParam}`);
      if (dealElement) {
        dealElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      // Clear highlight after 3 seconds
      setTimeout(() => setHighlightedDealId(null), 3000);
    }, 100);
  }, [searchParams, deals, dealsLoading, dealIdFromQueryHandled]);


  useEffect(() => {
    let isMounted = true;

    async function loadNotes() {
      try {
        setNotesLoading(true);
        setNotesError(null);

        // Get current user ID
        const { data: authData } = await supabaseClient.auth.getUser();
        if (authData?.user?.id) {
          setCurrentUserId(authData.user.id);
        }

        const { data, error } = await supabaseClient
          .from("patient_notes")
          .select("id, body, author_name, created_at")
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error || !data) {
          setNotesError(error?.message ?? "Failed to load notes.");
          setNotes([]);
          setNotesLoading(false);
          return;
        }

        setNotes(data as PatientNote[]);
        setNotesLoading(false);
      } catch {
        if (!isMounted) return;
        setNotesError("Failed to load notes.");
        setNotesLoading(false);
      }
    }

    loadNotes();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      try {
        // First get the Hubspot category
        const { data: categoryData, error: categoryError } = await supabaseClient
          .from("service_categories")
          .select("id")
          .eq("name", "Hubspot")
          .single();

        if (!isMounted) return;

        if (categoryError || !categoryData) {
          setServiceOptions([]);
          return;
        }

        // Then get services from Hubspot category only
        const { data, error } = await supabaseClient
          .from("services")
          .select("id, name")
          .eq("category_id", categoryData.id)
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (error || !data) {
          setServiceOptions([]);
          return;
        }

        setServiceOptions(data as ServiceOption[]);
      } catch {
        if (!isMounted) return;
        setServiceOptions([]);
      }
    }

    loadServices();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadDeals() {
      try {
        setDealsLoading(true);
        setDealsError(null);

        const { data: stagesData, error: stagesError } = await supabaseClient
          .from("deal_stages")
          .select("id, name, type, sort_order, is_default")
          .order("sort_order", { ascending: true });

        if (!isMounted) return;

        if (stagesError || !stagesData) {
          setDealStages([]);
        } else {
          setDealStages(stagesData as DealStage[]);
        }

        const { data: dealsData, error: dealsErrorLatest } = await supabaseClient
          .from("deals")
          .select(
            "id, patient_id, stage_id, service_id, pipeline, contact_label, location, title, value, notes, owner_id, owner_name, created_at, updated_at",
          )
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (dealsErrorLatest || !dealsData) {
          setDealsError(dealsErrorLatest?.message ?? "Failed to load deals.");
          setDeals([]);
          setDealsLoading(false);
          return;
        }

        // Fetch appointments for this patient to link to deals in "Appointment Set" stage
        const { data: appointmentsData } = await supabaseClient
          .from("appointments")
          .select("id, patient_id, start_time, end_time, status, reason, location")
          .eq("patient_id", patientId)
          .order("start_time", { ascending: false });

        // Get the most recent appointment for the patient
        const latestAppointment = appointmentsData?.[0] as DealAppointment | undefined;

        // Attach appointment to deals in "Appointment Set" or "Operation Scheduled" stages
        const appointmentStages = stagesData?.filter(
          (s: DealStage) => s.name.toLowerCase().includes("appointment set") || s.name.toLowerCase().includes("operation scheduled")
        ) || [];
        const appointmentStageIds = new Set(appointmentStages.map((s: DealStage) => s.id));
        const dealsWithAppointments = (dealsData as Deal[]).map(deal => {
          if (appointmentStageIds.has(deal.stage_id) && latestAppointment) {
            return { ...deal, appointment: latestAppointment };
          }
          return deal;
        });

        setDeals(dealsWithAppointments);
        setDealsLoading(false);
      } catch {
        if (!isMounted) return;
        setDealsError("Failed to load deals.");
        setDeals([]);
        setDealsLoading(false);
      }
    }

    loadDeals();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  // Load all deals assigned to the current user for navigation
  useEffect(() => {
    let isMounted = true;

    async function loadAllUserDeals() {
      if (!currentUserId) return;

      try {
        setAllUserDealsLoading(true);

        // Fetch all deals where the current user is the owner
        const { data: userDealsData, error: userDealsError } = await supabaseClient
          .from("deals")
          .select(`
            id, patient_id, stage_id, service_id, pipeline, contact_label, location, title, value, notes, owner_id, owner_name, created_at, updated_at,
            patients:patient_id (first_name, last_name)
          `)
          .eq("owner_id", currentUserId)
          .order("updated_at", { ascending: false });

        if (!isMounted) return;

        if (userDealsError || !userDealsData) {
          setAllUserDeals([]);
          setAllUserDealsLoading(false);
          return;
        }

        // Map deals with patient names
        const dealsWithPatientNames = userDealsData.map((deal: any) => ({
          ...deal,
          patient_name: deal.patients 
            ? `${deal.patients.first_name || ""} ${deal.patients.last_name || ""}`.trim() 
            : "Unknown Patient",
        }));

        setAllUserDeals(dealsWithPatientNames);
        setAllUserDealsLoading(false);
      } catch {
        if (!isMounted) return;
        setAllUserDeals([]);
        setAllUserDealsLoading(false);
      }
    }

    loadAllUserDeals();

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  // Load all tasks assigned to the current user for navigation with date filter
  useEffect(() => {
    let isMounted = true;

    async function loadAllUserTasks() {
      if (!currentUserId) return;

      try {
        setAllUserTasksLoading(true);

        // Fetch all tasks where the current user is assigned
        const { data: userTasksData, error: userTasksError } = await supabaseClient
          .from("tasks")
          .select(`
            id, patient_id, name, content, status, priority, type, activity_date, created_by_user_id, created_by_name, assigned_user_id, assigned_user_name, created_at, updated_at,
            patients:patient_id (first_name, last_name)
          `)
          .eq("assigned_user_id", currentUserId)
          .order("activity_date", { ascending: true });

        if (!isMounted) return;

        if (userTasksError || !userTasksData) {
          setAllUserTasks([]);
          setAllUserTasksLoading(false);
          return;
        }

        // Map tasks with patient names
        const tasksWithPatientNames = userTasksData.map((task: any) => ({
          ...task,
          patient_name: task.patients 
            ? `${task.patients.first_name || ""} ${task.patients.last_name || ""}`.trim() 
            : "Unknown Patient",
        }));

        setAllUserTasks(tasksWithPatientNames);
        setAllUserTasksLoading(false);
      } catch {
        if (!isMounted) return;
        setAllUserTasks([]);
        setAllUserTasksLoading(false);
      }
    }

    loadAllUserTasks();

    return () => {
      isMounted = false;
    };
  }, [currentUserId]);

  useEffect(() => {
    let isMounted = true;

    async function loadTasksAndComments() {
      try {
        setTasksLoading(true);
        setTasksError(null);

        const { data: tasksData, error: tasksErrorLatest } = await supabaseClient
          .from("tasks")
          .select(
            "id, patient_id, name, content, status, priority, type, activity_date, created_by_user_id, created_by_name, assigned_user_id, assigned_user_name, created_at, updated_at",
          )
          .eq("patient_id", patientId)
          .order("activity_date", { ascending: false });

        if (!isMounted) return;

        if (tasksErrorLatest || !tasksData) {
          setTasksError(tasksErrorLatest?.message ?? "Failed to load tasks.");
          setTasks([]);
          setTaskCommentsByTaskId({});
          setTasksLoading(false);
          return;
        }

        const rows = tasksData as Task[];
        setTasks(rows);

        const taskIds = rows.map((task) => task.id);

        if (taskIds.length === 0) {
          setTaskCommentsByTaskId({});
          setTasksLoading(false);
          return;
        }

        const { data: commentsData, error: commentsError } = await supabaseClient
          .from("task_comments")
          .select(
            "id, task_id, author_user_id, author_name, body, created_at",
          )
          .in("task_id", taskIds)
          .order("created_at", { ascending: true });

        if (!isMounted) return;

        if (commentsError || !commentsData) {
          setTaskCommentsByTaskId({});
          setTasksLoading(false);
          return;
        }

        const byTask: Record<string, TaskComment[]> = {};

        for (const row of commentsData as TaskComment[]) {
          if (!byTask[row.task_id]) {
            byTask[row.task_id] = [];
          }
          byTask[row.task_id].push(row);
        }

        setTaskCommentsByTaskId(byTask);
        setTasksLoading(false);
      } catch {
        if (!isMounted) return;
        setTasksError("Failed to load tasks.");
        setTasks([]);
        setTaskCommentsByTaskId({});
        setTasksLoading(false);
      }
    }

    loadTasksAndComments();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  useEffect(() => {
    if (emails.length === 0) {
      setEmailAttachmentCounts([]);
      return;
    }

    let isMounted = true;

    async function loadAttachmentCounts() {
      try {
        const emailIds = emails.map((email) => email.id);

        const { data, error } = await supabaseClient
          .from("email_attachments")
          .select("email_id, id");

        if (!isMounted) return;

        if (error || !data) {
          setEmailAttachmentCounts([]);
          return;
        }

        const countsMap = new Map<string, number>();

        for (const row of data as { email_id: string; id: string }[]) {
          if (!emailIds.includes(row.email_id)) continue;
          countsMap.set(row.email_id, (countsMap.get(row.email_id) ?? 0) + 1);
        }

        const counts: EmailAttachmentCount[] = Array.from(countsMap.entries()).map(
          ([email_id, count]) => ({ email_id, count }),
        );

        setEmailAttachmentCounts(counts);
      } catch {
        if (!isMounted) return;
        setEmailAttachmentCounts([]);
      }
    }

    loadAttachmentCounts();

    return () => {
      isMounted = false;
    };
  }, [emails]);

  useEffect(() => {
    if (composeFromQueryHandled) return;

    const composeParam =
      searchParams.get("composeEmail") ?? searchParams.get("compose");
    if (!composeParam || emailModalOpen) return;

    if (composeParam === "1" || composeParam === "true" || composeParam === "email") {
      setActiveTab("emails");
      setEmailFilter("inbound");
      setEmailSaveError(null);
      setEmailTo((prev) => prev || defaultEmailTo);
      setEmailModalOpen(true);
      setComposeFromQueryHandled(true);
    }
  }, [searchParams, defaultEmailTo, emailModalOpen, composeFromQueryHandled]);

  useEffect(() => {
    if (createTaskFromQueryHandled) return;

    const createTaskParam = searchParams.get("createTask");
    if (!createTaskParam || createTaskModalOpen) return;

    if (
      createTaskParam === "1" ||
      createTaskParam === "true" ||
      createTaskParam === "task"
    ) {
      setActiveTab("tasks");
      setTaskSaveError(null);
      setEditTask(null);
      setTaskName("");
      setTaskContent("");
      setTaskActivityDate(formatDateTimeLocal(new Date()));
      setTaskAssignedUserId("");
      setTaskAssignedUserSearch("");
      setTaskAssignedUserDropdownOpen(false);
      setTaskPriority("medium");
      setTaskType("todo");
      setTaskSaveError(null);
      setCreateTaskModalOpen(true);
      setCreateTaskFromQueryHandled(true);
    }
  }, [searchParams, createTaskModalOpen, createTaskFromQueryHandled]);

  useEffect(() => {
    let isMounted = true;

    async function loadSignature() {
      try {
        const { data } = await supabaseClient.auth.getUser();
        if (!isMounted) return;
        const user = data.user;
        if (!user) return;

        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const sig = (meta["signature_html"] as string) || "";
        setEmailSignatureHtml(sig);
      } catch {
      }
    }

    loadSignature();

    return () => {
      isMounted = false;
    };
  }, []);

  // Handle Escape key to close email modal
  useEffect(() => {
    if (!emailModalOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !emailSaving) {
        setEmailModalOpen(false);
        setEmailFullscreen(false);
        setEmailSaveError(null);
        setEmailScheduleEnabled(false);
        setEmailScheduledFor("");
        setEmailAttachments([]);
        setEmailAttachmentsError(null);
        setUseSignature(true);
        setComposeFromQueryHandled(false);
        // Remove composeEmail query param to prevent modal from reopening
        router.replace(`/patients/${patientId}?m_tab=crm&crm_sub=emails`);
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [emailModalOpen, emailSaving, patientId, router]);

  useEffect(() => {
    if (!emailModalOpen || platformUsersLoaded) return;

    let isMounted = true;

    async function loadUsersAndSetDefault() {
      try {
        const response = await fetch("/api/users/list");
        if (response.ok) {
          const data = await response.json();
          if (!isMounted) return;
          setPlatformUsers(Array.isArray(data) ? data : []);
          setPlatformUsersLoaded(true);

          // Set default to logged-in user
          const { data: authData } = await supabaseClient.auth.getUser();
          const authUser = authData?.user;
          if (authUser && Array.isArray(data)) {
            const currentUser = data.find((u: any) => u.id === authUser.id);
            if (currentUser) {
              setEmailFollowUpAssignedUserId(currentUser.id);
              setEmailFollowUpAssignedUserSearch(currentUser.full_name || currentUser.email || "Me");
            }
          }
        }
      } catch {
      }
    }

    loadUsersAndSetDefault();

    return () => {
      isMounted = false;
    };
  }, [emailModalOpen, platformUsersLoaded]);

  useEffect(() => {
    if (!viewEmail) {
      setViewEmailAttachments([]);
      setViewEmailAttachmentsLoading(false);
      setViewEmailAttachmentsError(null);
      return;
    }

    const currentEmailId = viewEmail.id;
    let isMounted = true;

    async function loadAttachments() {
      try {
        setViewEmailAttachmentsLoading(true);
        setViewEmailAttachmentsError(null);

        const { data, error } = await supabaseClient
          .from("email_attachments")
          .select(
            "id, email_id, file_name, storage_path, mime_type, file_size",
          )
          .eq("email_id", currentEmailId);

        if (!isMounted) return;

        if (error || !data) {
          setViewEmailAttachments([]);
          if (error) {
            setViewEmailAttachmentsError("Failed to load attachments.");
          }
          setViewEmailAttachmentsLoading(false);
          return;
        }

        const attachments: EmailAttachment[] = (data as any[]).map((row) => {
          const path = (row.storage_path as string) || "";
          const { data: publicData } = supabaseClient.storage
            .from("email-attachments")
            .getPublicUrl(path);

          let size: number | null = null;
          const rawSize = (row.file_size ?? null) as number | string | null;
          if (typeof rawSize === "number") {
            size = rawSize;
          } else if (typeof rawSize === "string") {
            const parsed = Number(rawSize);
            size = Number.isFinite(parsed) ? parsed : null;
          }

          return {
            id: row.id as string,
            email_id: row.email_id as string,
            file_name: row.file_name as string,
            storage_path: path,
            mime_type: (row.mime_type as string | null) ?? null,
            file_size: size,
            public_url: publicData?.publicUrl ?? null,
          };
        });

        setViewEmailAttachments(attachments);
        setViewEmailAttachmentsLoading(false);
      } catch {
        if (!isMounted) return;
        setViewEmailAttachments([]);
        setViewEmailAttachmentsError("Failed to load attachments.");
        setViewEmailAttachmentsLoading(false);
      }
    }

    loadAttachments();

    return () => {
      isMounted = false;
    };
  }, [viewEmail]);

  useEffect(() => {
    if (!invoiceModalOpen) return;

    let isMounted = true;

    async function loadInvoices() {
      try {
        setInvoiceListLoading(true);
        setInvoiceListError(null);

        const { data, error } = await supabaseClient.storage
          .from("invoice-pdfs")
          .list(patientId, {
            limit: 100,
            sortBy: { column: "created_at", order: "desc" },
          });

        if (!isMounted) return;

        if (error) {
          setInvoiceListError("Failed to load invoices.");
          setInvoiceList([]);
          setInvoiceListLoading(false);
          return;
        }

        const invoices = (data || [])
          .filter((file) => file.name.endsWith(".pdf"))
          .map((file) => ({
            name: file.name,
            path: `${patientId}/${file.name}`,
            created_at: file.created_at || "",
          }));

        setInvoiceList(invoices);
        setInvoiceListLoading(false);
      } catch {
        if (!isMounted) return;
        setInvoiceListError("Failed to load invoices.");
        setInvoiceList([]);
        setInvoiceListLoading(false);
      }
    }

    loadInvoices();

    return () => {
      isMounted = false;
    };
  }, [invoiceModalOpen, patientId]);

  async function handleAttachInvoice(invoicePath: string, invoiceName: string) {
    try {
      setInvoiceAttaching(invoicePath);

      const { data, error } = await supabaseClient.storage
        .from("invoice-pdfs")
        .download(invoicePath);

      if (error || !data) {
        alert("Failed to download invoice.");
        setInvoiceAttaching(null);
        return;
      }

      const file = new File([data], invoiceName, { type: "application/pdf" });

      setEmailAttachments((prev) => {
        const exists = prev.some((f) => f.name === invoiceName);
        if (exists) return prev;
        return [...prev, file];
      });

      setInvoiceModalOpen(false);
      setInvoiceSearchQuery("");
      setInvoiceAttaching(null);
    } catch {
      alert("Failed to attach invoice.");
      setInvoiceAttaching(null);
    }
  }

  useEffect(() => {
    let isMounted = true;

    async function loadEmails() {
      try {
        setEmailsLoading(true);
        setEmailsError(null);

        const { data, error } = await supabaseClient
          .from("emails")
          .select(
            "id, to_address, from_address, subject, body, status, direction, sent_at, read_at, created_at",
          )
          .eq("patient_id", patientId)
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error || !data) {
          setEmailsError(error?.message ?? "Failed to load emails.");
          setEmails([]);
          setEmailsLoading(false);
          return;
        }

        setEmails(data as PatientEmail[]);
        setEmailsLoading(false);
      } catch {
        if (!isMounted) return;
        setEmailsError("Failed to load emails.");
        setEmails([]);
        setEmailsLoading(false);
      }
    }

    loadEmails();

    // Subscribe to real-time email updates for this patient
    const emailSubscription = supabaseClient
      .channel(`emails-${patientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "emails",
          filter: `patient_id=eq.${patientId}`,
        },
        (payload) => {
          const newEmail = payload.new as PatientEmail;
          // Add new email to the top of the list
          setEmails((prev) => [newEmail, ...prev.filter(e => e.id !== newEmail.id)]);
          
          // Show notification for inbound emails
          if (newEmail.direction === "inbound") {
            // Browser notification if permitted
            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              new Notification("New Email Reply", {
                body: `${newEmail.from_address}: ${newEmail.subject}`,
                icon: "/favicon.ico",
              });
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabaseClient.removeChannel(emailSubscription);
    };
  }, [patientId]);

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        const response = await fetch("/api/users/list");
        if (!response.ok) return;
        const json = (await response.json()) as PlatformUser[];
        if (!isMounted) return;
        setUserOptions(json);
      } catch {
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!patientId || userOptions.length === 0) return;

    let isMounted = true;

    async function loadMentions() {
      try {
        const { data, error } = await supabaseClient
          .from("patient_note_mentions")
          .select("note_id, mentioned_user_id, read_at")
          .eq("patient_id", patientId);

        if (!isMounted) return;

        if (error || !data) {
          setNoteMentionsByNoteId({});
          return;
        }

        const map: Record<string, NoteMentionSummary[]> = {};

        for (const row of data as {
          note_id: string;
          mentioned_user_id: string;
          read_at: string | null;
        }[]) {
          const user = Array.isArray(userOptions) 
            ? userOptions.find((u) => u.id === row.mentioned_user_id)
            : null;
          const name =
            (user?.full_name || user?.email || "User").toString();

          if (!map[row.note_id]) {
            map[row.note_id] = [];
          }

          map[row.note_id].push({
            mentioned_user_id: row.mentioned_user_id,
            mentioned_name: name,
            read_at: row.read_at,
          });
        }

        setNoteMentionsByNoteId(map);
      } catch {
        if (!isMounted) return;
        setNoteMentionsByNoteId({});
      }
    }

    loadMentions();

    return () => {
      isMounted = false;
    };
  }, [patientId, userOptions]);


  function handleNoteBodyChange(value: string) {
    setNoteBody(value);
    setNoteSaveError(null);

    const match = value.match(/@([^\s@]{0,50})$/);
    if (match) {
      setNoteMentionActive(true);
      setNoteMentionQuery(match[1].toLowerCase());
    } else if (noteMentionActive) {
      setNoteMentionActive(false);
      setNoteMentionQuery("");
    }
  }

  function handleNoteMentionSelect(user: PlatformUser) {
    const display =
      (user.full_name && user.full_name.length > 0
        ? user.full_name
        : user.email) || "User";

    const newBody = noteBody.replace(/@([^\s@]{0,50})$/, `@${display} `);
    setNoteBody(newBody);

    if (!noteMentionUserIds.includes(user.id)) {
      setNoteMentionUserIds((prev) => [...prev, user.id]);
    }

    setNoteMentionActive(false);
    setNoteMentionQuery("");
  }

  async function handleNoteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = noteBody.trim();
    if (!trimmed) {
      setNoteSaveError("Note cannot be empty.");
      return;
    }

    try {
      setNoteSaving(true);
      setNoteSaveError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setNoteSaveError("You must be logged in to create a note.");
        setNoteSaving(false);
        return;
      }

      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const fullName =
        [first, last].filter(Boolean).join(" ") || authUser.email || null;

      // Handle editing existing note
      if (editingNote) {
        const { data: updated, error: updateError } = await supabaseClient
          .from("patient_notes")
          .update({ body: trimmed })
          .eq("id", editingNote.id)
          .select("id, body, author_name, created_at")
          .single();

        if (updateError || !updated) {
          setNoteSaveError(updateError?.message ?? "Failed to update note.");
          setNoteSaving(false);
          return;
        }

        setNotes((prev) =>
          prev.map((n) => (n.id === updated.id ? (updated as PatientNote) : n))
        );
        setEditingNote(null);
        setNoteBody("");
        setNoteModalOpen(false);
        setNoteSaving(false);
        return;
      }

      // Create new note
      const { data: inserted, error: insertError } = await supabaseClient
        .from("patient_notes")
        .insert({
          patient_id: patientId,
          author_user_id: authUser.id,
          author_name: fullName,
          body: trimmed,
        })
        .select("id, body, author_name, created_at")
        .single();

      if (insertError || !inserted) {
        setNoteSaveError(insertError?.message ?? "Failed to save note.");
        setNoteSaving(false);
        return;
      }

      if (noteMentionUserIds.length > 0) {
        const rows = noteMentionUserIds.map((mentionedUserId) => ({
          note_id: inserted.id as string,
          patient_id: patientId,
          mentioned_user_id: mentionedUserId,
        }));

        await supabaseClient.from("patient_note_mentions").insert(rows);

        const noteId = inserted.id as string;
        const newSummaries: NoteMentionSummary[] = noteMentionUserIds.map(
          (mentionedUserId) => {
            const user = Array.isArray(userOptions)
              ? userOptions.find((u) => u.id === mentionedUserId)
              : null;
            const name =
              (user?.full_name || user?.email || "User").toString();
            return {
              mentioned_user_id: mentionedUserId,
              mentioned_name: name,
              read_at: null,
            };
          },
        );

        setNoteMentionsByNoteId((prev) => ({
          ...prev,
          [noteId]: [...(prev[noteId] ?? []), ...newSummaries],
        }));
      }

      setNotes((prev) => [inserted as PatientNote, ...prev]);
      setNoteBody("");
      setSelectedMentionIds([]);
      setMentionsOpen(false);
      setNoteMentionUserIds([]);
      setNoteMentionActive(false);
      setNoteMentionQuery("");
      setNoteModalOpen(false);
      setNoteSaving(false);
    } catch {
      setNoteSaveError("Unexpected error saving note.");
      setNoteSaving(false);
    }
  }

  // Function to start editing a note
  function handleEditNote(note: PatientNote) {
    setEditingNote(note);
    setNoteBody(note.body);
    setNoteSaveError(null);
    setNoteModalOpen(true);
  }

  // Function to mark note mention as read
  async function handleMarkNoteMentionAsRead(noteId: string, mentionedUserId: string) {
    if (!currentUserId || currentUserId !== mentionedUserId) return;

    const nowIso = new Date().toISOString();

    // Optimistic update
    setNoteMentionsByNoteId((prev) => {
      const mentions = prev[noteId] ?? [];
      return {
        ...prev,
        [noteId]: mentions.map((m) =>
          m.mentioned_user_id === mentionedUserId ? { ...m, read_at: nowIso } : m
        ),
      };
    });

    try {
      await supabaseClient
        .from("patient_note_mentions")
        .update({ read_at: nowIso })
        .eq("note_id", noteId)
        .eq("mentioned_user_id", mentionedUserId);
    } catch {
      // Revert on error - reload mentions
    }
  }

  // Auto-save note when switching tabs (if there's content)
  async function handleTabChange(newTab: ActivityTab) {
    // If we're leaving notes tab and have unsaved content, save it
    if (activeTab === "notes" && noteBody.trim() && !noteModalOpen) {
      try {
        const { data: authData } = await supabaseClient.auth.getUser();
        const authUser = authData?.user;
        if (authUser) {
          const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
          const first = (meta["first_name"] as string) || "";
          const last = (meta["last_name"] as string) || "";
          const fullName = [first, last].filter(Boolean).join(" ") || authUser.email || null;

          const { data: inserted } = await supabaseClient
            .from("patient_notes")
            .insert({
              patient_id: patientId,
              author_user_id: authUser.id,
              author_name: fullName,
              body: noteBody.trim(),
            })
            .select("id, body, author_name, created_at")
            .single();

          if (inserted) {
            setNotes((prev) => [inserted as PatientNote, ...prev]);
            setNoteBody("");
          }
        }
      } catch {
        // Silent fail - don't block tab change
      }
    }
    setActiveTab(newTab);
  }

  function handleTaskAssignedUserSearchChange(value: string) {
    setTaskAssignedUserSearch(value);
    setTaskAssignedUserDropdownOpen(value.trim().length > 0);
  }

  function handleTaskAssignedUserSelect(user: PlatformUser) {
    setTaskAssignedUserId(user.id);
    setTaskAssignedUserSearch(user.full_name || user.email || "Unnamed user");
    setTaskAssignedUserDropdownOpen(false);
  }

  function handleTaskAssignedUserClear() {
    setTaskAssignedUserId("");
    setTaskAssignedUserSearch("");
    setTaskAssignedUserDropdownOpen(false);
  }

  async function handleTaskSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const name = taskName.trim();
    const content = taskContent.trim();

    if (!name) {
      setTaskSaveError("Task name is required.");
      return;
    }

    try {
      setTaskSaving(true);
      setTaskSaveError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setTaskSaveError("You must be logged in to manage tasks.");
        setTaskSaving(false);
        return;
      }

      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const fullName =
        [first, last].filter(Boolean).join(" ") || authUser.email || null;

      const assignedUserId = taskAssignedUserId || null;
      let assignedUserName: string | null = null;
      if (assignedUserId) {
        const assignedUser = Array.isArray(userOptions)
          ? userOptions.find((u) => u.id === assignedUserId)
          : null;
        assignedUserName =
          (assignedUser?.full_name || assignedUser?.email || null) as
            | string
            | null;
      }

      const activityDateIso = taskActivityDate
        ? new Date(taskActivityDate).toISOString()
        : null;

      if (editTask) {
        const { data, error } = await supabaseClient
          .from("tasks")
          .update({
            name,
            content: content || null,
            status: editTask.status,
            priority: taskPriority,
            type: taskType,
            activity_date: activityDateIso,
            assigned_user_id: assignedUserId,
            assigned_user_name: assignedUserName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editTask.id)
          .select(
            "id, patient_id, name, content, status, priority, type, activity_date, created_by_user_id, created_by_name, assigned_user_id, assigned_user_name, created_at, updated_at",
          )
          .single();

        if (error || !data) {
          setTaskSaveError(error?.message ?? "Failed to update task.");
          setTaskSaving(false);
          return;
        }

        const updated = data as Task;
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      } else {
        const { data, error } = await supabaseClient
          .from("tasks")
          .insert({
            patient_id: patientId,
            name,
            content: content || null,
            status: "not_started" satisfies TaskStatus,
            priority: taskPriority,
            type: taskType,
            activity_date: activityDateIso,
            created_by_user_id: authUser.id,
            created_by_name: fullName,
            assigned_user_id: assignedUserId,
            assigned_user_name: assignedUserName,
          })
          .select(
            "id, patient_id, name, content, status, priority, type, activity_date, created_by_user_id, created_by_name, assigned_user_id, assigned_user_name, created_at, updated_at",
          )
          .single();

        if (error || !data) {
          setTaskSaveError(error?.message ?? "Failed to create task.");
          setTaskSaving(false);
          return;
        }

        const inserted = data as Task;
        setTasks((prev) => [inserted, ...prev]);
      }

      setTaskName("");
      setTaskContent("");
      setTaskActivityDate("");
      setTaskAssignedUserId("");
      setTaskAssignedUserSearch("");
      setTaskAssignedUserDropdownOpen(false);
      setTaskPriority("medium");
      setTaskType("todo");
      setEditTask(null);
      setCreateTaskModalOpen(false);
      setTaskSaving(false);
      router.replace(`/patients/${patientId}?tab=tasks`);
    } catch {
      setTaskSaveError("Unexpected error saving task.");
      setTaskSaving(false);
    }
  }

  async function handleTaskStatusToggle(task: Task, nextStatus: TaskStatus) {
    try {
      const { data, error } = await supabaseClient
        .from("tasks")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", task.id)
        .select(
          "id, patient_id, name, content, status, priority, type, activity_date, created_by_user_id, created_by_name, assigned_user_id, assigned_user_name, created_at, updated_at",
        )
        .single();

      if (error || !data) {
        return;
      }

      const updated = data as Task;
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    } catch {
    }
  }

  function handleDealServiceSearchChange(value: string) {
    setDealServiceSearch(value);
    setDealServiceDropdownOpen(value.trim().length > 0);
  }

  function handleDealServiceSelect(serviceId: string, serviceName: string) {
    setDealServiceId(serviceId);
    setDealServiceSearch(serviceName);
    setDealServiceDropdownOpen(false);
  }

  function handleDealServiceClear() {
    setDealServiceId("");
    setDealServiceSearch("");
    setDealServiceDropdownOpen(false);
  }

  function handleOpenCreateDeal() {
    setEditingDeal(null);
    setDealTitle("");
    setDealServiceId("");
    setDealServiceSearch("");
    setDealServiceDropdownOpen(false);
    setDealPipeline("Geneva");
    setDealContactLabel("Marketing");
    setDealLocation("Rhône");
    setDealNotes("");
    setDealOwnerId("");
    setDealOwnerSearch("");
    setDealOwnerDropdownOpen(false);

    const sortedStages = [...dealStages].sort(
      (a, b) => a.sort_order - b.sort_order,
    );
    const defaultStage =
      dealStages.find((stage) => stage.is_default) ?? sortedStages[0] ?? null;
    setDealStageId(defaultStage ? defaultStage.id : "");
    setDealSaveError(null);
    setDealModalOpen(true);
  }

  function handleOpenEditDeal(deal: Deal) {
    setEditingDeal(deal);
    setDealTitle(deal.title ?? "");
    setDealServiceId(deal.service_id ?? "");
    const selectedService = serviceOptions.find((s) => s.id === deal.service_id);
    setDealServiceSearch(selectedService?.name || "");
    setDealPipeline(deal.pipeline ?? "Geneva");
    setDealContactLabel(deal.contact_label ?? "Marketing");
    setDealLocation(deal.location ?? "Rhône");
    setDealNotes(deal.notes ?? "");
    setDealOwnerId(deal.owner_id ?? "");
    const selectedOwner = userOptions.find((u) => u.id === deal.owner_id);
    setDealOwnerSearch(selectedOwner?.full_name || selectedOwner?.email || deal.owner_name || "");
    setDealOwnerDropdownOpen(false);
    setDealStageId(deal.stage_id);
    setDealSaveError(null);
    setDealModalOpen(true);
  }

  function handleDealOwnerSearchChange(value: string) {
    setDealOwnerSearch(value);
    setDealOwnerDropdownOpen(value.trim().length > 0);
  }

  function handleDealOwnerSelect(userId: string, userName: string) {
    setDealOwnerId(userId);
    setDealOwnerSearch(userName);
    setDealOwnerDropdownOpen(false);
  }

  function handleDealOwnerClear() {
    setDealOwnerId("");
    setDealOwnerSearch("");
    setDealOwnerDropdownOpen(false);
  }

  // Deal navigation - get current deal index and navigate to prev/next
  function getCurrentDealIndex(dealId: string): number {
    return allUserDeals.findIndex((d) => d.id === dealId);
  }

  function handleNavigateToDeal(targetDeal: Deal & { patient_name?: string }) {
    if (!targetDeal.patient_id) return;
    // Navigate to the patient page with the deals tab open and highlight the deal
    const url = `/patients/${targetDeal.patient_id}?m_tab=crm&crm_sub=deals&highlight_deal=${targetDeal.id}`;
    router.push(url);
  }

  function handlePreviousDeal(currentDealId: string) {
    const currentIndex = getCurrentDealIndex(currentDealId);
    if (currentIndex <= 0) return;
    const prevDeal = allUserDeals[currentIndex - 1];
    if (prevDeal) handleNavigateToDeal(prevDeal);
  }

  function handleNextDeal(currentDealId: string) {
    const currentIndex = getCurrentDealIndex(currentDealId);
    if (currentIndex < 0 || currentIndex >= allUserDeals.length - 1) return;
    const nextDeal = allUserDeals[currentIndex + 1];
    if (nextDeal) handleNavigateToDeal(nextDeal);
  }

  // Task navigation - filter tasks by date and navigate
  function getFilteredUserTasks(): (Task & { patient_name?: string })[] {
    if (taskNavDateFilter === "all") return allUserTasks;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    return allUserTasks.filter((task) => {
      const taskDate = task.activity_date ? new Date(task.activity_date) : null;
      if (!taskDate) return false; // Tasks without dates excluded from filtered views

      if (taskNavDateFilter === "today") {
        return taskDate >= todayStart && taskDate <= todayEnd;
      } else if (taskNavDateFilter === "past") {
        return taskDate < todayStart;
      } else if (taskNavDateFilter === "future") {
        return taskDate > todayEnd;
      }
      return true;
    });
  }

  function getCurrentTaskIndex(taskId: string): number {
    const filtered = getFilteredUserTasks();
    return filtered.findIndex((t) => t.id === taskId);
  }

  function handleNavigateToTask(targetTask: Task & { patient_name?: string }) {
    if (!targetTask.patient_id) return;
    // Navigate to the patient page with the tasks tab open and highlight the task
    const url = `/patients/${targetTask.patient_id}?m_tab=crm&crm_sub=tasks&highlight_task=${targetTask.id}`;
    router.push(url);
  }

  function handlePreviousTask(currentTaskId: string) {
    const filtered = getFilteredUserTasks();
    const currentIndex = filtered.findIndex((t) => t.id === currentTaskId);
    if (currentIndex <= 0) return;
    const prevTask = filtered[currentIndex - 1];
    if (prevTask) handleNavigateToTask(prevTask);
  }

  function handleNextTask(currentTaskId: string) {
    const filtered = getFilteredUserTasks();
    const currentIndex = filtered.findIndex((t) => t.id === currentTaskId);
    if (currentIndex < 0 || currentIndex >= filtered.length - 1) return;
    const nextTask = filtered[currentIndex + 1];
    if (nextTask) handleNavigateToTask(nextTask);
  }

  async function handleDealSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const title = dealTitle.trim();
    if (!title) {
      setDealSaveError("Deal name is required.");
      return;
    }

    if (!dealStageId) {
      setDealSaveError("Stage is required.");
      return;
    }

    if (!dealServiceId) {
      setDealSaveError("Service is required.");
      return;
    }

    const pipeline = dealPipeline.trim() || "Geneva";
    const contactLabel = dealContactLabel.trim() || "Marketing";
    const location = dealLocation.trim() || "Rhône";
    const notes = dealNotes.trim();

    // Get owner name from selected user
    const ownerId = dealOwnerId || null;
    let ownerName: string | null = null;
    if (ownerId) {
      const selectedOwner = userOptions.find((u) => u.id === ownerId);
      ownerName = selectedOwner?.full_name || selectedOwner?.email || null;
    }

    try {
      setDealSaving(true);
      setDealSaveError(null);

      if (editingDeal) {
        const previousStageId = editingDeal.stage_id;

        const { data, error } = await supabaseClient
          .from("deals")
          .update({
            stage_id: dealStageId,
            service_id: dealServiceId,
            pipeline,
            contact_label: contactLabel,
            location,
            title,
            notes: notes || null,
            owner_id: ownerId,
            owner_name: ownerName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", editingDeal.id)
          .select(
            "id, patient_id, stage_id, service_id, pipeline, contact_label, location, title, value, notes, owner_id, owner_name, created_at, updated_at",
          )
          .single();

        if (error || !data) {
          setDealSaveError(error?.message ?? "Failed to update deal.");
          setDealSaving(false);
          return;
        }

        const updated = data as Deal;
        setDeals((prev) =>
          prev.map((existing) => (existing.id === updated.id ? updated : existing)),
        );

        if (previousStageId !== updated.stage_id) {
          // Check if the target stage is "Appointment Set" or "Operation Scheduled" to show the appointment modal
          const targetStage = dealStages.find((stage) => stage.id === updated.stage_id);
          const stageLower = targetStage?.name.toLowerCase() || "";
          if (targetStage && (stageLower.includes("appointment set") || stageLower.includes("operation scheduled"))) {
            setAppointmentDeal(updated);
            setAppointmentPreviousStageId(previousStageId);
            setAppointmentModalOpen(true);
          }

          try {
            void fetch("/api/workflows/deal-stage-changed", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                dealId: updated.id,
                patientId,
                fromStageId: previousStageId,
                toStageId: updated.stage_id,
                pipeline: updated.pipeline,
              }),
            });
          } catch {
          }
        }
      } else {
        const { data, error } = await supabaseClient
          .from("deals")
          .insert({
            patient_id: patientId,
            stage_id: dealStageId,
            service_id: dealServiceId,
            pipeline,
            contact_label: contactLabel,
            location,
            title,
            notes: notes || null,
            owner_id: ownerId,
            owner_name: ownerName,
          })
          .select(
            "id, patient_id, stage_id, service_id, pipeline, contact_label, location, title, value, notes, owner_id, owner_name, created_at, updated_at",
          )
          .single();

        if (error || !data) {
          setDealSaveError(error?.message ?? "Failed to create deal.");
          setDealSaving(false);
          return;
        }

        const inserted = data as Deal;
        setDeals((prev) => [inserted, ...prev]);
        
        // Trigger workflow for new deal creation
        try {
          await fetch("/api/workflows/deal-stage-changed", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              dealId: inserted.id,
              patientId: patientId,
              fromStageId: null, // null indicates deal creation
              toStageId: dealStageId,
              pipeline: pipeline,
            }),
          });
        } catch (workflowErr) {
          console.error("Error triggering workflow for new deal:", workflowErr);
        }
      }

      setDealModalOpen(false);
      setEditingDeal(null);
      setDealTitle("");
      setDealNotes("");
      setDealStageId("");
      setDealServiceId("");
      setDealServiceSearch("");
      setDealServiceDropdownOpen(false);
      setDealPipeline("Geneva");
      setDealContactLabel("Marketing");
      setDealLocation("Rhône");
      setDealSaving(false);
    } catch {
      setDealSaveError("Unexpected error saving deal.");
      setDealSaving(false);
    }
  }

  async function handleDeleteDeal(dealId: string) {
    try {
      setDeletingDealId(dealId);

      const { error } = await supabaseClient
        .from("deals")
        .delete()
        .eq("id", dealId);

      if (error) {
        setDealsError(error.message ?? "Failed to delete deal.");
        setDeletingDealId(null);
        return;
      }

      setDeals((prev) => prev.filter((deal) => deal.id !== dealId));
      setDeletingDealId(null);
    } catch {
      setDealsError("Failed to delete deal.");
      setDeletingDealId(null);
    }
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

  function handleTaskCommentInputChange(taskId: string, value: string) {
    setTaskCommentInputs((prev) => ({ ...prev, [taskId]: value }));
    setTaskCommentErrors((prev) => ({ ...prev, [taskId]: null }));

    const match = value.match(/@([^\s@]{0,50})$/);
    if (match) {
      setActiveMentionTaskId(taskId);
      setActiveMentionQuery(match[1].toLowerCase());
    } else if (activeMentionTaskId === taskId) {
      setActiveMentionTaskId(null);
      setActiveMentionQuery("");
    }
  }

  function handleTaskMentionSelect(taskId: string, user: PlatformUser) {
    const display =
      (user.full_name && user.full_name.length > 0
        ? user.full_name
        : user.email) || "User";

    setTaskCommentInputs((prev) => {
      const current = prev[taskId] ?? "";
      const next = current.replace(/@([^\s@]{0,50})$/, `@${display} `);
      return {
        ...prev,
        [taskId]: next,
      };
    });

    setTaskCommentMentionUserIds((prev) => {
      const existing = prev[taskId] ?? [];
      if (existing.includes(user.id)) return prev;
      return {
        ...prev,
        [taskId]: [...existing, user.id],
      };
    });

    setActiveMentionTaskId(null);
    setActiveMentionQuery("");
    
    // Refocus the input after selecting a mention to prevent "kicking out"
    setTimeout(() => {
      const inputRef = taskCommentInputRefs.current[taskId];
      if (inputRef) {
        inputRef.focus();
      }
    }, 0);
  }

  async function handleTaskCommentSubmit(taskId: string) {
    const current = taskCommentInputs[taskId] ?? "";
    const trimmed = current.trim();
    if (!trimmed) {
      setTaskCommentErrors((prev) => ({
        ...prev,
        [taskId]: "Comment cannot be empty.",
      }));
      return;
    }

    try {
      setTaskCommentSavingIds((prev) => [...prev, taskId]);
      setTaskCommentErrors((prev) => ({ ...prev, [taskId]: null }));

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setTaskCommentErrors((prev) => ({
          ...prev,
          [taskId]: "You must be logged in to comment.",
        }));
        setTaskCommentSavingIds((prev) => prev.filter((id) => id !== taskId));
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
          task_id: taskId,
          author_user_id: authUser.id,
          author_name: fullName,
          body: trimmed,
        })
        .select("id, task_id, author_user_id, author_name, body, created_at")
        .single();

      if (insertError || !inserted) {
        setTaskCommentErrors((prev) => ({
          ...prev,
          [taskId]: insertError?.message ?? "Failed to save comment.",
        }));
        setTaskCommentSavingIds((prev) => prev.filter((id) => id !== taskId));
        return;
      }

      const comment = inserted as TaskComment;
      setTaskCommentsByTaskId((prev) => ({
        ...prev,
        [taskId]: [...(prev[taskId] ?? []), comment],
      }));

      const mentionedUserIds = taskCommentMentionUserIds[taskId] ?? [];
      if (mentionedUserIds.length > 0) {
        const rows = mentionedUserIds.map((mentionedUserId) => ({
          task_comment_id: comment.id,
          task_id: taskId,
          mentioned_user_id: mentionedUserId,
        }));

        try {
          await supabaseClient.from("task_comment_mentions").insert(rows);
        } catch {
        }
      }

      setTaskCommentInputs((prev) => ({ ...prev, [taskId]: "" }));
      setTaskCommentMentionUserIds((prev) => ({ ...prev, [taskId]: [] }));
      setActiveMentionTaskId((prev) => (prev === taskId ? null : prev));
      setActiveMentionQuery("");
      setTaskCommentSavingIds((prev) => prev.filter((id) => id !== taskId));
    } catch {
      setTaskCommentErrors((prev) => ({
        ...prev,
        [taskId]: "Failed to save comment.",
      }));
      setTaskCommentSavingIds((prev) => prev.filter((id) => id !== taskId));
    }
  }

  async function handleEmailAiGenerate() {
    const description = emailAiDescription.trim();
    if (!description) {
      setEmailAiError("Please describe the email you want to generate.");
      return;
    }

    try {
      setEmailAiLoading(true);
      setEmailAiError(null);

      const response = await fetch("/api/patients/generate-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          patientId,
          description,
          tone: emailAiTone,
        }),
      });

      const data = (await response.json()) as {
        subject?: string;
        body?: string;
        error?: string;
      };

      if (!response.ok) {
        setEmailAiError(data?.error ?? "Failed to generate email.");
        return;
      }

      if (data.subject && data.subject.trim().length > 0) {
        setEmailSubject(data.subject.trim());
      }

      if (data.body && data.body.trim().length > 0) {
        setEmailBody(data.body.trim());
      }
    } catch {
      setEmailAiError("Unexpected error generating email.");
    } finally {
      setEmailAiLoading(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Guard against double submission
    if (emailSaving) return;

    const toAddress = emailTo.trim();
    const subject = emailSubject.trim();
    const body = emailBody.trim();

    if (!toAddress || !subject || !body) {
      setEmailSaveError("To, subject, and body are required.");
      return;
    }

    if (emailScheduleEnabled) {
      const raw = emailScheduledFor.trim();
      if (!raw) {
        setEmailSaveError("Please choose a scheduled date and time.");
        return;
      }
      const parsed = new Date(raw);
      if (!parsed || Number.isNaN(parsed.getTime())) {
        setEmailSaveError("Scheduled date/time is invalid.");
        return;
      }
    }

    try {
      setEmailSaving(true);
      setEmailSaveError(null);

      const { data: authData } = await supabaseClient.auth.getUser();
      const authUser = authData?.user;
      if (!authUser) {
        setEmailSaveError("You must be logged in to send an email.");
        setEmailSaving(false);
        return;
      }

      const fromAddress = authUser.email ?? null;
      const fromName = authUser.user_metadata?.full_name || 
                       [authUser.user_metadata?.first_name, authUser.user_metadata?.last_name].filter(Boolean).join(" ") ||
                       null;

      let resolvedStatus: EmailStatus = "sent";
      let resolvedSentAt: string | null = null;

      if (emailScheduleEnabled) {
        const parsed = new Date(emailScheduledFor);
        const iso = parsed.toISOString();
        resolvedStatus = "queued";
        resolvedSentAt = iso;
      } else {
        const nowIso = new Date().toISOString();
        resolvedStatus = "sent";
        resolvedSentAt = nowIso;
      }

      // The body is now HTML from the rich text editor, so we use it directly.
      // Append the user's HTML signature if enabled.
      let finalBody = body;
      if (useSignature && emailSignatureHtml.trim()) {
        finalBody = `${body}<br /><br />${emailSignatureHtml.trim()}`;
      }

      const { data: inserted, error: insertError } = await supabaseClient
        .from("emails")
        .insert({
          patient_id: patientId,
          to_address: toAddress,
          from_address: fromAddress,
          subject,
          body: finalBody,
          direction: "outbound" satisfies EmailDirection,
          status: resolvedStatus,
          sent_at: resolvedSentAt,
        })
        .select(
          "id, to_address, from_address, subject, body, status, direction, sent_at, read_at, created_at",
        )
        .single();

      if (insertError || !inserted) {
        setEmailSaveError(insertError?.message ?? "Failed to save email.");
        setEmailSaving(false);
        return;
      }

      const insertedEmail = inserted as PatientEmail;

      if (emailAttachments.length > 0) {
        let lastAttachmentError: string | null = null;

        for (const file of emailAttachments) {
          try {
            const ext = file.name.split(".").pop() || "bin";
            const safeName = file.name.replace(/[^a-zA-Z0-9.\-]+/g, "_");
            const path = `${authUser.id}/${insertedEmail.id}/${Date.now()}.${ext}-${safeName}`;

            const { error: uploadError } = await supabaseClient.storage
              .from("email-attachments")
              .upload(path, file, { upsert: false });

            if (uploadError) {
              lastAttachmentError = uploadError.message || "Failed to upload attachment.";
              continue;
            }

            const { error: attachError } = await supabaseClient
              .from("email_attachments")
              .insert({
                email_id: insertedEmail.id,
                file_name: file.name,
                storage_path: path,
                mime_type: file.type || null,
                file_size: file.size,
              });

            if (attachError) {
              lastAttachmentError = attachError.message;
            }
          } catch (error) {
            lastAttachmentError = "Unexpected error uploading attachment.";
          }
        }

        if (lastAttachmentError) {
          setEmailAttachmentsError(
            `Email saved but some attachments failed to upload: ${lastAttachmentError}`,
          );
        } else {
          setEmailAttachmentsError(null);
        }
      } else {
        setEmailAttachmentsError(null);
      }

      try {
        const response = await fetch("/api/emails/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: toAddress,
            subject,
            html: finalBody,
            fromUserEmail: fromAddress,
            fromUserName: fromName,
            emailId: insertedEmail.id,
            patientId: patientId,
          }),
        });

        let payload: { ok?: boolean; messageId?: string } | null = null;
        try {
          payload = await response.json();
        } catch {
        }

        console.log("/api/emails/send response", response.status, payload);

        // Store Message-ID from Mailgun for reply tracking
        if (payload?.messageId) {
          await supabaseClient
            .from("emails")
            .update({ message_id: payload.messageId })
            .eq("id", insertedEmail.id);
        }

        if (!response.ok) {
          setEmailSaveError(
            "Email saved internally but failed to send via email provider.",
          );
        }
      } catch (error) {
        console.error("Network error calling /api/emails/send", error);
        setEmailSaveError(
          "Email saved internally but failed to send via email provider.",
        );
      }

      // Create follow-up task if requested
      if (emailCreateFollowUpTask) {
        try {
          let followUpDate: Date | null = null;
          
          if (emailFollowUpDate === "3days") {
            followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + 3);
          } else if (emailFollowUpDate === "1week") {
            followUpDate = new Date();
            followUpDate.setDate(followUpDate.getDate() + 7);
          } else if (emailFollowUpDate === "custom" && emailFollowUpCustomDate) {
            followUpDate = new Date(emailFollowUpCustomDate);
          }

          if (followUpDate && !Number.isNaN(followUpDate.getTime())) {
            const { data: newTask } = await supabaseClient.from("tasks").insert({
              patient_id: patientId,
              name: `Follow up on: ${subject || "Email"}`,
              content: `Follow up regarding email sent on ${formatSwissDate(new Date())}`,
              type: "email",
              priority: "medium",
              status: "not_started",
              activity_date: followUpDate.toISOString(),
              assigned_user_id: emailFollowUpAssignedUserId || authUser.id,
              assigned_user_name: emailFollowUpAssignedUserSearch || null,
              created_by_user_id: authUser.id,
              created_by_name: fromName,
            }).select().single();

            // Add task to the list if successful
            if (newTask) {
              setTasks((prev) => [newTask as Task, ...prev]);
            }
          }
        } catch (error) {
          console.error("Failed to create follow-up task", error);
        }
      }

      setEmails((prev) => [insertedEmail, ...prev.filter(e => e.id !== insertedEmail.id)]);
      setEmailTo(defaultEmailTo);
      setEmailSubject("");
      setEmailBody("");
      setEmailScheduleEnabled(false);
      setEmailScheduledFor("");
      setEmailAttachments([]);
      setEmailCreateFollowUpTask(false);
      setEmailFollowUpDate("3days");
      setEmailFollowUpCustomDate("");
      setEmailModalOpen(false);
      setEmailFullscreen(false);
      setUseSignature(true);
      setEmailSaving(false);
    } catch {
      setEmailSaveError("Unexpected error saving email.");
      setEmailSaving(false);
    }
  }

  function toggleMention(id: string) {
    setSelectedMentionIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  async function handleRefresh() {
    try {
      setNotesLoading(true);
      setEmailsLoading(true);
      setNotesError(null);
      setEmailsError(null);

      const { data: notesData, error: notesError } = await supabaseClient
        .from("patient_notes")
        .select("id, body, author_name, created_at")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (notesError || !notesData) {
        setNotesError(notesError?.message ?? "Failed to load notes.");
        setNotes([]);
      } else {
        setNotes(notesData as PatientNote[]);
      }

      const { data: mentionsData, error: mentionsError } = await supabaseClient
        .from("patient_note_mentions")
        .select("note_id, mentioned_user_id, read_at")
        .eq("patient_id", patientId);

      if (!mentionsError && mentionsData) {
        const map: Record<string, NoteMentionSummary[]> = {};

        for (const row of mentionsData as {
          note_id: string;
          mentioned_user_id: string;
          read_at: string | null;
        }[]) {
          const user = Array.isArray(userOptions)
            ? userOptions.find((u) => u.id === row.mentioned_user_id)
            : null;
          const name =
            (user?.full_name || user?.email || "User").toString();

          if (!map[row.note_id]) {
            map[row.note_id] = [];
          }

          map[row.note_id].push({
            mentioned_user_id: row.mentioned_user_id,
            mentioned_name: name,
            read_at: row.read_at,
          });
        }

        setNoteMentionsByNoteId(map);
      }

      const { data: emailsData, error: emailsErrorLatest } = await supabaseClient
        .from("emails")
        .select(
          "id, to_address, from_address, subject, body, status, direction, sent_at, read_at, created_at",
        )
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });

      if (emailsErrorLatest || !emailsData) {
        setEmailsError(emailsErrorLatest?.message ?? "Failed to load emails.");
        setEmails([]);
      } else {
        setEmails(emailsData as PatientEmail[]);
      }
    } catch {
      setNotesError("Failed to refresh activity.");
      setEmailsError((prev) => prev ?? "Failed to refresh emails.");
    } finally {
      setNotesLoading(false);
      setEmailsLoading(false);
    }
  }

  const createdDate = createdAt ? new Date(createdAt) : null;
  const createdLabel =
    createdDate && !Number.isNaN(createdDate.getTime())
      ? formatSwissDateTime(createdDate)
      : null;

  const todayDateLabel = formatDateOnly(new Date());

  const dealCreateDateValue = editingDeal
    ? (() => {
        if (!editingDeal.created_at) return todayDateLabel;
        const date = new Date(editingDeal.created_at);
        if (Number.isNaN(date.getTime())) return todayDateLabel;
        return formatDateOnly(date);
      })()
    : todayDateLabel;

  const sortedNotes =
    sortOrder === "desc" ? notes : [...notes].slice().reverse();
  const sortedEmailsAll =
    sortOrder === "desc" ? emails : [...emails].slice().reverse();

  const filteredEmails =
    emailFilter === "all"
      ? emails
      : emailFilter === "scheduled"
        ? emails.filter((email) => email.status === "queued")
        : emails.filter((email) => email.direction === emailFilter);

  const sortedEmails =
    sortOrder === "desc"
      ? filteredEmails
      : [...filteredEmails].slice().reverse();

  const viewEmailTimestampLabel =
    viewEmail && (viewEmail.sent_at || viewEmail.created_at)
      ? (() => {
          const ts = viewEmail.sent_at ?? viewEmail.created_at;
          const date = ts ? new Date(ts) : null;
          if (!date || Number.isNaN(date.getTime())) return null;
          return formatSwissDateTime(date);
        })()
      : null;

  const tabs: { key: ActivityTab; label: string }[] = [
    { key: "activity", label: "Activity" },
    { key: "notes", label: "Notes" },
    { key: "emails", label: "Emails" },
    { key: "whatsapp", label: "Whatsapp" },
    { key: "tasks", label: "Tasks" },
    { key: "deals", label: "Deals" },
  ];

  return (

    <div className="mt-4 flex min-h-[60vh] flex-col space-y-3 rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1">
          <input
            type="text"
            placeholder="Search activity..."
            className="w-full rounded-full border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
          />
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-end justify-between gap-2 text-xs">
        {!hideTabNavigation && (
          <div className="flex flex-wrap gap-1 border-b border-slate-200/80 pb-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTabChange(tab.key)}
                className={
                  "relative px-3 py-1.5 text-[11px] font-medium transition-colors rounded-t-lg border border-b-0 " +
                  (activeTab === tab.key
                    ? "bg-white text-slate-900 border-slate-200 shadow-sm"
                    : "bg-slate-50/60 text-slate-500 border-transparent hover:bg-white hover:text-slate-900")
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}
        <div className={`flex items-center gap-2 ${hideTabNavigation ? "flex-1 justify-end" : ""}`}>
          {activeTab === "notes" && (
            <button
              type="button"
              onClick={() => setNoteModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-500 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600"
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
              <span>Create note</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleRefresh}
            disabled={notesLoading}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span className="inline-flex h-3 w-3 items-center justify-center">
              <svg
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 4v4h4" />
                <path d="M4 8a6 6 0 1 1 6 6 5.8 5.8 0 0 1-4.24-1.76" />
              </svg>
            </span>
            <span>{notesLoading ? "Refreshing..." : "Refresh"}</span>
          </button>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-500">
        <span className="hidden sm:inline">Sort</span>
        <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 px-1 py-0.5">
          <button
            type="button"
            onClick={() => setSortOrder("desc")}
            className={
              "rounded-full px-2 py-0.5 text-[11px] " +
              (sortOrder === "desc"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            Newest
          </button>
          <button
            type="button"
            onClick={() => setSortOrder("asc")}
            className={
              "rounded-full px-2 py-0.5 text-[11px] " +
              (sortOrder === "asc"
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:text-slate-900")
            }
          >
            Oldest
          </button>
        </div>
      </div>

      <div className="mt-3 flex-1 space-y-2 overflow-y-auto text-xs text-slate-700">
        {activeTab === "activity" && (
          <div className="space-y-2">
            <div className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[11px] text-emerald-900">
              <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <div>
                <p className="font-medium">
                  {createdBy
                    ? `Patient record created by ${createdBy}`
                    : "Patient record created"}
                </p>
                {createdLabel ? (
                  <p className="mt-0.5 text-[10px] text-emerald-700">
                    {createdLabel}
                  </p>
                ) : null}
                <p className="mt-1 text-[10px] text-emerald-800/80">
                  Patient ID: <span className="font-mono">{patientId}</span>
                </p>
              </div>
            </div>
            {(() => {
              const activityFeed = [
                ...notes.map((note) => ({
                  kind: "note" as const,
                  note,
                  timestamp: note.created_at ?? null,
                })),
                ...emails.map((email) => ({
                  kind: "email" as const,
                  email,
                  timestamp: email.sent_at ?? email.created_at ?? null,
                })),
                ...tasks.map((task) => ({
                  kind: "task" as const,
                  task,
                  timestamp:
                    task.activity_date ?? task.created_at ?? null,
                })),
                ...deals.map((deal) => ({
                  kind: "deal" as const,
                  deal,
                  timestamp: deal.created_at ?? null,
                })),
              ];

              const sortedActivity = [...activityFeed].sort((a, b) => {
                const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0;
                const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0;
                if (Number.isNaN(aTime) || Number.isNaN(bTime)) return 0;
                return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
              });

              if (sortedActivity.length === 0) {
                if (notesLoading || emailsLoading || tasksLoading) {
                  return (
                    <div className="mt-2 rounded-lg border border-emerald-400/40 bg-emerald-50/40 p-2 text-[11px] text-emerald-900 shadow-[0_16px_30px_rgba(16,185,129,0.35)] backdrop-blur-sm">
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-medium">Data is loading…</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-emerald-100/70">
                        <div className="h-full w-1/2 animate-pulse rounded-full bg-gradient-to-r from-emerald-400/90 via-emerald-300 to-emerald-500/95 shadow-[0_0_12px_rgba(16,185,129,0.8)]" />
                      </div>
                    </div>
                  );
                }

                return (
                  <p className="text-[11px] text-slate-500">
                    No activity yet for this patient.
                  </p>
                );
              }

              return (
                <div className="space-y-2">
                  {sortedActivity.map((item) => {
                    if (item.kind === "note") {
                      const note = item.note;
                      const noteDate = note.created_at
                        ? new Date(note.created_at)
                        : null;
                      const noteLabel =
                        noteDate && !Number.isNaN(noteDate.getTime())
                          ? formatSwissDateTime(noteDate)
                          : null;

                      const mentions = noteMentionsByNoteId[note.id] ?? [];

                      return (
                        <div
                          key={`note-${note.id}`}
                          className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-800"
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-slate-400" />
                          <div>
                            <p className="font-medium">
                              Note from {note.author_name || "Unknown"}
                            </p>
                            <p className="mt-0.5 whitespace-pre-wrap text-[11px] text-slate-700">
                              {note.body}
                            </p>
                            {noteLabel ? (
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                {noteLabel}
                              </p>
                            ) : null}
                            {mentions.length > 0 ? (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Mentions:{" "}
                                {mentions.map((m, index) => (
                                  <span
                                    key={`${m.mentioned_user_id}-${m.read_at ?? ""}`}
                                  >
                                    <span className="font-medium">
                                      {m.mentioned_name}
                                    </span>
                                    <span
                                      className={
                                        "ml-1 inline-block h-1.5 w-1.5 rounded-full " +
                                        (m.read_at
                                          ? "bg-emerald-500"
                                          : "bg-sky-500")
                                      }
                                      title={m.read_at ? "Read" : "Unread"}
                                    />
                                    {index < mentions.length - 1 ? (
                                      <span className="text-slate-400">, </span>
                                    ) : null}
                                  </span>
                                ))}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    if (item.kind === "email") {
                      const email = item.email;
                      const timestampRaw = email.sent_at ?? email.created_at;
                      const tsDate = timestampRaw ? new Date(timestampRaw) : null;
                      const tsLabel =
                        tsDate && !Number.isNaN(tsDate.getTime())
                          ? formatSwissDateTime(tsDate)
                          : null;

                      const isOutbound = email.direction === "outbound";

                      const preview = email.body
                        ? email.body
                            .replace(/<br\s*\/?>(?=\s*\n?)/gi, " ")
                            .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
                            .replace(/<[^>]+>/g, " ")
                            .replace(/\s+/g, " ")
                            .trim()
                        : "";

                      const attachCountEntry = emailAttachmentCounts.find(
                        (entry) => entry.email_id === email.id,
                      );
                      const attachCount = attachCountEntry?.count ?? 0;

                      return (
                        <button
                          key={`email-${email.id}`}
                          type="button"
                          onClick={() => setViewEmail(email)}
                          className="flex w-full items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-800 shadow-sm transition hover:border-sky-200 hover:bg-slate-50"
                        >
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span
                                className={
                                  "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium " +
                                  (isOutbound
                                    ? "bg-sky-100 text-sky-700"
                                    : "bg-emerald-100 text-emerald-700")
                                }
                              >
                                {isOutbound ? "Outbox" : "Inbox"}
                              </span>
                              <span className="max-w-[220px] truncate text-[11px] font-medium text-slate-900 sm:max-w-xs">
                                {email.subject}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500">
                              To <span className="font-medium">{email.to_address}</span>
                              {email.from_address ? (
                                <>
                                  {" "}• From {""}
                                  <span className="font-medium">{email.from_address}</span>
                                </>
                              ) : null}
                            </p>
                            <p className="line-clamp-1 text-[11px] text-slate-700">
                              {preview || " "}
                            </p>
                            {attachCount > 0 ? (
                              <p className="mt-0.5 text-[9px] text-slate-500">
                                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-1.5 py-0.5">
                                  <span>📎</span>
                                  <span>{attachCount}</span>
                                </span>
                              </p>
                            ) : null}
                          </div>
                          {tsLabel ? (
                            <p className="shrink-0 text-[10px] text-slate-400">
                              {tsLabel}
                            </p>
                          ) : null}
                        </button>
                      );
                    }

                    if (item.kind === "deal") {
                      const deal = item.deal;
                      const dealDate = deal.created_at
                        ? new Date(deal.created_at)
                        : null;
                      const dealLabel =
                        dealDate && !Number.isNaN(dealDate.getTime())
                          ? formatSwissDateTime(dealDate)
                          : null;

                      const stage = dealStages.find(
                        (candidate) => candidate.id === deal.stage_id,
                      );

                      const pipelineLabel = deal.pipeline || "Geneva";
                      const contactLabel = deal.contact_label || "Marketing";
                      const locationLabel = deal.location || "Rhône";

                      const service = serviceOptions.find(
                        (candidate) => candidate.id === (deal.service_id ?? ""),
                      );
                      const serviceLabel = service?.name ?? "Not set";

                      return (
                        <div
                          key={`deal-${deal.id}`}
                          className="flex items-start gap-2 rounded-lg border border-sky-100 bg-sky-50/80 px-3 py-2 text-[11px] text-slate-800"
                        >
                          <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-sky-500" />
                          <div>
                            <p className="font-medium">
                              Deal created: {deal.title || "Untitled deal"}
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-600">
                              Pipeline: <span className="font-medium">{pipelineLabel}</span>
                              {" "}| Stage: {" "}
                              <span className="font-medium">
                                {stage ? stage.name : "Unknown"}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-600">
                              Service: {" "}
                              <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                {serviceLabel}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-600">
                              Contact label: <span className="font-medium">{contactLabel}</span>
                              {" "}| Location: {" "}
                              <span className="font-medium">{locationLabel}</span>
                            </p>
                            {dealLabel ? (
                              <p className="mt-0.5 text-[10px] text-slate-400">
                                {dealLabel}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      );
                    }

                    const task = item.task;
                    const taskTimestampRaw =
                      task.activity_date ?? task.created_at ?? null;
                    const taskDate = taskTimestampRaw
                      ? new Date(taskTimestampRaw)
                      : null;
                    const taskLabel =
                      taskDate && !Number.isNaN(taskDate.getTime())
                        ? formatSwissDateTime(taskDate)
                        : null;

                    const statusLabel =
                      task.status === "completed"
                        ? "Completed"
                        : task.status === "in_progress"
                          ? "In Progress"
                          : "Not Started";

                    const priorityLabel =
                      task.priority === "high"
                        ? "High"
                        : task.priority === "low"
                          ? "Low"
                          : "Medium";

                    const assignedLabel =
                      task.assigned_user_name || "Unassigned";

                    return (
                      <div
                        key={`task-activity-${task.id}`}
                        className="flex items-start gap-2 rounded-lg border border-emerald-100 bg-emerald-50/80 px-3 py-2 text-[11px] text-emerald-900"
                      >
                        <span className="mt-0.5 h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        <div className="space-y-0.5">
                          <p className="font-semibold">
                            Task: {task.name}
                          </p>
                          <p className="text-[10px] text-emerald-800">
                            Status {" "}
                            <span className="font-medium">{statusLabel}</span>
                            {" "}• Type {" "}
                            <span className="font-medium capitalize">
                              {task.type}
                            </span>
                            {" "}• Priority {" "}
                            <span className="font-medium capitalize">
                              {priorityLabel}
                            </span>
                          </p>
                          <p className="text-[10px] text-emerald-800">
                            Created by {" "}
                            <span className="font-medium">
                              {task.created_by_name || "Unknown"}
                            </span>
                            {" "}• Assigned to {" "}
                            <span className="font-medium">{assignedLabel}</span>
                          </p>
                          {taskLabel ? (
                            <p className="text-[10px] text-emerald-700">
                              Activity Date {" "}
                              <span className="font-medium">{taskLabel}</span>
                            </p>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
        {activeTab === "notes" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                Internal notes about this patient. Use the @ button to mention teammates.
              </p>
            </div>

            {notesLoading ? (
              <p className="text-[11px] text-slate-500">Loading notes...</p>
            ) : notesError ? (
              <p className="text-[11px] text-red-600">{notesError}</p>
            ) : sortedNotes.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No notes yet. Create the first note for this patient.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedNotes.map((note) => {
                  const noteDate = note.created_at
                    ? new Date(note.created_at)
                    : null;
                  const noteLabel =
                    noteDate && !Number.isNaN(noteDate.getTime())
                      ? formatSwissDateTime(noteDate)
                      : null;

                  const mentions = noteMentionsByNoteId[note.id] ?? [];

                  return (
                    <div
                      key={note.id}
                      className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-800"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <p className="font-medium">
                            {note.author_name || "Unknown"}
                          </p>
                          <p className="mt-0.5 whitespace-pre-wrap text-slate-700">
                            {note.body}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => handleEditNote(note)}
                            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-800"
                            title="Edit note"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                            </svg>
                            Edit
                          </button>
                          {noteLabel ? (
                            <span className="text-[10px] text-slate-400">
                              {noteLabel}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      {mentions.length > 0 ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2">
                          <p className="text-[10px] text-slate-500">
                            Mentions:{" "}
                            {mentions.map((m, index) => (
                              <span
                                key={`${m.mentioned_user_id}-${m.read_at ?? ""}`}
                              >
                                <span className="font-medium">
                                  {m.mentioned_name}
                                </span>
                                <span
                                  className={
                                    "ml-1 inline-block h-1.5 w-1.5 rounded-full " +
                                    (m.read_at
                                      ? "bg-emerald-500"
                                      : "bg-sky-500")
                                  }
                                  title={m.read_at ? "Read" : "Unread"}
                                />
                                {index < mentions.length - 1 ? (
                                  <span className="text-slate-400">, </span>
                                ) : null}
                              </span>
                            ))}
                          </p>
                          {/* Show Mark as Read button if current user is mentioned and hasn't read */}
                          {currentUserId && mentions.some((m) => m.mentioned_user_id === currentUserId && !m.read_at) ? (
                            <button
                              type="button"
                              onClick={() => handleMarkNoteMentionAsRead(note.id, currentUserId)}
                              className="inline-flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9px] font-medium text-sky-700 hover:bg-sky-100"
                            >
                              <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                              </svg>
                              Mark as Read
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === "emails" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                Emails associated with this patient. Compose emails here.
              </p>
              <button
                type="button"
                onClick={() => {
                  setEmailSaveError(null);
                  setEmailTo((prev) => prev || defaultEmailTo);
                  setEmailModalOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
              >
                <span className="inline-flex h-3 w-3 items-center justify-center">
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 4h12v12H4z" />
                    <path d="M5 7l5 4 5-4" />
                  </svg>
                </span>
                <span>Compose email</span>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 text-[11px] text-slate-500">
              <span className="hidden sm:inline">Filter</span>
              <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 px-1 py-0.5">
                <button
                  type="button"
                  onClick={() => setEmailFilter("all")}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] " +
                    (emailFilter === "all"
                      ? "bg-slate-900 text-white shadow-sm"
                      : "text-slate-600 hover:text-slate-900")
                  }
                >
                  All
                </button>
                <button
                  type="button"
                  onClick={() => setEmailFilter("inbound")}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] " +
                    (emailFilter === "inbound"
                      ? "bg-emerald-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-emerald-700")
                  }
                >
                  📥 Received
                </button>
                <button
                  type="button"
                  onClick={() => setEmailFilter("outbound")}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] " +
                    (emailFilter === "outbound"
                      ? "bg-sky-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-sky-700")
                  }
                >
                  📤 Sent
                </button>
                <button
                  type="button"
                  onClick={() => setEmailFilter("scheduled")}
                  className={
                    "rounded-full px-2 py-0.5 text-[11px] " +
                    (emailFilter === "scheduled"
                      ? "bg-amber-600 text-white shadow-sm"
                      : "text-slate-600 hover:text-amber-700")
                  }
                >
                  ⏱ Scheduled
                </button>
              </div>
            </div>

            {emailsLoading ? (
              <p className="text-[11px] text-slate-500">Loading emails...</p>
            ) : emailsError ? (
              <p className="text-[11px] text-red-600">{emailsError}</p>
            ) : sortedEmails.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No emails yet. Compose the first email for this patient.
              </p>
            ) : (
              <div className="space-y-2">
                {sortedEmails.map((email, index) => {
                  const timestampRaw = email.sent_at ?? email.created_at;
                  const tsDate = timestampRaw ? new Date(timestampRaw) : null;
                  const tsLabel =
                    tsDate && !Number.isNaN(tsDate.getTime())
                      ? formatSwissDateTime(tsDate)
                      : null;

                  // CRITICAL: direction field determines inbox vs outbox
                  // outbound = sent BY the clinic (manual compose or automation)
                  // inbound = received FROM the patient (replies via webhook)
                  const isOutbound = email.direction === "outbound";
                  const isInbound = email.direction === "inbound";

                  const preview = email.body
                    ? email.body
                        .replace(/<br\s*\/?>(?=\s*\n?)/gi, " ")
                        .replace(/<\/(p|div|li|tr|h[1-6])>/gi, " ")
                        .replace(/<[^>]+>/g, " ")
                        .replace(/\s+/g, " ")
                        .trim()
                    : "";

                  const attachCountEntry = emailAttachmentCounts.find(
                    (entry) => entry.email_id === email.id,
                  );
                  const attachCount = attachCountEntry?.count ?? 0;

                  return (
                    <button
                      key={`${email.id}-${index}`}
                      type="button"
                      onClick={() => setViewEmail(email)}
                      className={`w-full rounded-lg border-2 px-3 py-2 text-left text-[11px] shadow-sm transition hover:shadow-md ${
                        isOutbound
                          ? "border-sky-200 bg-sky-50/60 hover:border-sky-300 hover:bg-sky-50"
                          : "border-emerald-200 bg-emerald-50/60 hover:border-emerald-300 hover:bg-emerald-50"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            {/* Direction badge with icon */}
                            <span
                              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isOutbound
                                  ? "bg-sky-500 text-white"
                                  : "bg-emerald-500 text-white"
                              }`}
                            >
                              {isOutbound ? (
                                <>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                  </svg>
                                  SENT
                                </>
                              ) : (
                                <>
                                  <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                                  </svg>
                                  RECEIVED
                                </>
                              )}
                            </span>
                            <span className="font-medium text-slate-900 truncate max-w-[200px] sm:max-w-xs">
                              {email.subject}
                            </span>
                          </div>
                          {/* Show different info based on direction */}
                          <p className="text-[10px] text-slate-600">
                            {isOutbound ? (
                              <>
                                <span className="font-medium text-sky-700">To:</span>{" "}
                                <span className="font-medium">{email.to_address}</span>
                                {email.from_address && (
                                  <span className="text-slate-400"> • From: {email.from_address}</span>
                                )}
                              </>
                            ) : (
                              <>
                                <span className="font-medium text-emerald-700">From:</span>{" "}
                                <span className="font-medium">{email.from_address || "Unknown"}</span>
                                <span className="text-slate-400"> • To: {email.to_address}</span>
                              </>
                            )}
                          </p>
                        </div>
                        {tsLabel ? (
                          <p className="shrink-0 text-[10px] text-slate-500 font-medium">
                            {tsLabel}
                          </p>
                        ) : null}
                      </div>
                      <p className="mt-1.5 line-clamp-2 text-[11px] text-slate-700">
                        {preview || " "}
                      </p>
                      <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                        {attachCount > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-1.5 py-0.5 text-[9px] text-slate-600">
                            <span>📎</span>
                            <span>{attachCount}</span>
                          </span>
                        )}
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                          email.status === "read" ? "bg-emerald-100 text-emerald-700" :
                          email.status === "failed" ? "bg-red-100 text-red-700" :
                          email.status === "queued" ? "bg-amber-100 text-amber-700" :
                          "bg-slate-100 text-slate-600"
                        }`}>
                          {email.status === "read" ? "✓ Read" :
                           email.status === "failed" ? "✗ Failed" :
                           email.status === "queued" ? "⏱ Scheduled" :
                           "● Sent"}
                        </span>
                        {email.read_at && (
                          <span className="text-[9px] text-emerald-600">
                            Opened {formatSwissDate(email.read_at)}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        {activeTab === "whatsapp" && (
          <WhatsAppWebConversation
            patientPhone={patientPhone}
            patientName={patientName}
          />
        )}
        {activeTab === "tasks" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                Tasks and follow-ups related to this patient.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-slate-50/80 px-1 py-0.5 text-[11px] text-slate-500">
                  <button
                    type="button"
                    onClick={() => setTaskStatusFilter("open")}
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] " +
                      (taskStatusFilter === "open"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900")
                    }
                  >
                    Not Started
                  </button>
                  <button
                    type="button"
                    onClick={() => setTaskStatusFilter("completed")}
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] " +
                      (taskStatusFilter === "completed"
                        ? "bg-slate-900 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-900")
                    }
                  >
                    Completed
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditTask(null);
                    setTaskName("");
                    setTaskContent("");
                    setTaskActivityDate(formatDateTimeLocal(new Date()));
                    setTaskAssignedUserId("");
                    setTaskPriority("medium");
                    setTaskType("todo");
                    setTaskSaveError(null);
                    setCreateTaskModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
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
              </div>
            </div>

            {tasksLoading ? (
              <p className="text-[11px] text-slate-500">Loading tasks...</p>
            ) : tasksError ? (
              <p className="text-[11px] text-red-600">{tasksError}</p>
            ) : (() => {
              const openTasks = tasks.filter(
                (task) => task.status !== "completed",
              );
              const completedTasks = tasks.filter(
                (task) => task.status === "completed",
              );

              const visible =
                taskStatusFilter === "open" ? openTasks : completedTasks;

              const sortedTasks = [...visible].sort((a, b) => {
                const aTime = a.activity_date
                  ? new Date(a.activity_date).getTime()
                  : 0;
                const bTime = b.activity_date
                  ? new Date(b.activity_date).getTime()
                  : 0;
                return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
              });

              if (sortedTasks.length === 0) {
                return (
                  <p className="text-[11px] text-slate-500">
                    No tasks in this view. Create the first task for this patient.
                  </p>
                );
              }

              return (
                <div className="space-y-3">
                  {sortedTasks.map((task) => {
                    const activityDate = task.activity_date
                      ? new Date(task.activity_date)
                      : null;
                    const activityLabel =
                      activityDate && !Number.isNaN(activityDate.getTime())
                        ? formatSwissDateTime(activityDate)
                        : null;

                    const statusLabel =
                      task.status === "completed"
                        ? "Completed"
                        : task.status === "in_progress"
                          ? "In Progress"
                          : "Not Started";

                    const priorityLabel =
                      task.priority === "high"
                        ? "high"
                        : task.priority === "low"
                          ? "low"
                          : "medium";

                    const priorityClasses =
                      task.priority === "high"
                        ? "border-rose-100 bg-rose-50 text-rose-700"
                        : task.priority === "low"
                          ? "border-emerald-100 bg-emerald-50 text-emerald-700"
                          : "border-amber-100 bg-amber-50 text-amber-700";

                    const comments = taskCommentsByTaskId[task.id] ?? [];
                    const commentInput = taskCommentInputs[task.id] ?? "";
                    const isSavingComment = taskCommentSavingIds.includes(
                      task.id,
                    );
                    const commentError = taskCommentErrors[task.id] ?? null;

                    const isMentionActive = activeMentionTaskId === task.id;
                    const mentionQuery = activeMentionQuery.trim();
                    const mentionOptions = isMentionActive
                      ? (Array.isArray(userOptions) ? userOptions : [])
                          .filter((u) => {
                            const hay = (
                              u.full_name || u.email || ""
                            ).toLowerCase();
                            return hay.includes(mentionQuery);
                          })
                          .slice(0, 6)
                      : [];

                    return (
                      <div
                        key={task.id}
                        id={`task-${task.id}`}
                        className={`rounded-lg border px-3 py-2 text-[11px] text-slate-800 shadow-sm transition-all duration-300 ${
                          highlightedTaskId === task.id
                            ? "border-sky-400 bg-sky-50 ring-2 ring-sky-300"
                            : "border-slate-200 bg-slate-50/80"
                        }`}
                      >
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="space-y-0.5">
                            <p className="text-[12px] font-semibold text-slate-900">
                              {task.name}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Status: <span className="font-medium">{statusLabel}</span>
                            </p>
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Type: <span className="font-medium capitalize">{task.type}</span>
                              {" "}| Priority:{" "}
                              <span
                                className={
                                  "ml-1 inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold capitalize " +
                                  priorityClasses
                                }
                              >
                                {priorityLabel}
                              </span>
                            </p>
                            {activityLabel ? (
                              <p className="mt-0.5 text-[10px] text-slate-500">
                                Activity Date: <span className="font-medium">{activityLabel}</span>
                              </p>
                            ) : null}
                            <p className="mt-0.5 text-[10px] text-slate-500">
                              Created by{" "}
                              <span className="font-medium">
                                {task.created_by_name || "Unknown"}
                              </span>
                              {" "}• Assigned to{" "}
                              <span className="font-medium">
                                {task.assigned_user_name || "Unassigned"}
                              </span>
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-1 text-[11px]">
                            {/* Task navigation arrows - only show if user is assigned to this task */}
                            {task.assigned_user_id === currentUserId && getFilteredUserTasks().length > 1 && (
                              <div className="flex items-center gap-1 mb-1">
                                <select
                                  value={taskNavDateFilter}
                                  onChange={(e) => setTaskNavDateFilter(e.target.value as "today" | "past" | "future" | "all")}
                                  className="rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] text-slate-600 focus:border-sky-500 focus:outline-none"
                                >
                                  <option value="today">Today</option>
                                  <option value="past">Past</option>
                                  <option value="future">Future</option>
                                  <option value="all">All</option>
                                </select>
                                <button
                                  type="button"
                                  onClick={() => handlePreviousTask(task.id)}
                                  disabled={getCurrentTaskIndex(task.id) <= 0}
                                  title="Previous task"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                                  </svg>
                                </button>
                                <span className="text-[9px] text-slate-400 min-w-[32px] text-center">
                                  {getCurrentTaskIndex(task.id) >= 0 ? getCurrentTaskIndex(task.id) + 1 : "-"}/{getFilteredUserTasks().length}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleNextTask(task.id)}
                                  disabled={getCurrentTaskIndex(task.id) >= getFilteredUserTasks().length - 1}
                                  title="Next task"
                                  className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                                  </svg>
                                </button>
                              </div>
                            )}
                            <div className="flex gap-1">
                              <button
                                type="button"
                                onClick={() => {
                                  setEditTask(task);
                                  setTaskName(task.name);
                                  setTaskContent(task.content ?? "");
                                  setTaskPriority(task.priority);
                                  setTaskType(task.type);
                                  const assignedUser = Array.isArray(userOptions)
                                    ? userOptions.find((u) => u.id === task.assigned_user_id)
                                    : null;
                                  setTaskAssignedUserId(
                                    task.assigned_user_id ?? "",
                                  );
                                  setTaskAssignedUserSearch(
                                    assignedUser ? (assignedUser.full_name || assignedUser.email || "Unnamed user") : "",
                                  );
                                  setTaskActivityDate(
                                    task.activity_date
                                      ? formatDateTimeLocal(
                                          new Date(task.activity_date),
                                        )
                                      : "",
                                  );
                                  setTaskSaveError(null);
                                  setCreateTaskModalOpen(true);
                                }}
                                className="inline-flex items-center gap-1 rounded-full border border-emerald-200/80 bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-emerald-600"
                              >
                                <span>Edit</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleTaskStatusToggle(
                                    task,
                                    task.status === "completed"
                                      ? "not_started"
                                      : "completed",
                                  )
                                }
                                className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-800 shadow-sm hover:bg-slate-300"
                              >
                                <span>
                                  {task.status === "completed" ? "Reopen" : "Set Complete"}
                                </span>
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="mt-2 border-t border-slate-200 pt-2">
                          <p className="mb-1 text-[10px] font-semibold text-slate-600">
                            Comments
                          </p>
                          {comments.length === 0 ? (
                            <p className="text-[10px] text-slate-400">
                              No comments yet.
                            </p>
                          ) : (
                            <div className="space-y-1.5">
                              {comments.map((comment) => {
                                const cDate = comment.created_at
                                  ? new Date(comment.created_at)
                                  : null;
                                const cLabel =
                                  cDate && !Number.isNaN(cDate.getTime())
                                    ? formatSwissDate(cDate)
                                    : null;

                                return (
                                  <div
                                    key={comment.id}
                                    className="rounded-md bg-white/80 px-2 py-1 text-[10px] text-slate-800"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div>
                                        <p className="font-medium">
                                          {comment.author_name || "Unknown"}
                                        </p>
                                        <p className="mt-0.5 whitespace-pre-wrap">
                                          {renderTextWithMentions(comment.body)}
                                        </p>
                                      </div>
                                      {cLabel ? (
                                        <p className="shrink-0 text-[9px] text-slate-400">
                                          {cLabel}
                                        </p>
                                      ) : null}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          <div className="mt-1">
                            <form
                              onSubmit={(event) => {
                                event.preventDefault();
                                void handleTaskCommentSubmit(task.id);
                              }}
                            >
                              <div className="relative flex items-center gap-1">
                                <input
                                  ref={(el) => { taskCommentInputRefs.current[task.id] = el; }}
                                  type="text"
                                  value={commentInput}
                                  onChange={(event) =>
                                    handleTaskCommentInputChange(
                                      task.id,
                                      event.target.value,
                                    )
                                  }
                                  placeholder="Add a comment... Use @ to mention."
                                  className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                                  disabled={isSavingComment}
                                />
                                <button
                                  type="submit"
                                  disabled={isSavingComment}
                                  className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-sky-200/80 bg-sky-600 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                                >
                                  {isSavingComment ? "…" : ">"}
                                </button>
                              </div>
                              {commentError ? (
                                <p className="mt-0.5 text-[10px] text-red-600">
                                  {commentError}
                                </p>
                              ) : null}

                              {isMentionActive && mentionOptions.length > 0 ? (
                                <div className="mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow">
                                  {mentionOptions.map((user) => {
                                    const display =
                                      user.full_name ||
                                      user.email ||
                                      "Unnamed user";
                                    return (
                                      <button
                                        key={user.id}
                                        type="button"
                                        onClick={() =>
                                          handleTaskMentionSelect(task.id, user)
                                        }
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
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
        {activeTab === "deals" && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-[11px] text-slate-500">
                Deals and opportunities related to this patient.
              </p>
              <button
                type="button"
                onClick={handleOpenCreateDeal}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
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
                <span>Create Deal</span>
              </button>
            </div>

            {dealsLoading ? (
              <p className="text-[11px] text-slate-500">Loading deals...</p>
            ) : dealsError ? (
              <p className="text-[11px] text-red-600">{dealsError}</p>
            ) : deals.length === 0 ? (
              <p className="text-[11px] text-slate-500">
                No deals yet. Create the first deal for this patient.
              </p>
            ) : (
              <div className="space-y-3">
                {deals.map((deal) => {
                  const stage = dealStages.find(
                    (candidate) => candidate.id === deal.stage_id,
                  );

                  const pipelineLabel = deal.pipeline || "Geneva";
                  const contactLabel = deal.contact_label || "Marketing";
                  const locationLabel = deal.location || "Rhône";

                  const service = serviceOptions.find(
                    (candidate) => candidate.id === (deal.service_id ?? ""),
                  );
                  const serviceLabel = service?.name ?? "Not set";

                  const created = deal.created_at
                    ? new Date(deal.created_at)
                    : null;
                  const createdLabelForDeal =
                    created && !Number.isNaN(created.getTime())
                      ? formatSwissDate(created)
                      : null;

                  return (
                    <div
                      key={deal.id}
                      id={`deal-${deal.id}`}
                      className={`flex flex-col gap-2 rounded-xl border px-3 py-2 text-[11px] text-slate-800 shadow-sm sm:flex-row sm:items-start sm:justify-between transition-all duration-300 ${
                        highlightedDealId === deal.id
                          ? "border-sky-400 bg-sky-50 ring-2 ring-sky-300"
                          : "border-slate-200 bg-slate-50/80"
                      }`}
                    >
                      <div className="space-y-1">
                        <p className="text-[12px] font-semibold text-slate-900">
                          {deal.title || "Untitled deal"}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Pipeline:</span> {" "}
                          {pipelineLabel}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Stage:</span> {" "}
                          {stage ? stage.name : "Unknown"}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Services:</span>{" "}
                          {serviceLabel === "Not set" ? (
                            <span className="text-slate-400">Not set</span>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                              {serviceLabel}
                            </span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Contact Label:</span> {" "}
                          {contactLabel}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Contact Owner:</span> {" "}
                          <span className="font-medium text-emerald-700">{contactOwnerName || "—"}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Deal Owner:</span> {" "}
                          <span className="font-medium text-sky-700">{deal.owner_name || "—"}</span>
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Location:</span> {" "}
                          {locationLabel}
                        </p>
                        <p className="text-[11px] text-slate-600">
                          <span className="font-semibold">Created Date:</span> {" "}
                          {createdLabelForDeal || "—"}
                        </p>
                        {/* Show appointment details for "Appointment Set" stage */}
                        {deal.appointment && (
                          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2">
                            <div className="flex items-center gap-1.5 text-emerald-700">
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                              </svg>
                              <span className="text-[10px] font-semibold">Appointment Scheduled</span>
                            </div>
                            <p className="mt-1 text-[10px] text-emerald-600">
                              {formatSwissShortDate(deal.appointment.start_time)}{" "}
                              at{" "}
                              {formatSwissTime(deal.appointment.start_time)}
                            </p>
                            {deal.appointment.location && (
                              <p className="text-[9px] text-emerald-500">
                                📍 {deal.appointment.location}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-2 self-end sm:self-start">
                        {/* Deal navigation arrows - only show if user owns this deal */}
                        {deal.owner_id === currentUserId && allUserDeals.length > 1 && (
                          <>
                            <button
                              type="button"
                              onClick={() => handlePreviousDeal(deal.id)}
                              disabled={getCurrentDealIndex(deal.id) <= 0}
                              title="Previous deal"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className="sr-only">Previous deal</span>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                              </svg>
                            </button>
                            <span className="text-[9px] text-slate-400 min-w-[40px] text-center">
                              {getCurrentDealIndex(deal.id) + 1}/{allUserDeals.length}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleNextDeal(deal.id)}
                              disabled={getCurrentDealIndex(deal.id) >= allUserDeals.length - 1}
                              title="Next deal"
                              className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              <span className="sr-only">Next deal</span>
                              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                              </svg>
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => handleOpenEditDeal(deal)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                        >
                          <span className="sr-only">Edit deal</span>
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M2.5 11a8.5 8.5 0 0 1 15 0" />
                            <circle cx="10" cy="11" r="3" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteDeal(deal.id)}
                          disabled={deletingDealId === deal.id}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-red-100 bg-red-50 text-red-600 shadow-sm hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <span className="sr-only">Delete deal</span>
                          <svg
                            className="h-3.5 w-3.5"
                            viewBox="0 0 20 20"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.6"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M4 6h12" />
                            <path d="M8 6V4h4v2" />
                            <path d="M6 6v10a2 2 0 0 0 2 2h4a2 2 0 0 0 2-2V6" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {noteModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className="w-full max-w-md max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
            <h2 className="text-sm font-semibold text-slate-900">{editingNote ? "Edit note" : "New note"}</h2>
            <p className="mt-1 text-[11px] text-slate-500">
              {editingNote ? "Update this note." : "Write an internal note about this patient. Use the @ button to mention teammates."}
            </p>
            <form onSubmit={handleNoteSubmit} className="mt-3 space-y-3">
              <div className="relative">
                <textarea
                  value={noteBody}
                  onChange={(event) => handleNoteBodyChange(event.target.value)}
                  rows={4}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="Write a note... Use @ to mention."
                />
                {noteMentionActive && (() => {
                  const mentionQuery = noteMentionQuery.trim();
                  const mentionOptions = (Array.isArray(userOptions) ? userOptions : [])
                    .filter((u) => {
                      const hay = (u.full_name || u.email || "").toLowerCase();
                      return hay.includes(mentionQuery);
                    })
                    .slice(0, 6);

                  if (mentionOptions.length === 0) return null;

                  return (
                    <div className="mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow">
                      {mentionOptions.map((user) => {
                        const display = user.full_name || user.email || "Unnamed user";
                        return (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleNoteMentionSelect(user)}
                            className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                          >
                            {display}
                          </button>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
              {noteSaveError ? (
                <p className="text-[11px] text-red-600">{noteSaveError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (noteSaving) return;
                    setNoteModalOpen(false);
                    setNoteSaveError(null);
                    setEditingNote(null);
                    setNoteBody("");
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={noteSaving}
                  className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {noteSaving ? "Saving..." : editingNote ? "Update note" : "Save note"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {createTaskModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className="w-full max-w-md max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
            <h2 className="text-sm font-semibold text-slate-900">
              {editTask ? "Edit Task" : "Create Task"}
            </h2>
            <form onSubmit={handleTaskSubmit} className="mt-3 space-y-3">
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Name
                </label>
                <input
                  type="text"
                  value={taskName}
                  onChange={(event) => setTaskName(event.target.value)}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter task name"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Type
                  </label>
                  <select
                    value={taskType}
                    onChange={(event) =>
                      setTaskType(event.target.value as TaskType)
                    }
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="todo">Todo</option>
                    <option value="call">Call</option>
                    <option value="email">Email</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Priority
                  </label>
                  <select
                    value={taskPriority}
                    onChange={(event) =>
                      setTaskPriority(event.target.value as TaskPriority)
                    }
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    User
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={taskAssignedUserSearch}
                      onChange={(event) => handleTaskAssignedUserSearchChange(event.target.value)}
                      placeholder="Search users..."
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 pr-7 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {taskAssignedUserId && (
                      <button
                        type="button"
                        onClick={handleTaskAssignedUserClear}
                        className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        ×
                      </button>
                    )}
                    {taskAssignedUserDropdownOpen && (() => {
                      const query = taskAssignedUserSearch.trim().toLowerCase();
                      const filteredUsers = (Array.isArray(userOptions) ? userOptions : [])
                        .filter((u) => {
                          const hay = (u.full_name || u.email || "").toLowerCase();
                          return hay.includes(query);
                        })
                        .slice(0, 6);

                      if (filteredUsers.length === 0) return null;

                      return (
                        <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                          {filteredUsers.map((user) => {
                            const display = user.full_name || user.email || "Unnamed user";
                            return (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => handleTaskAssignedUserSelect(user)}
                                className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                              >
                                {display}
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="block text-[11px] font-medium text-slate-700">
                    Activity Date
                  </label>
                  <input
                    type="datetime-local"
                    value={taskActivityDate}
                    onChange={(event) => setTaskActivityDate(event.target.value)}
                    className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="block text-[11px] font-medium text-slate-700">
                  Content
                </label>
                <textarea
                  value={taskContent}
                  onChange={(event) => setTaskContent(event.target.value)}
                  rows={3}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Enter task details..."
                />
              </div>
              {taskSaveError ? (
                <p className="text-[11px] text-red-600">{taskSaveError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (taskSaving) return;
                    setCreateTaskModalOpen(false);
                    setTaskSaveError(null);
                    setEditTask(null);
                    router.replace(`/patients/${patientId}?tab=tasks`);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={taskSaving}
                  className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {taskSaving ? "Saving..." : editTask ? "Update Task" : "Confirm"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {dealModalOpen ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className="w-full max-w-2xl max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-sm font-semibold text-slate-900">
                {editingDeal ? "Edit Deal" : "Create Deal"}
              </h2>
              <button
                type="button"
                onClick={() => {
                  if (dealSaving) return;
                  setDealModalOpen(false);
                  setEditingDeal(null);
                  setDealSaveError(null);
                }}
                className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 5l10 10" />
                  <path d="M15 5L5 15" />
                </svg>
              </button>
            </div>
            <form onSubmit={handleDealSubmit} className="mt-3 space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Deal Name
                    </label>
                    <input
                      type="text"
                      value={dealTitle}
                      onChange={(event) => setDealTitle(event.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="Describe the deal"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Description
                    </label>
                    <textarea
                      value={dealNotes}
                      onChange={(event) => setDealNotes(event.target.value)}
                      rows={4}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="Internal notes about this deal"
                    />
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Pipeline
                    </label>
                    <select
                      value={dealPipeline}
                      onChange={(event) => setDealPipeline(event.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="Geneva">Geneva</option>
                      <option value="Gstaad & Montreux">Gstaad & Montreux</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Stage
                    </label>
                    <select
                      value={dealStageId}
                      onChange={(event) => setDealStageId(event.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">Select stage</option>
                      {dealStages
                        .slice()
                        .sort((a, b) => a.sort_order - b.sort_order)
                        .map((stage) => (
                          <option key={stage.id} value={stage.id}>
                            {stage.name}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Services
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={dealServiceSearch}
                        onChange={(event) => handleDealServiceSearchChange(event.target.value)}
                        placeholder="Search services..."
                        className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 pr-7 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      {dealServiceId && (
                        <button
                          type="button"
                          onClick={handleDealServiceClear}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          ×
                        </button>
                      )}
                      {dealServiceDropdownOpen && (() => {
                        const query = dealServiceSearch.trim().toLowerCase();
                        const filteredServices = serviceOptions
                          .filter((s) => {
                            const hay = (s.name || "").toLowerCase();
                            return hay.includes(query);
                          })
                          .slice(0, 6);

                        if (filteredServices.length === 0) return null;

                        return (
                          <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                            {filteredServices.map((service) => (
                              <button
                                key={service.id}
                                type="button"
                                onClick={() => handleDealServiceSelect(service.id, service.name)}
                                className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                              >
                                {service.name}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Contact Label
                    </label>
                    <input
                      type="text"
                      value={dealContactLabel}
                      onChange={(event) => setDealContactLabel(event.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Location
                    </label>
                    <select
                      value={dealLocation}
                      onChange={(event) => setDealLocation(event.target.value)}
                      className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="Rhône">Rhône</option>
                      <option value="Champel">Champel</option>
                      <option value="Gstaad">Gstaad</option>
                      <option value="Montreux">Montreux</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Deal Owner
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={dealOwnerSearch}
                        onChange={(event) => handleDealOwnerSearchChange(event.target.value)}
                        placeholder="Search users..."
                        className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 pr-7 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      />
                      {dealOwnerId && (
                        <button
                          type="button"
                          onClick={handleDealOwnerClear}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          ×
                        </button>
                      )}
                      {dealOwnerDropdownOpen && (() => {
                        const query = dealOwnerSearch.trim().toLowerCase();
                        const filteredUsers = userOptions
                          .filter((u) => {
                            const name = (u.full_name || "").toLowerCase();
                            const email = (u.email || "").toLowerCase();
                            return name.includes(query) || email.includes(query);
                          })
                          .slice(0, 6);

                        if (filteredUsers.length === 0) return null;

                        return (
                          <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                            {filteredUsers.map((user) => (
                              <button
                                key={user.id}
                                type="button"
                                onClick={() => handleDealOwnerSelect(user.id, user.full_name || user.email || "Unnamed")}
                                className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                              >
                                {user.full_name || user.email || "Unnamed user"}
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-700">
                      Create Date
                    </label>
                    <input
                      type="text"
                      value={dealCreateDateValue}
                      readOnly
                      className="block w-full cursor-not-allowed rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-500 shadow-sm"
                    />
                  </div>
                </div>
              </div>

              {dealSaveError ? (
                <p className="text-[11px] text-red-600">{dealSaveError}</p>
              ) : null}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (dealSaving) return;
                    setDealModalOpen(false);
                    setEditingDeal(null);
                    setDealSaveError(null);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={dealSaving}
                  className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dealSaving
                    ? editingDeal
                      ? "Updating..."
                      : "Creating..."
                    : editingDeal
                      ? "Update Deal"
                      : "Save Deal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {viewEmail ? (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/40 backdrop-blur-sm py-6 sm:py-8">
          <div className={`w-full max-w-lg max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border-2 p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)] ${
            viewEmail.direction === "outbound"
              ? "border-sky-300 bg-gradient-to-b from-sky-50/95 to-white/95"
              : "border-emerald-300 bg-gradient-to-b from-emerald-50/95 to-white/95"
          }`}>
            <div className="flex items-start justify-between gap-2">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      viewEmail.direction === "outbound"
                        ? "bg-sky-500 text-white"
                        : "bg-emerald-500 text-white"
                    }`}
                  >
                    {viewEmail.direction === "outbound" ? (
                      <>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                        </svg>
                        SENT BY CLINIC
                      </>
                    ) : (
                      <>
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        RECEIVED FROM PATIENT
                      </>
                    )}
                  </span>
                </div>
                <h2 className="text-sm font-semibold text-slate-900 line-clamp-2">
                  {viewEmail.subject}
                </h2>
                <p className="text-[10px] text-slate-600">
                  {viewEmail.direction === "outbound" ? (
                    <>
                      <span className="font-medium text-sky-700">To:</span>{" "}
                      <span className="font-medium">{viewEmail.to_address}</span>
                      {viewEmail.from_address && (
                        <span className="text-slate-400"> • From: {viewEmail.from_address}</span>
                      )}
                    </>
                  ) : (
                    <>
                      <span className="font-medium text-emerald-700">From:</span>{" "}
                      <span className="font-medium">{viewEmail.from_address || "Unknown"}</span>
                      <span className="text-slate-400"> • To: {viewEmail.to_address}</span>
                    </>
                  )}
                </p>
                <p className="text-[10px] text-slate-500">
                  {viewEmailTimestampLabel ? (
                    <>
                      Sent at {" "}
                      <span className="font-medium">{viewEmailTimestampLabel}</span>
                    </>
                  ) : null}
                  {" "}• Status {" "}
                  <span className={`font-medium capitalize ${viewEmail.status === "read" ? "text-emerald-600" : viewEmail.status === "failed" ? "text-red-600" : ""}`}>{viewEmail.status}</span>
                  {viewEmail.read_at && (
                    <span className="ml-1 text-emerald-500">
                      (opened {formatSwissDateTime(viewEmail.read_at)})
                    </span>
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setViewEmail(null)}
                className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
              >
                <span className="sr-only">Close</span>
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 5l10 10" />
                  <path d="M15 5L5 15" />
                </svg>
              </button>
            </div>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-800">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Message
              </p>
              <div
                className="prose prose-xs max-w-none text-slate-800 [&_*]:text-[11px]"
                dangerouslySetInnerHTML={{ 
                  __html: viewEmail.direction === "inbound" 
                    ? stripEmailSignature(viewEmail.body, true) 
                    : viewEmail.body 
                }}
              />
            </div>
            <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[11px] text-slate-800">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Attachments
              </p>
              {viewEmailAttachmentsLoading ? (
                <p className="text-[10px] text-slate-500">Loading attachments...</p>
              ) : viewEmailAttachmentsError ? (
                <p className="text-[10px] text-red-600">{viewEmailAttachmentsError}</p>
              ) : viewEmailAttachments.length === 0 ? (
                <p className="text-[10px] text-slate-400">No attachments.</p>
              ) : (
                <ul className="space-y-1 text-[10px] text-slate-700">
                  {viewEmailAttachments.map((att) => {
                    const kb = att.file_size ? Math.round(att.file_size / 1024) : null;

                    return (
                      <li key={att.id} className="flex items-center justify-between gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-200 text-[9px] text-slate-700">
                            📎
                          </span>
                          {att.public_url ? (
                            <a
                              href={att.public_url}
                              target="_blank"
                              rel="noreferrer"
                              className="truncate text-[10px] text-sky-700 hover:underline"
                            >
                              {att.file_name}
                            </a>
                          ) : (
                            <span className="truncate">{att.file_name}</span>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-2 text-[9px] text-slate-500">
                          {kb !== null ? <span>{kb} KB</span> : null}
                          {att.mime_type ? <span className="hidden sm:inline">{att.mime_type}</span> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  // Reply to email - pre-fill compose modal
                  const replyTo = viewEmail.direction === "inbound" 
                    ? viewEmail.from_address 
                    : viewEmail.to_address;
                  const replySubject = viewEmail.subject?.startsWith("Re: ") 
                    ? viewEmail.subject 
                    : `Re: ${viewEmail.subject || ""}`;
                  
                  setEmailTo(replyTo || "");
                  setEmailSubject(replySubject);
                  setEmailBody("");
                  setEmailSaveError(null);
                  setEmailAttachments([]);
                  setEmailAttachmentsError(null);
                  setViewEmail(null);
                  setEmailModalOpen(true);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-50 px-3 py-1.5 text-[11px] font-medium text-sky-700 shadow-sm hover:bg-sky-100"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                </svg>
                Reply
              </button>
              <button
                type="button"
                onClick={() => {
                  // Create follow-up task from email
                  setTaskName(`Follow up: ${viewEmail.subject}`);
                  setTaskContent(`Follow-up task for email: "${viewEmail.subject}"\nFrom: ${viewEmail.from_address || "N/A"}\nTo: ${viewEmail.to_address}`);
                  setTaskType("email");
                  setTaskPriority("medium");
                  setEditTask(null);
                  setTaskSaveError(null);
                  setCreateTaskModalOpen(true);
                  setViewEmail(null);
                }}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200/80 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700 shadow-sm hover:bg-amber-100"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                </svg>
                Create Follow-up Task
              </button>
              <button
                type="button"
                onClick={() => setViewEmail(null)}
                className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {emailModalOpen && typeof document !== "undefined" ? createPortal(
        <div 
          className="fixed inset-0 z-[99999] flex items-start justify-center overflow-y-auto bg-slate-900/50 backdrop-blur-sm py-6 sm:py-8"
          onClick={(e) => {
            if (e.target === e.currentTarget && !emailSaving) {
              setEmailModalOpen(false);
              setEmailFullscreen(false);
              setEmailSaveError(null);
              setEmailScheduleEnabled(false);
              setEmailScheduledFor("");
              setEmailAttachments([]);
              setEmailAttachmentsError(null);
              setUseSignature(true);
              setComposeFromQueryHandled(false);
              // Remove composeEmail query param to prevent modal from reopening
              router.replace(`/patients/${patientId}?m_tab=crm&crm_sub=emails`);
            }
          }}
        >
          <div className={`w-full ${emailFullscreen ? "max-w-none m-0 h-full rounded-none" : "max-w-2xl mx-4"} max-h-[calc(100vh-3rem)] overflow-y-auto rounded-2xl border border-slate-200/80 bg-white p-5 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]`}>
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-semibold text-slate-900">Compose email</h2>
                <p className="mt-1 text-[11px] text-slate-500">
                  This will be recorded on the patient timeline.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setEmailFullscreen(!emailFullscreen)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  title={emailFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  {emailFullscreen ? (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5m0-4.5l5.25 5.25" />
                    </svg>
                  ) : (
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                    </svg>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (emailSaving) return;
                    setEmailModalOpen(false);
                    setEmailFullscreen(false);
                    setEmailSaveError(null);
                    setEmailScheduleEnabled(false);
                    setEmailScheduledFor("");
                    setEmailAttachments([]);
                    setEmailAttachmentsError(null);
                    setUseSignature(true);
                    setComposeFromQueryHandled(false);
                    // Remove composeEmail query param to prevent modal from reopening
                    router.replace(`/patients/${patientId}?m_tab=crm&crm_sub=emails`);
                  }}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-700"
                  title="Close"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <form onSubmit={handleEmailSubmit} className="mt-3 space-y-3">
              <div className="space-y-1">
                <label htmlFor="email_to" className="block text-[11px] font-medium text-slate-700">
                  To
                </label>
                <input
                  id="email_to"
                  type="email"
                  value={emailTo}
                  onChange={(event) => setEmailTo(event.target.value)}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="patient@example.com"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="email_subject" className="block text-[11px] font-medium text-slate-700">
                  Subject
                </label>
                <input
                  id="email_subject"
                  type="text"
                  value={emailSubject}
                  onChange={(event) => setEmailSubject(event.target.value)}
                  className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="Subject line"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="email_body" className="block text-[11px] font-medium text-slate-700">
                  Message
                </label>
                <RichTextEditor
                  value={emailBody}
                  onChange={setEmailBody}
                  placeholder="Write your email..."
                  className="shadow-sm"
                />
              </div>
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/80 p-2 text-[11px] text-slate-700">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-slate-800">Generate with AI</span>
                  <span className="text-[10px] text-slate-400">
                    Describe the email you want to send. The patient's details are included automatically.
                  </span>
                </div>
                <textarea
                  value={emailAiDescription}
                  onChange={(event) => setEmailAiDescription(event.target.value)}
                  rows={3}
                  placeholder="Describe the goal, key points, and context for this email..."
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <select
                    value={emailAiTone}
                    onChange={(event) => setEmailAiTone(event.target.value)}
                    className="h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px] text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="professional and reassuring">Professional & reassuring</option>
                    <option value="friendly and informal">Friendly & informal</option>
                    <option value="concise and to the point">Concise & to the point</option>
                  </select>
                  <button
                    type="button"
                    onClick={handleEmailAiGenerate}
                    disabled={emailAiLoading}
                    className="inline-flex items-center rounded-full border border-sky-500 bg-sky-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {emailAiLoading ? "Generating…" : "Generate with AI"}
                  </button>
                </div>
                {emailAiError ? (
                  <p className="text-[10px] text-red-600">{emailAiError}</p>
                ) : null}
              </div>
              <div className="space-y-1 text-[11px] text-slate-600">
                <div className="flex items-center gap-2">
                  <label className="inline-flex items-center">
                    <span className="rounded-full border border-slate-300/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 cursor-pointer">
                      Attach files
                      <input
                        type="file"
                        multiple
                        className="hidden"
                        onChange={(event: ChangeEvent<HTMLInputElement>) => {
                          const files = event.target.files
                            ? Array.from(event.target.files)
                            : [];
                          if (files.length === 0) return;

                          setEmailAttachments((prev) => {
                            const combined = [...prev, ...files];
                            const seen = new Set<string>();
                            const deduped: File[] = [];

                            for (const file of combined) {
                              const key = `${file.name}-${file.size}`;
                              if (seen.has(key)) continue;
                              seen.add(key);
                              deduped.push(file);
                            }

                            return deduped;
                          });
                        }}
                      />
                    </span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setInvoiceModalOpen(true)}
                    className="rounded-full border border-emerald-300/80 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700 shadow-sm hover:bg-emerald-100"
                  >
                    Attach Invoice
                  </button>
                  {emailAttachments.length > 0 ? (
                    <span className="text-[10px] text-slate-500">
                      {emailAttachments.length} file
                      {emailAttachments.length > 1 ? "s" : ""} selected
                    </span>
                  ) : null}
                </div>
                {emailAttachments.length > 0 ? (
                  <ul className="mt-1 max-h-20 space-y-0.5 overflow-y-auto text-[10px] text-slate-600">
                    {emailAttachments.map((file) => (
                      <li key={file.name} className="truncate">
                        {file.name}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {emailAttachmentsError ? (
                  <p className="text-[10px] text-red-600">{emailAttachmentsError}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-600">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    checked={useSignature}
                    onChange={(event) => setUseSignature(event.target.checked)}
                  />
                  <span>Use signature</span>
                </label>
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    checked={emailScheduleEnabled}
                    onChange={(event) => setEmailScheduleEnabled(event.target.checked)}
                  />
                  <span>Schedule send</span>
                  {emailScheduleEnabled && (
                    <input
                      type="datetime-local"
                      value={emailScheduledFor}
                      onChange={(event) => setEmailScheduledFor(event.target.value)}
                      className="ml-1 block rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  )}
                </label>
              </div>
              
              {/* Create Follow-up Task Section */}
              <div className="space-y-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 text-[11px]">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-3 w-3 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                    checked={emailCreateFollowUpTask}
                    onChange={(event) => setEmailCreateFollowUpTask(event.target.checked)}
                  />
                  <span className="font-medium text-emerald-800">Create Follow-up Task</span>
                </label>
                
                {emailCreateFollowUpTask && (
                  <div className="mt-2 space-y-2">
                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium text-emerald-700">Follow-up Date</label>
                      <div className="space-y-1">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="radio"
                            name="followUpDate"
                            value="3days"
                            checked={emailFollowUpDate === "3days"}
                            onChange={() => setEmailFollowUpDate("3days")}
                            className="h-3 w-3 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-slate-700">3 Days</span>
                        </label>
                        <label className="inline-flex items-center gap-2 ml-4">
                          <input
                            type="radio"
                            name="followUpDate"
                            value="1week"
                            checked={emailFollowUpDate === "1week"}
                            onChange={() => setEmailFollowUpDate("1week")}
                            className="h-3 w-3 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-slate-700">1 Week</span>
                        </label>
                        <label className="inline-flex items-center gap-2 ml-4">
                          <input
                            type="radio"
                            name="followUpDate"
                            value="custom"
                            checked={emailFollowUpDate === "custom"}
                            onChange={() => setEmailFollowUpDate("custom")}
                            className="h-3 w-3 border-slate-300 text-emerald-600 focus:ring-emerald-500"
                          />
                          <span className="text-slate-700">Custom Date</span>
                        </label>
                      </div>
                      {emailFollowUpDate === "custom" && (
                        <input
                          type="datetime-local"
                          value={emailFollowUpCustomDate}
                          onChange={(event) => setEmailFollowUpCustomDate(event.target.value)}
                          className="mt-1 block w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      <label className="block text-[10px] font-medium text-emerald-700">Assign To</label>
                      <div className="relative">
                        <input
                          type="text"
                          value={emailFollowUpAssignedUserSearch}
                          onChange={(event) => {
                            setEmailFollowUpAssignedUserSearch(event.target.value);
                            setEmailFollowUpUserDropdownOpen(true);
                            if (!event.target.value.trim()) {
                              setEmailFollowUpAssignedUserId("");
                            }
                          }}
                          onFocus={() => setEmailFollowUpUserDropdownOpen(true)}
                          placeholder="Search user..."
                          className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                        />
                        {emailFollowUpAssignedUserId && (
                          <button
                            type="button"
                            onClick={() => {
                              setEmailFollowUpAssignedUserId("");
                              setEmailFollowUpAssignedUserSearch("");
                            }}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {emailFollowUpUserDropdownOpen && platformUsers.length > 0 && (
                          <div className="absolute z-10 mt-1 w-full max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                            {platformUsers
                              .filter((user) => {
                                if (!emailFollowUpAssignedUserSearch.trim()) return true;
                                const search = emailFollowUpAssignedUserSearch.toLowerCase();
                                return (
                                  (user.full_name?.toLowerCase() || "").includes(search) ||
                                  (user.email?.toLowerCase() || "").includes(search)
                                );
                              })
                              .map((user) => (
                                <button
                                  key={user.id}
                                  type="button"
                                  onClick={() => {
                                    setEmailFollowUpAssignedUserId(user.id);
                                    setEmailFollowUpAssignedUserSearch(user.full_name || user.email || "");
                                    setEmailFollowUpUserDropdownOpen(false);
                                  }}
                                  className={`w-full px-3 py-1.5 text-left text-[11px] hover:bg-emerald-50 ${
                                    emailFollowUpAssignedUserId === user.id ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                                  }`}
                                >
                                  <div className="font-medium">{user.full_name || "Unnamed"}</div>
                                  {user.email && <div className="text-[10px] text-slate-500">{user.email}</div>}
                                </button>
                              ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {emailSaveError ? (
                <p className="text-[11px] text-red-600">{emailSaveError}</p>
              ) : null}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (emailSaving) return;
                    setEmailModalOpen(false);
                    setEmailFullscreen(false);
                    setEmailSaveError(null);
                    setEmailScheduleEnabled(false);
                    setEmailScheduledFor("");
                    setEmailAttachments([]);
                    setEmailAttachmentsError(null);
                    setUseSignature(true);
                    setComposeFromQueryHandled(false);
                    // Remove composeEmail query param to prevent modal from reopening
                    router.replace(`/patients/${patientId}?m_tab=crm&crm_sub=emails`);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={emailSaving}
                  className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {emailSaving ? "Sending..." : "Send email"}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Invoice Attachment Modal */}
      {invoiceModalOpen ? createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center bg-black/40 p-4">
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 p-4">
              <h3 className="text-sm font-semibold text-slate-800">Attach Invoice</h3>
              <button
                type="button"
                onClick={() => {
                  setInvoiceModalOpen(false);
                  setInvoiceSearchQuery("");
                }}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <input
                type="text"
                placeholder="Search invoices..."
                value={invoiceSearchQuery}
                onChange={(e) => setInvoiceSearchQuery(e.target.value)}
                className="mb-3 w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[12px] text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              {invoiceListLoading ? (
                <p className="py-4 text-center text-[11px] text-slate-500">Loading invoices...</p>
              ) : invoiceListError ? (
                <p className="py-4 text-center text-[11px] text-red-600">{invoiceListError}</p>
              ) : invoiceList.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-slate-500">No invoices found for this patient.</p>
              ) : (
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {invoiceList
                    .filter((inv) =>
                      invoiceSearchQuery
                        ? inv.name.toLowerCase().includes(invoiceSearchQuery.toLowerCase())
                        : true
                    )
                    .map((inv) => (
                      <li key={inv.path}>
                        <button
                          type="button"
                          onClick={() => handleAttachInvoice(inv.path, inv.name)}
                          disabled={invoiceAttaching === inv.path}
                          className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-[11px] text-slate-700 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60"
                        >
                          <span className="truncate">{inv.name}</span>
                          {invoiceAttaching === inv.path ? (
                            <span className="text-[10px] text-slate-400">Attaching...</span>
                          ) : (
                            <svg className="h-4 w-4 flex-shrink-0 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                            </svg>
                          )}
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      {/* Appointment Modal */}
      <AppointmentModal
        open={appointmentModalOpen}
        onClose={async () => {
          // Only revert deal stage on cancel if appointment wasn't successful
          if (!appointmentSuccessRef.current && appointmentDeal && appointmentPreviousStageId) {
            setDeals((prev) =>
              prev.map((deal) =>
                deal.id === appointmentDeal.id
                  ? { ...deal, stage_id: appointmentPreviousStageId }
                  : deal
              )
            );
            try {
              await supabaseClient
                .from("deals")
                .update({ stage_id: appointmentPreviousStageId, updated_at: new Date().toISOString() })
                .eq("id", appointmentDeal.id);
            } catch (err) {
              console.error("Failed to revert deal stage:", err);
            }
          }
          setAppointmentModalOpen(false);
          setAppointmentDeal(null);
          setAppointmentPreviousStageId(null);
          appointmentSuccessRef.current = false;
        }}
        onSuccess={() => {
          appointmentSuccessRef.current = true;
        }}
        onSubmit={async (data: AppointmentData) => {
          const response = await fetch("/api/appointments/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId: data.patientId,
              dealId: data.dealId,
              providerId: data.providerId,
              title: data.title,
              appointmentDate: data.appointmentDate,
              durationMinutes: data.durationMinutes,
              location: data.location,
              notes: data.notes,
              sendPatientEmail: data.sendPatientEmail,
              sendUserEmail: data.sendUserEmail,
              scheduleReminder: data.scheduleReminder,
              appointmentType: data.appointmentType,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to create appointment");
          }
        }}
        patientId={appointmentDeal?.patient_id || patientId}
        patientName="Patient"
        dealId={appointmentDeal?.id}
        dealTitle={appointmentDeal?.title}
        defaultType={
          appointmentDeal?.stage_id
            ? dealStages.find((s) => s.id === appointmentDeal.stage_id)?.name.toLowerCase().includes("operation")
              ? "operation"
              : "appointment"
            : "appointment"
        }
      />
    </div>
  );
}
