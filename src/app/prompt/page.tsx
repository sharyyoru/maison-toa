"use client";

import { useState, useEffect, useRef, FormEvent, useCallback } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import Link from "next/link";
import Image from "next/image";

type Attachment = {
  id?: string;
  fileName: string;
  fileType: string;
  mimeType: string;
  fileSize: number;
  data?: string;
  url?: string;
  storagePath?: string;
};

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  attachments?: Attachment[];
  created_at?: string;
};

type Topic = {
  id: string;
  title: string;
  description: string | null;
  icon: string;
  color: string;
  is_pinned: boolean;
  is_archived: boolean;
  message_count: number;
  attachment_count: number;
  last_message_at: string | null;
  created_at: string;
  updated_at: string;
};

const TOPIC_COLORS = [
  { name: "sky", bg: "bg-sky-500", light: "bg-sky-50", text: "text-sky-600", border: "border-sky-200" },
  { name: "violet", bg: "bg-violet-500", light: "bg-violet-50", text: "text-violet-600", border: "border-violet-200" },
  { name: "rose", bg: "bg-rose-500", light: "bg-rose-50", text: "text-rose-600", border: "border-rose-200" },
  { name: "amber", bg: "bg-amber-500", light: "bg-amber-50", text: "text-amber-600", border: "border-amber-200" },
  { name: "emerald", bg: "bg-emerald-500", light: "bg-emerald-50", text: "text-emerald-600", border: "border-emerald-200" },
  { name: "slate", bg: "bg-slate-500", light: "bg-slate-50", text: "text-slate-600", border: "border-slate-200" },
];

const TOPIC_ICONS = [
  { name: "sparkles", icon: "✨" },
  { name: "brain", icon: "🧠" },
  { name: "book", icon: "📚" },
  { name: "lightbulb", icon: "💡" },
  { name: "rocket", icon: "🚀" },
  { name: "target", icon: "🎯" },
  { name: "chart", icon: "📊" },
  { name: "code", icon: "💻" },
  { name: "health", icon: "🏥" },
  { name: "science", icon: "🔬" },
];

function getTopicColor(colorName: string) {
  return TOPIC_COLORS.find(c => c.name === colorName) || TOPIC_COLORS[0];
}

