"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { useTranslations } from "next-intl";

type ChatSession = {
  id: string;
  visitor_id: string | null;
  visitor_name: string | null;
  visitor_email: string | null;
  visitor_phone: string | null;
  status: string;
  conversation_type: string | null;
  source_url: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  interested_service: string | null;
  interested_location: string | null;
  patient_id: string | null;
  patient_match_type: string | null;
  conversation_summary: string | null;
  extracted_data: Record<string, unknown> | null;
  message_count: number;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  patient?: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type DateFilter = "today" | "week" | "month" | "all";
type StatusFilter = "all" | "active" | "closed" | "converted";

export default function ChatLogsPage() {
  const t = useTranslations("chatLogs");
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [selectedSession, setSelectedSession] = useState<ChatSession | null>(null);
  const [sessionMessages, setSessionMessages] = useState<ChatMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  
  const [dateFilter, setDateFilter] = useState<DateFilter>("week");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [searchTerm, setSearchTerm] = useState("");

  // Stats
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    converted: 0,
    withContact: 0,
  });

  useEffect(() => {
    loadSessions();
  }, [dateFilter, statusFilter]);

  async function loadSessions() {
    try {
      setLoading(true);
      setError(null);

      let query = supabaseClient
        .from("public_chat_sessions")
        .select(`
          *,
          patient:patients(id, first_name, last_name, email)
        `)
        .order("created_at", { ascending: false });

      // Date filter
      const now = new Date();
      if (dateFilter === "today") {
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
        query = query.gte("created_at", todayStart);
      } else if (dateFilter === "week") {
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", weekAgo);
      } else if (dateFilter === "month") {
        const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
        query = query.gte("created_at", monthAgo);
      }

      // Status filter
      if (statusFilter !== "all") {
        query = query.eq("status", statusFilter);
      }

      const { data, error: fetchError } = await query.limit(200);

      if (fetchError) {
        setError(fetchError.message);
        setSessions([]);
      } else {
        setSessions((data as ChatSession[]) || []);
        
        // Calculate stats
        const allSessions = data || [];
        setStats({
          total: allSessions.length,
          active: allSessions.filter((s: ChatSession) => s.status === "active").length,
          converted: allSessions.filter((s: ChatSession) => s.status === "converted").length,
          withContact: allSessions.filter((s: ChatSession) => s.visitor_email || s.visitor_phone).length,
        });
      }
    } catch (err) {
      setError("Failed to load chat sessions");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadSessionMessages(sessionId: string) {
    try {
      setMessagesLoading(true);
      
      const { data, error: fetchError } = await supabaseClient
        .from("public_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });

      if (fetchError) {
        console.error(fetchError);
        setSessionMessages([]);
      } else {
        setSessionMessages((data as ChatMessage[]) || []);
      }
    } catch (err) {
      console.error(err);
      setSessionMessages([]);
    } finally {
      setMessagesLoading(false);
    }
  }

  function handleSelectSession(session: ChatSession) {
    setSelectedSession(session);
    loadSessionMessages(session.id);
  }

  async function handleUpdateStatus(sessionId: string, newStatus: string) {
    const { error: updateError } = await supabaseClient
      .from("public_chat_sessions")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("id", sessionId);

    if (!updateError) {
      setSessions((prev) =>
        prev.map((s) => (s.id === sessionId ? { ...s, status: newStatus } : s))
      );
      if (selectedSession?.id === sessionId) {
        setSelectedSession({ ...selectedSession, status: newStatus });
      }
    }
  }

  const filteredSessions = sessions.filter((session) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      session.visitor_name?.toLowerCase().includes(term) ||
      session.visitor_email?.toLowerCase().includes(term) ||
      session.visitor_phone?.toLowerCase().includes(term) ||
      session.interested_service?.toLowerCase().includes(term) ||
      session.conversation_summary?.toLowerCase().includes(term)
    );
  });

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      active: "bg-green-100 text-green-700",
      closed: "bg-slate-100 text-slate-600",
      converted: "bg-purple-100 text-purple-700",
    };
    return styles[status] || "bg-slate-100 text-slate-600";
  }

  function getSourceDomain(url: string | null): string {
    if (!url) return "Direct";
    try {
      return new URL(url).hostname.replace("www.", "");
    } catch {
      return url.slice(0, 30);
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Chat Logs</h1>
          <p className="text-sm text-slate-500">
            View and manage Aliice chat conversations from website visitors
          </p>
        </div>
        <button
          onClick={loadSessions}
          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          <p className="text-xs text-slate-500">Total Conversations</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-green-600">{stats.active}</p>
          <p className="text-xs text-slate-500">Active</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-purple-600">{stats.converted}</p>
          <p className="text-xs text-slate-500">Converted</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-sky-600">{stats.withContact}</p>
          <p className="text-xs text-slate-500">With Contact Info</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={dateFilter}
          onChange={(e) => setDateFilter(e.target.value as DateFilter)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
        >
          <option value="today">Today</option>
          <option value="week">Last 7 days</option>
          <option value="month">Last 30 days</option>
          <option value="all">All time</option>
        </select>
        
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm"
        >
          <option value="all">All statuses</option>
          <option value="active">Active</option>
          <option value="closed">Closed</option>
          <option value="converted">Converted</option>
        </select>

        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by name, email, phone..."
          className="flex-1 min-w-[200px] rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>

      {/* Content */}
      <div className="flex gap-6">
        {/* Sessions List */}
        <div className="w-1/2 space-y-2">
          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              Loading conversations...
            </div>
          ) : error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          ) : filteredSessions.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-slate-500">
              No conversations found
            </div>
          ) : (
            filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => handleSelectSession(session)}
                className={`w-full text-left rounded-xl border p-4 transition-all ${
                  selectedSession?.id === session.id
                    ? "border-sky-500 bg-sky-50 shadow-md"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900 truncate">
                        {session.visitor_name || session.visitor_email || session.visitor_phone || "Anonymous Visitor"}
                      </span>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${getStatusBadge(session.status)}`}>
                        {session.status}
                      </span>
                    </div>
                    
                    {session.conversation_summary && (
                      <p className="mt-1 text-xs text-slate-500 line-clamp-2">
                        {session.conversation_summary}
                      </p>
                    )}
                    
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-400">
                      <span>{formatDate(session.created_at)}</span>
                      <span>•</span>
                      <span>{session.message_count} messages</span>
                      {session.interested_service && (
                        <>
                          <span>•</span>
                          <span className="text-sky-600">{session.interested_service}</span>
                        </>
                      )}
                      {session.utm_source && (
                        <>
                          <span>•</span>
                          <span className="text-purple-600">utm: {session.utm_source}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {session.patient_id && (
                    <span className="flex-shrink-0 inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-1 text-[10px] font-medium text-green-700">
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                      Linked
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>

        {/* Session Detail */}
        <div className="w-1/2">
          {selectedSession ? (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden sticky top-4">
              {/* Session Header */}
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-slate-900">
                    {selectedSession.visitor_name || "Anonymous Visitor"}
                  </h3>
                  <select
                    value={selectedSession.status}
                    onChange={(e) => handleUpdateStatus(selectedSession.id, e.target.value)}
                    className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700"
                  >
                    <option value="active">Active</option>
                    <option value="closed">Closed</option>
                    <option value="converted">Converted</option>
                  </select>
                </div>
              </div>

              {/* Contact Info */}
              <div className="border-b border-slate-100 px-4 py-3 space-y-2">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Contact Info</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedSession.visitor_email && (
                    <div>
                      <span className="text-slate-400">Email:</span>{" "}
                      <span className="text-slate-700">{selectedSession.visitor_email}</span>
                    </div>
                  )}
                  {selectedSession.visitor_phone && (
                    <div>
                      <span className="text-slate-400">Phone:</span>{" "}
                      <span className="text-slate-700">{selectedSession.visitor_phone}</span>
                    </div>
                  )}
                  {selectedSession.interested_service && (
                    <div>
                      <span className="text-slate-400">Interest:</span>{" "}
                      <span className="text-sky-600 font-medium">{selectedSession.interested_service}</span>
                    </div>
                  )}
                  {selectedSession.interested_location && (
                    <div>
                      <span className="text-slate-400">Location:</span>{" "}
                      <span className="text-slate-700">{selectedSession.interested_location}</span>
                    </div>
                  )}
                </div>
                
                {selectedSession.patient_id && selectedSession.patient && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-xs text-slate-400">Linked Patient:</span>
                    <Link
                      href={`/patients/${selectedSession.patient_id}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-sky-600 hover:text-sky-700"
                    >
                      {selectedSession.patient.first_name} {selectedSession.patient.last_name}
                      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                      </svg>
                    </Link>
                    <span className="text-[10px] text-slate-400">
                      (matched by {selectedSession.patient_match_type})
                    </span>
                  </div>
                )}
              </div>

              {/* Attribution */}
              <div className="border-b border-slate-100 px-4 py-3 space-y-2">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide">Attribution</h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-slate-400">Source:</span>{" "}
                    <span className="text-slate-700">{getSourceDomain(selectedSession.source_url)}</span>
                  </div>
                  {selectedSession.referrer && (
                    <div>
                      <span className="text-slate-400">Referrer:</span>{" "}
                      <span className="text-slate-700">{getSourceDomain(selectedSession.referrer)}</span>
                    </div>
                  )}
                  {selectedSession.utm_source && (
                    <div>
                      <span className="text-slate-400">UTM Source:</span>{" "}
                      <span className="text-purple-600">{selectedSession.utm_source}</span>
                    </div>
                  )}
                  {selectedSession.utm_medium && (
                    <div>
                      <span className="text-slate-400">UTM Medium:</span>{" "}
                      <span className="text-purple-600">{selectedSession.utm_medium}</span>
                    </div>
                  )}
                  {selectedSession.utm_campaign && (
                    <div className="col-span-2">
                      <span className="text-slate-400">Campaign:</span>{" "}
                      <span className="text-purple-600">{selectedSession.utm_campaign}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="px-4 py-3">
                <h4 className="text-xs font-medium text-slate-500 uppercase tracking-wide mb-3">
                  Conversation ({selectedSession.message_count} messages)
                </h4>
                <div className="max-h-[400px] overflow-y-auto space-y-3">
                  {messagesLoading ? (
                    <p className="text-xs text-slate-400 text-center py-4">Loading messages...</p>
                  ) : sessionMessages.length === 0 ? (
                    <p className="text-xs text-slate-400 text-center py-4">No messages</p>
                  ) : (
                    sessionMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                      >
                        <div
                          className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${
                            msg.role === "user"
                              ? "bg-sky-500 text-white"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          <p>{msg.content}</p>
                          <p className={`mt-1 text-[9px] ${msg.role === "user" ? "text-sky-200" : "text-slate-400"}`}>
                            {new Date(msg.created_at).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-slate-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              <p className="text-sm">Select a conversation to view details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
