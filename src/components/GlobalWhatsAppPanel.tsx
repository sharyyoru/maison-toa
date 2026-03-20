"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { X, Search, Send, Loader2, QrCode, Wifi, WifiOff, ArrowLeft, MessageSquare } from "lucide-react";
import { supabaseClient } from "@/lib/supabaseClient";
import ImagePreviewPortal from "@/components/ImagePreviewPortal";

interface Chat {
  id: string;
  name: string;
  isGroup: boolean;
  unreadCount: number;
  lastMessage: string;
  timestamp?: number;
}

interface MediaData {
  mimetype: string;
  filename: string | null;
  data: string | null;
}

interface Message {
  id: string;
  body: string;
  fromMe: boolean;
  timestamp: number;
  author: string;
  authorName?: string | null;
  hasMedia?: boolean;
  type?: string;
  media?: MediaData | null;
}

interface GlobalWhatsAppPanelProps {
  open: boolean;
  onClose: () => void;
  onStatusChange?: (status: string) => void;
}

const WA_ICON = (
  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

function phoneToWaChatId(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  const normalized = digits.startsWith("0") ? "41" + digits.slice(1) : digits;
  return `${normalized}@c.us`;
}

export default function GlobalWhatsAppPanel({ open, onClose, onStatusChange }: GlobalWhatsAppPanelProps) {
  const [status, setStatus] = useState<"disconnected" | "launching" | "qr" | "qr_pending" | "authenticated" | "ready">("disconnected");
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [chats, setChats] = useState<Chat[]>([]);
  const [filteredChats, setFilteredChats] = useState<Chat[]>([]);
  const [chatSearch, setChatSearch] = useState("");
  const [selectedChat, setSelectedChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const [loadingChats, setLoadingChats] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const connectCalledRef = useRef(false);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const msgPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const chatPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isSendingRef = useRef(false);
  const isFirstLoad = useRef(true);
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'chats' | 'notifications'>('chats');
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loadingNotifications, setLoadingNotifications] = useState(false);

  const getAuthHeaders = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) throw new Error("Not authenticated");
    return {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
    };
  };

  const fetchNotifications = async () => {
    setLoadingNotifications(true);
    try {
      const headers = await getAuthHeaders();
      const response = await fetch('/api/whatsapp/queue?limit=50', { headers });
      if (response.ok) {
        const data = await response.json();
        setNotifications(data.items || []);
      }
    } catch {
      setNotifications([]);
    } finally {
      setLoadingNotifications(false);
    }
  };

  const retryItem = async (id: string) => {
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/whatsapp/queue', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id }),
      });
      void fetchNotifications();
    } catch { /* ignore */ }
  };

  const retryAll = async () => {
    try {
      const headers = await getAuthHeaders();
      await fetch('/api/whatsapp/queue', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ retryAll: true }),
      });
      void fetchNotifications();
    } catch { /* ignore */ }
  };

  useEffect(() => {
    if (open) {
      void fetchNotifications();
    }
  }, [open, activeTab]);

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => { isSendingRef.current = sending; }, [sending]);

  // Notify parent of status changes
  useEffect(() => { onStatusChange?.(status); }, [status, onStatusChange]);

  // Initialize when panel opens
  useEffect(() => {
    if (!open) return;
    void autoInit();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (msgPollIntervalRef.current) clearInterval(msgPollIntervalRef.current);
      if (chatPollIntervalRef.current) clearInterval(chatPollIntervalRef.current);
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Filter chats when search changes
  useEffect(() => {
    if (!chatSearch.trim()) {
      setFilteredChats(chats);
      return;
    }
    const q = chatSearch.toLowerCase();
    setFilteredChats(chats.filter(c => c.name?.toLowerCase().includes(q) || c.lastMessage?.toLowerCase().includes(q)));
  }, [chatSearch, chats]);

  // Poll messages for selected chat
  useEffect(() => {
    if (msgPollIntervalRef.current) clearInterval(msgPollIntervalRef.current);
    if (!selectedChat) return;

    const chatId = selectedChat.id;
    msgPollIntervalRef.current = setInterval(async () => {
      if (isSendingRef.current) return;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/whatsapp-web/messages/${encodeURIComponent(chatId)}`, { headers });
        const data = await res.json();
        const incoming: Message[] = data.messages || [];
        if (incoming.length === 0) return;
        setMessages(prev => {
          if (prev.some(m => m.id.startsWith("optimistic-"))) return prev;
          const lastPrevId = prev[prev.length - 1]?.id;
          const lastIncomingId = incoming[incoming.length - 1]?.id;
          if (lastPrevId === lastIncomingId && prev.length === incoming.length) return prev;
          const lastMsg = incoming[incoming.length - 1];
          const hadIt = prev.some(m => m.id === lastMsg.id);
          if (!hadIt && !lastMsg.fromMe) {
            setTimeout(() => scrollToBottom("smooth"), 50);
          }
          return incoming;
        });
      } catch { /* ignore */ }
    }, 4000);

    return () => {
      if (msgPollIntervalRef.current) clearInterval(msgPollIntervalRef.current);
    };
  }, [selectedChat]); // eslint-disable-line react-hooks/exhaustive-deps

  const autoInit = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp-web/status", { headers });
      const data = await res.json();
      setStatus(data.status);
      setQrCode(data.qrCode);
      if (data.status === "ready") {
        await loadChats();
        return;
      }
      if (data.status === "disconnected" && !connectCalledRef.current) {
        connectCalledRef.current = true;
        setStatus("launching");
        await fetch("/api/whatsapp-web/init", { method: "POST", headers });
      }
    } catch { /* server not up */ }
    startPolling();
  };

  const startPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/whatsapp-web/status", { headers });
        const data = await res.json();
        setStatus(data.status);
        setQrCode(data.qrCode);
        if (data.status === "ready") {
          clearInterval(pollIntervalRef.current!);
          pollIntervalRef.current = null;
          await loadChats();
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  const loadChats = useCallback(async () => {
    setLoadingChats(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/whatsapp-web/chats", { headers });
      const data = await res.json();
      const chatList: Chat[] = data.chats || [];
      // Sort: unread first, then by timestamp descending
      chatList.sort((a, b) => {
        if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
        if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
        return (b.timestamp || 0) - (a.timestamp || 0);
      });
      setChats(chatList);
      setFilteredChats(chatList);

      // Start background chat list refresh every 15s
      if (chatPollIntervalRef.current) clearInterval(chatPollIntervalRef.current);
      chatPollIntervalRef.current = setInterval(async () => {
        try {
          const h = await getAuthHeaders();
          const r = await fetch("/api/whatsapp-web/chats", { headers: h });
          const d = await r.json();
          const list: Chat[] = d.chats || [];
          list.sort((a, b) => {
            if (a.unreadCount > 0 && b.unreadCount === 0) return -1;
            if (a.unreadCount === 0 && b.unreadCount > 0) return 1;
            return (b.timestamp || 0) - (a.timestamp || 0);
          });
          setChats(list);
        } catch { /* ignore */ }
      }, 15000);
    } catch {
      setError("Failed to load chats");
    } finally {
      setLoadingChats(false);
    }
  }, []);

  const openChat = async (chat: Chat) => {
    setSelectedChat(chat);
    setMessages([]);
    setLoadingMessages(true);
    isFirstLoad.current = true;
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp-web/messages/${encodeURIComponent(chat.id)}`, { headers });
      const data = await res.json();
      setMessages(data.messages || []);
      setTimeout(() => scrollToBottom("instant"), 50);
    } catch {
      setError("Failed to load messages");
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim() || !selectedChat) return;
    const text = messageInput.trim();
    setMessageInput("");
    setSending(true);
    setError(null);

    const chatId = selectedChat.id;
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      body: text,
      fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      author: "me",
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom("smooth"), 30);

    try {
      const headers = await getAuthHeaders();
      const sendRes = await fetch("/api/whatsapp-web/send", {
        method: "POST",
        headers,
        body: JSON.stringify({ chatId, message: text }),
      });
      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        throw new Error((errData as { error?: string }).error || `Send failed (${sendRes.status})`);
      }
      // Replace optimistic with real messages after short delay
      setTimeout(async () => {
        try {
          const h = await getAuthHeaders();
          const r = await fetch(`/api/whatsapp-web/messages/${encodeURIComponent(chatId)}`, { headers: h });
          const d = await r.json();
          const realMsgs: Message[] = d.messages || [];
          if (realMsgs.length > 0) {
            setMessages(prev => {
              if (!prev.some(m => m.id === optimisticId)) return prev;
              const prevNoOpt = prev.filter(m => m.id !== optimisticId);
              return realMsgs.length >= prevNoOpt.length ? realMsgs : prev;
            });
          }
        } catch { /* ignore */ }
      }, 1500);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send message");
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setMessageInput(text);
    } finally {
      setSending(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      const headers = await getAuthHeaders();
      await fetch("/api/whatsapp-web/init", { method: "POST", headers, body: JSON.stringify({ action: "disconnect" }) });
      setStatus("disconnected");
      setChats([]);
      setSelectedChat(null);
      setMessages([]);
      connectCalledRef.current = false;
    } catch { /* ignore */ }
  };

  const formatTime = (ts: number) =>
    new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const formatChatTime = (ts?: number) => {
    if (!ts) return "";
    const d = new Date(ts * 1000);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    }
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  };

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let lastDate = "";
  for (const msg of messages) {
    const dateStr = formatDate(msg.timestamp);
    if (dateStr !== lastDate) {
      groupedMessages.push({ date: dateStr, messages: [msg] });
      lastDate = dateStr;
    } else {
      groupedMessages[groupedMessages.length - 1].messages.push(msg);
    }
  }

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-slate-900/20 backdrop-blur-[2px]" onClick={onClose} />

      {/* Panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-md flex-col border-l border-slate-200/80 bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-green-600 to-green-700 px-4 py-3">
          <div className="flex items-center gap-2 text-white">
            {selectedChat ? (
              <button onClick={() => { setSelectedChat(null); setMessages([]); }} className="rounded-full p-1 hover:bg-white/20">
                <ArrowLeft className="h-4 w-4" />
              </button>
            ) : (
              <span className="text-white">{WA_ICON}</span>
            )}
            <div>
              <h2 className="text-sm font-semibold">
                {selectedChat ? selectedChat.name : "WhatsApp"}
              </h2>
              {!selectedChat && (
                <p className="text-[10px] text-green-100">
                  {status === "ready" ? `${chats.length} chats` : status === "qr" ? "Scan QR to connect" : status}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {status === "ready" && (
              <button
                onClick={handleDisconnect}
                className="rounded-full p-1.5 text-green-100 hover:bg-white/20 hover:text-white"
                title="Disconnect session"
              >
                <WifiOff className="h-3.5 w-3.5" />
              </button>
            )}
            <button onClick={onClose} className="rounded-full p-1.5 text-green-100 hover:bg-white/20 hover:text-white">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        {!selectedChat && (
          <div className="flex border-b border-slate-100 bg-white">
            <button
              onClick={() => setActiveTab('chats')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors ${
                activeTab === 'chats'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Chats
            </button>
            <button
              onClick={() => setActiveTab('notifications')}
              className={`flex-1 px-4 py-2 text-xs font-medium transition-colors relative ${
                activeTab === 'notifications'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
              }`}
            >
              Notifications
              {notifications.length > 0 && (
                <span className="ml-1.5 inline-flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold text-white">
                  {notifications.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* QR / Connecting states */}
        {status !== "ready" && activeTab === 'chats' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
            {(status === "qr" || status === "qr_pending") && qrCode ? (
              <>
                <QrCode className="h-8 w-8 text-green-600" />
                <p className="text-sm font-medium text-slate-700">Scan QR Code with WhatsApp</p>
                <div className="rounded-xl border-2 border-green-200 bg-white p-3 shadow-lg">
                  <img src={qrCode} alt="QR Code" className="h-52 w-52" />
                </div>
                <p className="text-center text-xs text-slate-500">
                  Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
                </p>
              </>
            ) : status === "disconnected" ? (
              <>
                <WifiOff className="h-8 w-8 text-slate-400" />
                <p className="text-sm font-medium text-slate-700">WhatsApp Disconnected</p>
                <button
                  onClick={async () => {
                    connectCalledRef.current = false;
                    await autoInit();
                  }}
                  className="rounded-full bg-green-600 px-4 py-2 text-sm font-medium text-white shadow hover:bg-green-700"
                >
                  Connect WhatsApp
                </button>
              </>
            ) : (
              <>
                <Loader2 className="h-8 w-8 animate-spin text-green-600" />
                <p className="text-sm text-slate-600">
                  {status === "launching" ? "Initializing WhatsApp..." :
                   status === "authenticated" ? "Loading session..." :
                   "Connecting..."}
                </p>
              </>
            )}
          </div>
        )}

        {/* Chat list view */}
        {status === "ready" && !selectedChat && activeTab === 'chats' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Search */}
            <div className="border-b border-slate-100 px-3 py-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={chatSearch}
                  onChange={(e) => setChatSearch(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs text-slate-900 placeholder-slate-400 focus:border-green-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                />
              </div>
            </div>

            {/* Chat list */}
            <div className="flex-1 overflow-y-auto">
              {loadingChats ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <MessageSquare className="mb-2 h-8 w-8" />
                  <p className="text-xs">{chatSearch ? "No chats found" : "No chats yet"}</p>
                </div>
              ) : (
                filteredChats.map(chat => (
                  <button
                    key={chat.id}
                    onClick={() => openChat(chat)}
                    className="flex w-full items-center gap-3 border-b border-slate-50 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                  >
                    {/* Avatar */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-green-400 to-green-600 text-sm font-semibold text-white">
                      {chat.isGroup ? (
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>
                      ) : (
                        (chat.name?.[0] || "?").toUpperCase()
                      )}
                    </div>
                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-slate-800 truncate">{chat.name || chat.id}</span>
                        <span className="flex-shrink-0 text-[10px] text-slate-400">{formatChatTime(chat.timestamp)}</span>
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-slate-500">{chat.lastMessage || "\u00A0"}</p>
                    </div>
                    {/* Unread badge */}
                    {chat.unreadCount > 0 && (
                      <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-green-500 px-1.5 text-[10px] font-bold text-white">
                        {chat.unreadCount}
                      </span>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Notifications view */}
        {!selectedChat && activeTab === 'notifications' && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {loadingNotifications ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-5 w-5 animate-spin text-green-600" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <svg className="mb-3 h-10 w-10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm font-medium text-slate-600">All caught up!</p>
                <p className="mt-1 text-xs text-slate-400">No pending or failed messages</p>
              </div>
            ) : (
              <>
                {/* Header with retry all */}
                {notifications.some((n: any) => n.status === 'failed' || n.status === 'session_failed') && (
                  <div className="flex items-center justify-between border-b border-slate-100 bg-amber-50 px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" /></svg>
                      <span className="text-[11px] font-medium text-amber-800">
                        {notifications.filter((n: any) => n.status === 'failed' || n.status === 'session_failed').length} message(s) need attention
                      </span>
                    </div>
                    <button
                      onClick={() => void retryAll()}
                      className="rounded-md bg-green-600 px-3 py-1 text-[11px] font-medium text-white hover:bg-green-700 transition-colors"
                    >
                      Retry All
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {notifications.map((item: any) => {
                    const isSessionFailed = item.status === 'session_failed';
                    const isFailed = item.status === 'failed';
                    const isPending = item.status === 'pending';
                    const isSending = item.status === 'sending';
                    const canRetry = isSessionFailed || isFailed;

                    return (
                      <div key={item.id} className={`border-b border-slate-100 px-4 py-3 ${canRetry ? 'bg-red-50/30' : ''}`}>
                        {/* Status + time */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            {isSessionFailed && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0" /></svg>
                                Session Disconnected
                              </span>
                            )}
                            {isFailed && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" /></svg>
                                Send Failed
                              </span>
                            )}
                            {isPending && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                Queued
                              </span>
                            )}
                            {isSending && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                                <Loader2 className="h-3 w-3 animate-spin" />
                                Sending...
                              </span>
                            )}
                          </div>
                          <span className="text-[10px] text-slate-400">
                            {new Date(item.created_at).toLocaleDateString()} {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>

                        {/* Recipient */}
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-semibold text-slate-600">
                            {item.patient ? (item.patient.first_name?.[0] || '?') : item.to_phone.slice(-2)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-slate-800 truncate">
                              {item.patient ? `${item.patient.first_name} ${item.patient.last_name}` : item.to_phone}
                            </p>
                            {item.patient && <p className="text-[10px] text-slate-400">{item.to_phone}</p>}
                          </div>
                        </div>

                        {/* Message preview */}
                        <p className="text-[11px] text-slate-600 mb-2 line-clamp-2 bg-white rounded-md px-2.5 py-1.5 border border-slate-100">{item.message_body}</p>

                        {/* Error explanation */}
                        {isSessionFailed && (
                          <div className="mb-2 rounded-md bg-orange-50 border border-orange-200 px-2.5 py-1.5">
                            <p className="text-[10px] font-medium text-orange-800">Your WhatsApp session was disconnected when this message was queued.</p>
                            <p className="text-[10px] text-orange-600 mt-0.5">Session is now reconnected — tap Retry to resend.</p>
                          </div>
                        )}
                        {isFailed && !isSessionFailed && (
                          <div className="mb-2 rounded-md bg-red-50 border border-red-200 px-2.5 py-1.5">
                            <p className="text-[10px] font-medium text-red-800">Failed after {item.retry_count} attempts</p>
                            {item.error_message && <p className="text-[10px] text-red-600 mt-0.5">{item.error_message}</p>}
                          </div>
                        )}

                        {/* Meta info */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-slate-400 mb-2">
                          {item.workflow && (
                            <span className="inline-flex items-center gap-0.5">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" /></svg>
                              {item.workflow.name}
                            </span>
                          )}
                          {item.deal && (
                            <span className="inline-flex items-center gap-0.5">
                              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" /></svg>
                              {item.deal.name}
                            </span>
                          )}
                          <span>Attempts: {item.retry_count}</span>
                        </div>

                        {/* Action buttons */}
                        {canRetry && (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => void retryItem(item.id)}
                              className="flex-1 rounded-md bg-green-600 px-3 py-1.5 text-[11px] font-medium text-white hover:bg-green-700 transition-colors flex items-center justify-center gap-1"
                            >
                              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" /></svg>
                              Retry Now
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Message view */}
        {status === "ready" && selectedChat && (
          <div className="flex flex-1 flex-col overflow-hidden">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto bg-[#e5ddd5] px-3 py-2" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4cfc4' fill-opacity='0.2'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E\")" }}>
              {loadingMessages ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-5 w-5 animate-spin text-green-600" />
                </div>
              ) : messages.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-slate-400">
                  <p className="text-xs">No messages yet</p>
                </div>
              ) : (
                groupedMessages.map((group, gi) => (
                  <div key={gi}>
                    <div className="my-2 flex justify-center">
                      <span className="rounded-lg bg-white/80 px-3 py-0.5 text-[10px] font-medium text-slate-500 shadow-sm">{group.date}</span>
                    </div>
                    {group.messages.map(msg => (
                      <div key={msg.id} className={`mb-1.5 flex ${msg.fromMe ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-xs shadow-sm ${
                          msg.fromMe
                            ? "bg-[#dcf8c6] text-slate-800"
                            : "bg-white text-slate-800"
                        } ${msg.id.startsWith("optimistic-") ? "opacity-60" : ""}`}>
                          {/* Sender name for non-own messages */}
                          {!msg.fromMe && msg.authorName && (
                            <p className="mb-0.5 text-[10px] font-semibold text-green-700">{msg.authorName}</p>
                          )}
                          {!msg.fromMe && !msg.authorName && msg.author && (
                            <p className="mb-0.5 text-[10px] font-medium text-slate-400">{msg.author.replace(/@(c\.us|lid|g\.us)$/g, "")}</p>
                          )}
                          {/* Media: image */}
                          {msg.hasMedia && msg.media?.data && msg.media.mimetype?.startsWith("image/") && (
                            <img
                              src={`data:${msg.media.mimetype};base64,${msg.media.data}`}
                              alt=""
                              className="mb-1 max-w-full cursor-pointer rounded-md transition-opacity hover:opacity-90"
                              style={{ maxHeight: 240 }}
                              onClick={() => setPreviewImage(`data:${msg.media!.mimetype};base64,${msg.media!.data}`)}
                            />
                          )}
                          {/* Media: video thumbnail */}
                          {msg.hasMedia && msg.media?.data && msg.media.mimetype?.startsWith("video/") && (
                            <div className="relative mb-1">
                              <video
                                src={`data:${msg.media.mimetype};base64,${msg.media.data}`}
                                className="max-w-full rounded-md"
                                style={{ maxHeight: 240 }}
                                controls
                                preload="metadata"
                              />
                            </div>
                          )}
                          {/* Media: no data available (too large or download failed) */}
                          {msg.hasMedia && !msg.media?.data && (
                            <div className="mb-1.5 flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-100/80 px-6 py-5 min-w-[160px]">
                              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                                {msg.type === "sticker" ? (
                                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>
                                ) : msg.type === "document" || msg.type === "ptt" || msg.type === "audio" ? (
                                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                                ) : (
                                  <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5a1.5 1.5 0 001.5 1.5z" /></svg>
                                )}
                              </div>
                              <span className="text-[11px] font-medium text-slate-500">
                                {msg.media?.filename || (msg.type === "sticker" ? "Sticker" : msg.type === "ptt" ? "Voice message" : msg.type === "audio" ? "Audio" : msg.type === "document" ? "Document" : msg.type === "video" ? "Video" : "Photo")}
                              </span>
                            </div>
                          )}
                          {/* Message text */}
                          {msg.body && <p className="whitespace-pre-wrap break-words">{msg.body}</p>}
                          <div className={`mt-0.5 text-right text-[9px] ${msg.fromMe ? "text-green-700/60" : "text-slate-400"}`}>
                            {formatTime(msg.timestamp)}
                            {msg.fromMe && msg.id.startsWith("optimistic-") && " ⏳"}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ))
              )}
              <div ref={messagesEndRef} />
            </div>


            {/* Error */}
            {error && (
              <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-[11px] text-red-600">{error}</div>
            )}

            {/* Input */}
            <div className="border-t border-slate-200 bg-slate-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={messageInput}
                  onChange={(e) => setMessageInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
                  placeholder="Type a message..."
                  disabled={sending}
                  className="flex-1 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:border-green-400 focus:outline-none focus:ring-1 focus:ring-green-400 disabled:opacity-50"
                />
                <button
                  onClick={() => void handleSend()}
                  disabled={sending || !messageInput.trim()}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-green-600 text-white shadow hover:bg-green-700 disabled:opacity-40"
                >
                  {sending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

    <ImagePreviewPortal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  );
}