function getTopicIcon(iconName: string) {
  return TOPIC_ICONS.find(i => i.name === iconName)?.icon || "✨";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

function MarkdownContent({ content }: { content: string }) {
  const lines = content.split("\n");
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeContent: string[] = [];
  let codeLanguage = "";

  lines.forEach((line, idx) => {
    if (line.startsWith("```")) {
      if (inCodeBlock) {
        elements.push(
          <pre key={idx} className="my-2 overflow-x-auto rounded-lg bg-slate-900 p-3 text-sm text-slate-100">
            <code>{codeContent.join("\n")}</code>
          </pre>
        );
        codeContent = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
        codeLanguage = line.slice(3).trim();
      }
      return;
    }

    if (inCodeBlock) {
      codeContent.push(line);
      return;
    }

    if (line.startsWith("### ")) {
      elements.push(<h3 key={idx} className="mt-3 mb-1 text-base font-semibold text-slate-900">{line.slice(4)}</h3>);
    } else if (line.startsWith("## ")) {
      elements.push(<h2 key={idx} className="mt-4 mb-2 text-lg font-bold text-slate-900">{line.slice(3)}</h2>);
    } else if (line.startsWith("# ")) {
      elements.push(<h1 key={idx} className="mt-4 mb-2 text-xl font-bold text-slate-900">{line.slice(2)}</h1>);
    } else if (line.startsWith("- ") || line.startsWith("* ")) {
      elements.push(<li key={idx} className="ml-4 list-disc text-slate-700">{line.slice(2)}</li>);
    } else if (/^\d+\.\s/.test(line)) {
      elements.push(<li key={idx} className="ml-4 list-decimal text-slate-700">{line.replace(/^\d+\.\s/, "")}</li>);
    } else if (line.startsWith("> ")) {
      elements.push(
        <blockquote key={idx} className="my-2 border-l-4 border-slate-300 pl-3 italic text-slate-600">
          {line.slice(2)}
        </blockquote>
      );
    } else if (line.trim() === "") {
      elements.push(<div key={idx} className="h-2" />);
    } else {
      const formatted = line
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(/`([^`]+)`/g, '<code class="rounded bg-slate-100 px-1 py-0.5 text-sm font-mono text-slate-800">$1</code>');
      elements.push(<p key={idx} className="text-slate-700" dangerouslySetInnerHTML={{ __html: formatted }} />);
    }
  });

  return <div className="space-y-1">{elements}</div>;
}

export default function PromptPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [topics, setTopics] = useState<Topic[]>([]);
  const [activeTopic, setActiveTopic] = useState<Topic | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [loading, setLoading] = useState(false);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [editingTopic, setEditingTopic] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [showTopicSettings, setShowTopicSettings] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  useEffect(() => {
    async function loadUser() {
      const { data } = await supabaseClient.auth.getUser();
      if (data?.user) {
        setUserId(data.user.id);
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    if (!userId) return;

    async function loadTopics() {
      setTopicsLoading(true);
      try {
        const res = await fetch(`/api/prompt/topics?userId=${userId}`);
        const data = await res.json();
        if (data.topics) {
          setTopics(data.topics);
          if (data.topics.length > 0 && !activeTopic) {
            setActiveTopic(data.topics[0]);
          }
        }
      } catch (err) {
        console.error("Failed to load topics:", err);
      } finally {
        setTopicsLoading(false);
      }
    }
    loadTopics();
  }, [userId]);

  useEffect(() => {
    if (!activeTopic || !userId) {
      setMessages([]);
      return;
    }

    async function loadMessages() {
      setMessagesLoading(true);
      try {
        const res = await fetch(`/api/prompt/messages?topicId=${activeTopic!.id}&userId=${userId}`);
        const data = await res.json();
        if (data.messages) {
          setMessages(data.messages.map((m: { id: string; role: string; content: string; attachments?: Attachment[]; created_at: string }) => ({
            id: m.id,
            role: m.role as "user" | "assistant",
            content: m.content,
            attachments: m.attachments,
            created_at: m.created_at,
          })));
        }
      } catch (err) {
        console.error("Failed to load messages:", err);
      } finally {
        setMessagesLoading(false);
      }
    }
    loadMessages();
  }, [activeTopic, userId]);

  async function createNewTopic() {
    if (!userId) return;

    try {
      const res = await fetch("/api/prompt/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.topic) {
        setTopics(prev => [data.topic, ...prev]);
        setActiveTopic(data.topic);
        setMessages([]);
      }
    } catch (err) {
      console.error("Failed to create topic:", err);
    }
  }

  async function updateTopic(updates: Partial<Topic>) {
    if (!activeTopic || !userId) return;

    try {
      const res = await fetch("/api/prompt/topics", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topicId: activeTopic.id, userId, ...updates }),
      });
      const data = await res.json();
      if (data.topic) {
        setTopics(prev => prev.map(t => t.id === data.topic.id ? data.topic : t));
        setActiveTopic(data.topic);
      }
    } catch (err) {
      console.error("Failed to update topic:", err);
    }
  }

  async function deleteTopic(topicId: string) {
    if (!userId) return;

    try {
      await fetch(`/api/prompt/topics?topicId=${topicId}&userId=${userId}`, {
        method: "DELETE",
      });
      setTopics(prev => prev.filter(t => t.id !== topicId));
      if (activeTopic?.id === topicId) {
        const remaining = topics.filter(t => t.id !== topicId);
        setActiveTopic(remaining[0] || null);
      }
    } catch (err) {
      console.error("Failed to delete topic:", err);
    }
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter(f => {
      const isImage = f.type.startsWith("image/");
      const isPdf = f.type === "application/pdf";
      const isText = f.type.startsWith("text/");
      const maxSize = 20 * 1024 * 1024;
      return (isImage || isPdf || isText) && f.size <= maxSize;
    });
    setPendingFiles(prev => [...prev, ...validFiles]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePendingFile(index: number) {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if ((!input.trim() && pendingFiles.length === 0) || loading || !userId) return;

    let currentTopic = activeTopic;

    if (!currentTopic) {
      const res = await fetch("/api/prompt/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      if (data.topic) {
        currentTopic = data.topic;
        setTopics(prev => [data.topic, ...prev]);
        setActiveTopic(data.topic);
      } else {
        setError("Failed to create topic");
        return;
      }
    }

    setLoading(true);
    setError(null);

    const newAttachments = await Promise.all(
      pendingFiles.map(async (file) => {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        return {
          fileName: file.name,
          mimeType: file.type,
          data: base64,
        };
      })
    );

    const userMessage: Message = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim() || (pendingFiles.length > 0 ? `[${pendingFiles.length} file(s) attached]` : ""),
      attachments: pendingFiles.map(f => ({
        fileName: f.name,
        fileType: f.type.split("/")[0],
        mimeType: f.type,
        fileSize: f.size,
      })),
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setPendingFiles([]);

    try {
      const res = await fetch("/api/prompt/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topicId: currentTopic!.id,
          userId,
          messages: nextMessages.map(m => ({
            role: m.role,
            content: m.content,
          })),
          newAttachments,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Failed to get response");
        setLoading(false);
        return;
      }

      const assistantMessage: Message = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: data.message.content,
      };

      setMessages(prev => [...prev, assistantMessage]);

      setTopics(prev => prev.map(t =>
        t.id === currentTopic!.id
          ? { ...t, message_count: t.message_count + 2, updated_at: new Date().toISOString() }
          : t
      ));
    } catch (err) {
      setError("Failed to send message");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] bg-gradient-to-br from-slate-50 to-slate-100">
      <aside className={`${sidebarOpen ? "w-80" : "w-0"} flex-shrink-0 overflow-hidden transition-all duration-300`}>
        <div className="flex h-full w-80 flex-col border-r border-slate-200 bg-white">
          <div className="flex items-center justify-between border-b border-slate-100 p-4">
            <div className="flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                <span className="text-lg">✨</span>
              </div>
              <div>
                <h1 className="text-sm font-semibold text-slate-900">AI Knowledge Base</h1>
                <p className="text-xs text-slate-500">{topics.length} topics</p>
              </div>
            </div>
            <button
              onClick={createNewTopic}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600 transition hover:bg-slate-200"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {topicsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-300 border-t-violet-500" />
              </div>
            ) : topics.length === 0 ? (
              <div className="py-8 text-center">
                <div className="mb-2 text-3xl">💬</div>
                <p className="text-sm text-slate-500">No topics yet</p>
                <button
                  onClick={createNewTopic}
                  className="mt-2 text-sm font-medium text-violet-600 hover:text-violet-700"
                >
                  Create your first topic
                </button>
              </div>
            ) : (
              <div className="space-y-1">
                {topics.map(topic => {
                  const color = getTopicColor(topic.color);
                  const icon = getTopicIcon(topic.icon);
                  const isActive = activeTopic?.id === topic.id;
                  
                  return (
                    <button
                      key={topic.id}
                      onClick={() => setActiveTopic(topic)}
                      className={`group flex w-full items-center gap-3 rounded-xl p-3 text-left transition ${
                        isActive
                          ? `${color.light} ${color.border} border`
                          : "hover:bg-slate-50"
                      }`}
                    >
                      <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${
                        isActive ? color.bg : "bg-slate-100"
                      }`}>
                        <span className={isActive ? "text-white" : ""}>{icon}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={`truncate text-sm font-medium ${
                          isActive ? color.text : "text-slate-700"
                        }`}>
                          {topic.title}
                        </p>
                        <p className="truncate text-xs text-slate-400">
                          {topic.message_count} messages • {topic.attachment_count} files
                        </p>
                      </div>
                      {topic.is_pinned && (
                        <span className="text-amber-500">📌</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 p-3">
            <Link
              href="/knowledgebase"
              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 transition hover:bg-slate-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              View Knowledge Base
            </Link>
          </div>
        </div>
      </aside>

      <main className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
            
            {activeTopic ? (
              <div className="flex items-center gap-2">
                <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${getTopicColor(activeTopic.color).bg}`}>
                  <span className="text-white">{getTopicIcon(activeTopic.icon)}</span>
                </div>
                {editingTopic === activeTopic.id ? (
                  <input
                    type="text"
                    value={editTitle}
                    onChange={e => setEditTitle(e.target.value)}
                    onBlur={() => {
                      if (editTitle.trim()) updateTopic({ title: editTitle.trim() });
                      setEditingTopic(null);
                    }}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        if (editTitle.trim()) updateTopic({ title: editTitle.trim() });
                        setEditingTopic(null);
                      }
                      if (e.key === "Escape") setEditingTopic(null);
                    }}
                    className="rounded-lg border border-slate-200 px-2 py-1 text-sm font-medium focus:border-violet-500 focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => {
                      setEditTitle(activeTopic.title);
                      setEditingTopic(activeTopic.id);
                    }}
                    className="text-sm font-medium text-slate-900 hover:text-violet-600"
                  >
                    {activeTopic.title}
                  </button>
                )}
              </div>
            ) : (
              <span className="text-sm text-slate-500">Select or create a topic to start</span>
            )}
          </div>

          {activeTopic && (
            <div className="flex items-center gap-2">
              <button
                onClick={() => updateTopic({ is_pinned: !activeTopic.is_pinned })}
                className={`flex h-8 w-8 items-center justify-center rounded-lg transition ${
                  activeTopic.is_pinned ? "bg-amber-100 text-amber-600" : "text-slate-400 hover:bg-slate-100"
                }`}
                title={activeTopic.is_pinned ? "Unpin" : "Pin"}
              >
                📌
              </button>
              <button
                onClick={() => setShowTopicSettings(!showTopicSettings)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>

              {showTopicSettings && (
                <div className="absolute right-6 top-14 z-50 w-48 rounded-xl border border-slate-200 bg-white py-2 shadow-xl">
                  <button
                    onClick={() => {
                      setEditTitle(activeTopic.title);
                      setEditingTopic(activeTopic.id);
                      setShowTopicSettings(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      updateTopic({ is_archived: true });
                      setShowTopicSettings(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                    </svg>
                    Archive
                  </button>
                  <hr className="my-2 border-slate-100" />
                  <button
                    onClick={() => {
                      if (confirm("Delete this topic and all its messages?")) {
                        deleteTopic(activeTopic.id);
                      }
                      setShowTopicSettings(false);
                    }}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {!activeTopic ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600">
                <span className="text-4xl">✨</span>
              </div>
              <h2 className="mb-2 text-xl font-semibold text-slate-900">Welcome to AI Prompt</h2>
              <p className="mb-6 max-w-md text-center text-slate-500">
                Create topics to organize your knowledge. Upload documents, images, and chat with AI to build your knowledge base.
              </p>
              <button
                onClick={createNewTopic}
                className="rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 px-6 py-3 font-medium text-white shadow-lg transition hover:shadow-xl"
              >
                Create First Topic
              </button>
            </div>
          ) : messagesLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-300 border-t-violet-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center">
              <div className={`mb-4 flex h-16 w-16 items-center justify-center rounded-2xl ${getTopicColor(activeTopic.color).bg}`}>
                <span className="text-3xl text-white">{getTopicIcon(activeTopic.icon)}</span>
              </div>
              <h3 className="mb-2 text-lg font-semibold text-slate-900">{activeTopic.title}</h3>
              <p className="max-w-md text-center text-sm text-slate-500">
                Start a conversation by typing a message or uploading files. The AI will help you analyze and understand your content.
              </p>
            </div>
          ) : (
            <div className="mx-auto max-w-3xl space-y-6">
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                    message.role === "user" 
                      ? "bg-slate-700" 
                      : "bg-gradient-to-br from-violet-500 to-purple-600"
                  }`}>
                    {message.role === "user" ? (
                      <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    ) : (
                      <span className="text-sm text-white">✨</span>
                    )}
                  </div>
                  <div className={`max-w-[85%] ${message.role === "user" ? "text-right" : ""}`}>
                    {message.attachments && message.attachments.length > 0 && (
                      <div className={`mb-2 flex flex-wrap gap-2 ${message.role === "user" ? "justify-end" : ""}`}>
                        {message.attachments.map((att, idx) => (
                          <div
                            key={idx}
                            className="flex items-center gap-2 rounded-lg bg-slate-100 px-3 py-2 text-sm"
                          >
                            {att.mimeType?.startsWith("image/") ? (
                              <span>🖼️</span>
                            ) : att.mimeType === "application/pdf" ? (
                              <span>📄</span>
                            ) : (
                              <span>📎</span>
                            )}
                            <span className="max-w-[150px] truncate text-slate-600">{att.fileName}</span>
                            <span className="text-xs text-slate-400">{formatFileSize(att.fileSize)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-3 ${
                      message.role === "user"
                        ? "bg-slate-700 text-white"
                        : "bg-white shadow-sm border border-slate-100"
                    }`}>
                      {message.role === "assistant" ? (
                        <MarkdownContent content={message.content} />
                      ) : (
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {loading && (
                <div className="flex gap-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-purple-600">
                    <span className="text-sm text-white">✨</span>
                  </div>
                  <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "0ms" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "150ms" }} />
                      <div className="h-2 w-2 animate-bounce rounded-full bg-violet-400" style={{ animationDelay: "300ms" }} />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {activeTopic && (
          <div className="border-t border-slate-200 bg-white p-4">
            <div className="mx-auto max-w-3xl">
              {error && (
                <div className="mb-3 rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
                  {error}
                </div>
              )}

              {pendingFiles.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingFiles.map((file, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-sm"
                    >
                      {file.type.startsWith("image/") ? (
                        <span>🖼️</span>
                      ) : file.type === "application/pdf" ? (
                        <span>📄</span>
                      ) : (
                        <span>📎</span>
                      )}
                      <span className="max-w-[150px] truncate text-violet-700">{file.name}</span>
                      <button
                        onClick={() => removePendingFile(idx)}
                        className="text-violet-400 hover:text-violet-600"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex items-end gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*,application/pdf,text/*"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-violet-600"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                  </svg>
                </button>

                <div className="relative flex-1">
                  <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSubmit(e);
                      }
                    }}
                    placeholder="Type a message or upload files..."
                    rows={1}
                    className="w-full resize-none rounded-xl border border-slate-200 px-4 py-3 pr-12 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20"
                    style={{ minHeight: "44px", maxHeight: "200px" }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || (!input.trim() && pendingFiles.length === 0)}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-lg transition hover:shadow-xl disabled:opacity-50"
                >
                  {loading ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  ) : (
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                    </svg>
                  )}
                </button>
              </form>

              <p className="mt-2 text-center text-xs text-slate-400">
                Supports images, PDFs, and text files up to 20MB
              </p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
