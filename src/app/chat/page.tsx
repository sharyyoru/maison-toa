"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import CollapseSidebarOnMount from "@/components/CollapseSidebarOnMount";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

type ChatConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  patient_id?: string | null;
  is_archived?: boolean;
  archived_at?: string | null;
};

type ChatPatientSuggestion = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

function formatPatientForDisplay(
  patient: ChatPatientSuggestion | null | undefined,
): string {
  if (!patient) return "";
  const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim();
  const email = (patient.email ?? "").trim();
  const phone = (patient.phone ?? "").trim();

  if (name && (email || phone)) {
    return `${name} (${email || phone})`;
  }
  if (name) return name;
  if (email) return email;
  if (phone) return phone;
  return "Unnamed patient";
}

function generateConversationTitleFromContent(source: string): string {
  const normalized = source.trim().replace(/\s+/g, " ");
  if (!normalized) return "New chat";
  const maxLength = 60;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength)}…`;
}

function isPlaceholderTitle(title: string | null | undefined): boolean {
  if (!title) return true;
  const trimmed = title.trim().toLowerCase();
  if (!trimmed) return true;
  if (trimmed === "new chat") return true;
  if (trimmed === "untitled chat") return true;
  return false;
}

function formatConversationTitle(conversation: ChatConversation): string {
  const raw = (conversation.title || "").trim();
  if (!raw) return "Untitled chat";
  if (raw.length <= 60) return raw;
  return `${raw.slice(0, 60)}…`;
}

export default function ChatWithAliicePage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversations, setConversations] = useState<ChatConversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(
    null,
  );
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [conversationsLoading, setConversationsLoading] = useState(false);
  const [conversationsError, setConversationsError] = useState<string | null>(
    null,
  );
  const [initialMessagesLoading, setInitialMessagesLoading] = useState(false);
  const [editingTitle, setEditingTitle] = useState("");

  const [patientOptions, setPatientOptions] = useState<ChatPatientSuggestion[]>([]);
  const [patientOptionsLoading, setPatientOptionsLoading] = useState(false);
  const [patientOptionsError, setPatientOptionsError] = useState<string | null>(
    null,
  );
  const [patientSearch, setPatientSearch] = useState("");
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);

  const selectedPatient =
    selectedPatientId && patientOptions.length > 0
      ? patientOptions.find((patient) => patient.id === selectedPatientId) ?? null
      : null;

  const filteredPatientOptions = useMemo(() => {
    const term = patientSearch.trim().toLowerCase();
    if (!term) return patientOptions;

    return patientOptions.filter((patient) => {
      const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`
        .trim()
        .toLowerCase();
      const email = (patient.email ?? "").toLowerCase();
      const phone = (patient.phone ?? "").toLowerCase();

      if (name.includes(term)) return true;
      if (email.includes(term)) return true;
      if (phone.includes(term)) return true;

      return false;
    });
  }, [patientSearch, patientOptions]);

  useEffect(() => {
    let isMounted = true;

    async function loadUserAndConversations() {
      try {
        setConversationsLoading(true);
        setConversationsError(null);

        const { data, error: authError } = await supabaseClient.auth.getUser();

        if (!isMounted) return;

        if (authError || !data?.user) {
          setCurrentUserId(null);
          setConversations([]);
          setConversationsLoading(false);
          return;
        }

        const authUser = data.user;
        setCurrentUserId(authUser.id);

        const { data: rows, error } = await supabaseClient
          .from("chat_conversations")
          .select(
            "id, title, created_at, updated_at, is_archived, archived_at, patient_id",
          )
          .eq("user_id", authUser.id)
          .eq("is_archived", false)
          .order("updated_at", { ascending: false });

        if (!isMounted) return;

        if (error || !rows) {
          setConversations([]);
          setConversationsError(error?.message ?? "Failed to load conversations.");
        } else {
          const items = (rows as any[]).map((row) => ({
            id: row.id as string,
            title: (row.title as string | null) ?? null,
            created_at: row.created_at as string,
            updated_at: row.updated_at as string,
            is_archived: (row.is_archived as boolean | null) ?? false,
            archived_at: (row.archived_at as string | null) ?? null,
            patient_id: (row.patient_id as string | null) ?? null,
          }));
          setConversations(items);
          if (items.length > 0) {
            setActiveConversationId(items[0].id);
          }
        }

        setConversationsLoading(false);
      } catch {
        if (!isMounted) return;
        setConversations([]);
        setConversationsError("Failed to load conversations.");
        setConversationsLoading(false);
      }
    }

    void loadUserAndConversations();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPatients() {
      try {
        setPatientOptionsLoading(true);
        setPatientOptionsError(null);

        const { data, error } = await supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone")
          .order("created_at", { ascending: false })
          .limit(500);

        if (!isMounted) return;

        if (error || !data) {
          setPatientOptions([]);
          setPatientOptionsError(error?.message ?? "Failed to load patients.");
        } else {
          setPatientOptions(data as ChatPatientSuggestion[]);
        }

        setPatientOptionsLoading(false);
      } catch {
        if (!isMounted) return;
        setPatientOptions([]);
        setPatientOptionsError("Failed to load patients.");
        setPatientOptionsLoading(false);
      }
    }

    void loadPatients();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!activeConversationId) {
      setEditingTitle("");
      return;
    }

    const current = conversations.find(
      (conversation) => conversation.id === activeConversationId,
    );

    if (!current) {
      setEditingTitle("");
      return;
    }

    setEditingTitle(current.title ?? "");
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (!activeConversationId) {
      setSelectedPatientId(null);
      return;
    }

    const current = conversations.find(
      (conversation) => conversation.id === activeConversationId,
    );

    setSelectedPatientId((current?.patient_id as string | null) ?? null);
  }, [activeConversationId, conversations]);

  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }

    let isMounted = true;

    async function loadMessages() {
      try {
        setInitialMessagesLoading(true);

        const { data, error } = await supabaseClient
          .from("chat_messages")
          .select("id, role, content, created_at")
          .eq("conversation_id", activeConversationId)
          .order("created_at", { ascending: true });

        if (!isMounted) return;

        if (error || !data) {
          setMessages([]);
        } else {
          const rows = data as any[];
          const mapped: ChatMessage[] = rows.map((row) => {
            const roleValue = row.role as "user" | "assistant" | "system";
            const safeRole: "user" | "assistant" =
              roleValue === "user" ? "user" : "assistant";
            return {
              id: row.id as string,
              role: safeRole,
              content: (row.content as string) ?? "",
            };
          });
          setMessages(
            mapped.filter((message) => message.content.trim().length > 0),
          );
        }

        setInitialMessagesLoading(false);
      } catch {
        if (!isMounted) return;
        setMessages([]);
        setInitialMessagesLoading(false);
      }
    }

    void loadMessages();

    return () => {
      isMounted = false;
    };
  }, [activeConversationId]);

  async function ensureConversation(
    firstMessageContent: string,
  ): Promise<string | null> {
    if (activeConversationId) {
      return activeConversationId;
    }
    if (!currentUserId) {
      return null;
    }

    const title = generateConversationTitleFromContent(firstMessageContent);

    const { data, error } = await supabaseClient
      .from("chat_conversations")
      .insert({
        user_id: currentUserId,
        title,
      })
      .select(
        "id, title, created_at, updated_at, is_archived, archived_at, patient_id",
      )
      .single();

    if (error || !data) {
      setError(error?.message ?? "Failed to create conversation.");
      return null;
    }

    const row = data as any;
    const conversationId = row.id as string;

    const conversation: ChatConversation = {
      id: conversationId,
      title: (row.title as string | null) ?? null,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      is_archived: (row.is_archived as boolean | null) ?? false,
      archived_at: (row.archived_at as string | null) ?? null,
      patient_id: (row.patient_id as string | null) ?? null,
    };

    setConversations((prev) => [conversation, ...prev]);
    setActiveConversationId(conversationId);

    return conversationId;
  }

  async function handleStartNewConversation() {
    if (!currentUserId || loading) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const { data, error } = await supabaseClient
        .from("chat_conversations")
        .insert({
          user_id: currentUserId,
          title: "New chat",
        })
        .select(
          "id, title, created_at, updated_at, is_archived, archived_at, patient_id",
        )
        .single();

      if (error || !data) {
        setError(error?.message ?? "Failed to create conversation.");
        setLoading(false);
        return;
      }

      const row = data as any;

      const conversation: ChatConversation = {
        id: row.id as string,
        title: (row.title as string | null) ?? null,
        created_at: row.created_at as string,
        updated_at: row.updated_at as string,
        is_archived: (row.is_archived as boolean | null) ?? false,
        archived_at: (row.archived_at as string | null) ?? null,
        patient_id: (row.patient_id as string | null) ?? null,
      };

      setConversations((prev) => [conversation, ...prev]);
      setActiveConversationId(conversation.id);
      setMessages([]);
      setLoading(false);
    } catch {
      setError("Failed to create conversation.");
      setLoading(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: `${Date.now()}-user`,
      role: "user",
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    setError(null);

    let conversationId = activeConversationId;

    if (!conversationId && currentUserId) {
      conversationId = await ensureConversation(trimmed);
      if (!conversationId) {
        setLoading(false);
        return;
      }
    }

    if (conversationId) {
      try {
        const { error: insertError } = await supabaseClient
          .from("chat_messages")
          .insert({
            conversation_id: conversationId,
            role: "user",
            content: trimmed,
          });

        if (insertError) {
          console.error("Failed to save user message", insertError);
        }
      } catch (saveError) {
        console.error("Failed to save user message", saveError);
      }
    }

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          patientId: selectedPatientId,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(payload?.error ?? "Failed to get a response from Aliice.");
        setLoading(false);
        return;
      }

      const json = (await response.json()) as {
        message?: { role?: string; content?: string };
      };

      if (!json.message || !json.message.content) {
        setError("Aliice did not return a response.");
        setLoading(false);
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `${Date.now()}-assistant`,
        role: "assistant",
        content: json.message.content,
      };

      setMessages((prev) => [...prev, assistantMessage]);

      if (conversationId) {
        try {
          const nowIso = new Date().toISOString();

          const { error: insertError } = await supabaseClient
            .from("chat_messages")
            .insert({
              conversation_id: conversationId,
              role: "assistant",
              content: assistantMessage.content,
            });

          if (insertError) {
            console.error("Failed to save assistant message", insertError);
          }

          let shouldUpdateTitle = false;

          setConversations((prev) => {
            const items = prev.filter((item) => item.id !== conversationId);
            const existing = prev.find((item) => item.id === conversationId);
            const base: ChatConversation =
              existing ??
              {
                id: conversationId,
                title: null,
                created_at: nowIso,
                updated_at: nowIso,
              };

            shouldUpdateTitle = isPlaceholderTitle(base.title);

            const nextTitle = shouldUpdateTitle
              ? generateConversationTitleFromContent(userMessage.content)
              : base.title ?? generateConversationTitleFromContent(userMessage.content);

            const updated: ChatConversation = {
              ...base,
              title: nextTitle,
              updated_at: nowIso,
            };

            return [updated, ...items];
          });

          const updates: { updated_at: string; title?: string } = {
            updated_at: nowIso,
          };

          if (shouldUpdateTitle) {
            updates.title = generateConversationTitleFromContent(
              userMessage.content,
            );
          }

          const { error: updateError } = await supabaseClient
            .from("chat_conversations")
            .update(updates)
            .eq("id", conversationId);

          if (updateError) {
            console.error("Failed to update conversation", updateError);
          }
        } catch (saveError) {
          console.error("Failed to save assistant message", saveError);
        }
      }

      setLoading(false);
    } catch {
      setError("Network error talking to Aliice.");
      setLoading(false);
    }
  }

  async function handleTitleSave() {
    if (!activeConversationId || !currentUserId) {
      return;
    }

    const trimmed = editingTitle.trim();
    const nextTitle = trimmed
      ? trimmed.slice(0, 120)
      : null;

    // Optimistically update local state so the UI feels instant
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              title: nextTitle,
            }
          : conversation,
      ),
    );

    try {
      const { error: updateError } = await supabaseClient
        .from("chat_conversations")
        .update({
          title: nextTitle,
        })
        .eq("id", activeConversationId)
        .eq("user_id", currentUserId);

      if (updateError) {
        setError(updateError.message ?? "Failed to rename conversation.");
      }
    } catch {
      setError("Failed to rename conversation.");
    }
  }

  async function handleArchiveActiveConversation() {
    if (!activeConversationId || !currentUserId) {
      return;
    }

    const nowIso = new Date().toISOString();

    // Optimistically remove the conversation and pick the next one
    let nextActiveId: string | null = null;
    setConversations((prev) => {
      const remaining = prev.filter(
        (conversation) => conversation.id !== activeConversationId,
      );
      const next = remaining[0] ?? null;
      nextActiveId = next ? next.id : null;
      return remaining;
    });

    setActiveConversationId(nextActiveId);
    if (!nextActiveId) {
      setMessages([]);
      setEditingTitle("");
    }

    try {
      const { error: updateError } = await supabaseClient
        .from("chat_conversations")
        .update({
          is_archived: true,
          archived_at: nowIso,
        })
        .eq("id", activeConversationId)
        .eq("user_id", currentUserId);

      if (updateError) {
        setError(updateError.message ?? "Failed to archive conversation.");
      }
    } catch {
      setError("Failed to archive conversation.");
    }
  }

  async function handleDeleteActiveConversation() {
    if (!activeConversationId || !currentUserId) {
      return;
    }

    // Optimistically remove from local state
    setConversations((prev) =>
      prev.filter((conversation) => conversation.id !== activeConversationId),
    );
    setActiveConversationId(null);
    setMessages([]);
    setEditingTitle("");

    try {
      const { error: deleteError } = await supabaseClient
        .from("chat_conversations")
        .delete()
        .eq("id", activeConversationId)
        .eq("user_id", currentUserId);

      if (deleteError) {
        setError(deleteError.message ?? "Failed to delete conversation.");
      }
    } catch {
      setError("Failed to delete conversation.");
    }
  }

  async function handleSelectPatient(patient: ChatPatientSuggestion) {
    if (!activeConversationId || !currentUserId) {
      return;
    }

    const newPatientId = patient.id as string;

    setSelectedPatientId(newPatientId);
    setPatientSearch("");

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              patient_id: newPatientId,
            }
          : conversation,
      ),
    );

    try {
      const { error: updateError } = await supabaseClient
        .from("chat_conversations")
        .update({
          patient_id: newPatientId,
        })
        .eq("id", activeConversationId)
        .eq("user_id", currentUserId);

      if (updateError) {
        setError(updateError.message ?? "Failed to update patient for conversation.");
      }
    } catch {
      setError("Failed to update patient for conversation.");
    }
  }

  async function handleClearPatient() {
    if (!activeConversationId || !currentUserId) {
      return;
    }

    setSelectedPatientId(null);
    setPatientSearch("");

    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === activeConversationId
          ? {
              ...conversation,
              patient_id: null,
            }
          : conversation,
      ),
    );

    try {
      const { error: updateError } = await supabaseClient
        .from("chat_conversations")
        .update({
          patient_id: null,
        })
        .eq("id", activeConversationId)
        .eq("user_id", currentUserId);

      if (updateError) {
        setError(updateError.message ?? "Failed to clear patient for conversation.");
      }
    } catch {
      setError("Failed to clear patient for conversation.");
    }
  }

  return (
    <div className="h-full space-y-4">
      <CollapseSidebarOnMount />
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Chat with Aliice</h1>
        <p className="text-sm text-slate-500">
          Your AI assistant for bookings, post-op docs, and patient or insurance
          communication.
        </p>
      </div>
      <div className="flex min-h-[540px] flex-col gap-4 sm:flex-row">
        <aside className="flex w-full flex-shrink-0 flex-col rounded-xl border border-slate-200/80 bg-white/90 text-[13px] shadow-[0_12px_30px_rgba(15,23,42,0.12)] sm:w-64">
          <div className="flex items-center justify-between border-b border-slate-100/80 px-3 py-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">
              Conversations
            </span>
            <button
              type="button"
              onClick={handleStartNewConversation}
              disabled={loading || !currentUserId}
              className="inline-flex items-center justify-center rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              New
            </button>
          </div>
          <div className="flex-1 space-y-1 overflow-y-auto px-2 py-2">
            {conversationsLoading ? (
              <p className="px-2 text-[12px] text-slate-400">Loading...</p>
            ) : conversations.length === 0 ? (
              <p className="px-2 text-[12px] text-slate-400">
                No conversations yet.
              </p>
            ) : (
              conversations.map((conversation) => {
                const isActive = conversation.id === activeConversationId;
                return (
                  <button
                    key={conversation.id}
                    type="button"
                    onClick={() => setActiveConversationId(conversation.id)}
                    className={
                      "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-[12px] " +
                      (isActive
                        ? "bg-sky-600 text-white shadow-sm"
                        : "bg-white/70 text-slate-800 hover:bg-slate-100")
                    }
                  >
                    <span className="line-clamp-2">
                      {formatConversationTitle(conversation)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex-1">
              <input
                type="text"
                value={editingTitle}
                onChange={(event) => setEditingTitle(event.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void handleTitleSave();
                  }
                }}
                placeholder="Name this conversation..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[13px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>
            <div className="flex items-center justify-end gap-2 text-[11px]">
              <button
                type="button"
                onClick={handleArchiveActiveConversation}
                disabled={!activeConversationId || !currentUserId}
                className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Archive
              </button>
              <button
                type="button"
                onClick={handleDeleteActiveConversation}
                disabled={!activeConversationId || !currentUserId}
                className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700 hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Delete
              </button>
            </div>
          </div>
          <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md text-[11px]">
              <input
                type="text"
                value={patientSearch}
                onChange={(event) => setPatientSearch(event.target.value)}
                disabled={!activeConversationId || !currentUserId}
                placeholder="Search patient by name, email, or phone..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:opacity-60"
              />
              {patientOptionsError ? (
                <p className="mt-1 text-[10px] text-red-600">{patientOptionsError}</p>
              ) : null}
              {patientOptionsLoading ? (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-500 shadow-lg">
                  Loading patients...
                </div>
              ) : null}
              {!patientOptionsLoading && patientSearch.trim().length > 0 ? (
                <div className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-[11px] shadow-lg">
                  {filteredPatientOptions.length === 0 ? (
                    <div className="px-3 py-1.5 text-slate-500">
                      No matching patients.
                    </div>
                  ) : (
                    filteredPatientOptions.map((patient) => (
                      <button
                        key={patient.id}
                        type="button"
                        onClick={() => handleSelectPatient(patient)}
                        className="flex w-full flex-col items-start px-3 py-1.5 text-left text-slate-900 hover:bg-sky-50"
                      >
                        <span className="font-medium text-slate-900">
                          {formatPatientForDisplay(patient)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : null}
            </div>
            <div className="flex items-center gap-2 text-[11px]">
              <span className="text-slate-500">
                {!activeConversationId || !currentUserId
                  ? "Start a conversation to link it to a patient."
                  : selectedPatient
                  ? `Linked patient: ${formatPatientForDisplay(selectedPatient)}`
                  : "No patient selected."}
              </span>
              {selectedPatient ? (
                <button
                  type="button"
                  onClick={handleClearPatient}
                  className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium text-slate-600 hover:bg-slate-100"
                >
                  Clear
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 min-h-[220px] max-h-[440px] space-y-2 overflow-y-auto rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-[13px]">
            {initialMessagesLoading ? (
              <p className="text-[12px] text-slate-500">Loading conversation...</p>
            ) : messages.length === 0 ? (
              <p className="text-[12px] text-slate-500">
                Start a conversation with Aliice about bookings, post-op docs, or
                how to communicate with patients and insurers.
              </p>
            ) : (
              messages.map((message) => (
                <div
                  key={message.id}
                  className={
                    "flex " +
                    (message.role === "user"
                      ? "justify-end text-right"
                      : "justify-start text-left")
                  }
                >
                  <div
                    className={
                      "inline-block max-w-[80%] rounded-2xl px-3 py-2 text-[12px] " +
                      (message.role === "user"
                        ? "bg-sky-600 text-white"
                        : "bg-slate-100 text-slate-900")
                    }
                  >
                    {message.content}
                  </div>
                </div>
              ))
            )}
          </div>
          {(error || conversationsError) && (
            <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">
              {error || conversationsError}
            </div>
          )}
          <form onSubmit={handleSubmit} className="mt-3 flex items-end gap-2 pt-1">
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              rows={2}
              placeholder="Ask Aliice a question..."
              className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[13px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
            <button
              type="submit"
              disabled={loading || !input.trim() || initialMessagesLoading}
              className="inline-flex items-center justify-center rounded-full border border-sky-500 bg-sky-600 px-4 py-2 text-[12px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
