"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { MessageSquare, Send, Loader2, Phone } from "lucide-react";
import { supabaseClient } from '@/lib/supabaseClient';
import ImagePreviewPortal from '@/components/ImagePreviewPortal';

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

interface WhatsAppWebConversationProps {
  patientPhone: string | null;
  patientName?: string;
}

const WA_ICON = (
  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
  </svg>
);

// Normalize a phone number to digits only, then build a WhatsApp chat ID
function phoneToWaChatId(phone: string): string {
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '');
  // Swiss local: 07x -> 417x
  // Already international without +: 417x -> keep
  // Had + prefix stripped above, so 41... is fine
  const normalized = digits.startsWith('0') ? '41' + digits.slice(1) : digits;
  return `${normalized}@c.us`;
}

export default function WhatsAppWebConversation({
  patientPhone,
  patientName = "Patient",
}: WhatsAppWebConversationProps) {
  const [status, setStatus] = useState<'disconnected' | 'launching' | 'qr' | 'qr_pending' | 'authenticated' | 'ready'>('disconnected');
  const connectCalledRef = useRef(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [patientChat, setPatientChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [messageInput, setMessageInput] = useState('');
  const [loadingChat, setLoadingChat] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // true = patient has no existing chat yet (new conversation)
  const [isNewChat, setIsNewChat] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const msgPollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isFirstLoad = useRef(true);
  const isSendingRef = useRef(false);

  // Get auth headers for API calls
  const getAuthHeaders = async () => {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (!session?.access_token) {
      throw new Error('Not authenticated');
    }
    return {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    };
  };

  // Only scroll to bottom on first load or when WE send a message
  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  // Keep isSendingRef in sync so the poll can check it without stale closure
  useEffect(() => { isSendingRef.current = sending; }, [sending]);

  // Auto-initialize on mount
  useEffect(() => {
    void autoInit();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
      if (msgPollIntervalRef.current) clearInterval(msgPollIntervalRef.current);
    };
  }, []);

  // Re-load chat whenever patientPhone changes (e.g. number updated in DB)
  useEffect(() => {
    if (status === 'ready' && patientPhone) {
      isFirstLoad.current = true;
      setPatientChat(null);
      setMessages([]);
      setIsNewChat(false);
      void loadPatientChat();
    }
  }, [patientPhone, status]);  // eslint-disable-line react-hooks/exhaustive-deps

  // Poll for new incoming messages every 4s while a chat is loaded
  useEffect(() => {
    if (msgPollIntervalRef.current) clearInterval(msgPollIntervalRef.current);
    if (!patientChat || isNewChat) return;

    const chatId = patientChat.id;
    msgPollIntervalRef.current = setInterval(async () => {
      // Skip if we're mid-send to avoid race with optimistic messages
      if (isSendingRef.current) return;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/whatsapp-web/messages/${encodeURIComponent(chatId)}`, { headers });
        const data = await res.json();
        const incoming: Message[] = data.messages || [];
        if (incoming.length === 0) return;
        setMessages(prev => {
          // Don't update if there are pending optimistic messages
          if (prev.some(m => m.id.startsWith('optimistic-'))) return prev;
          // Only update if something actually changed (new message arrived)
          const lastPrevId = prev[prev.length - 1]?.id;
          const lastIncomingId = incoming[incoming.length - 1]?.id;
          if (lastPrevId === lastIncomingId && prev.length === incoming.length) return prev;
          // Scroll to bottom only if a NEW incoming (not fromMe) message arrived
          const lastMsg = incoming[incoming.length - 1];
          const hadIt = prev.some(m => m.id === lastMsg.id);
          if (!hadIt && !lastMsg.fromMe) {
            setTimeout(() => scrollToBottom('smooth'), 50);
          }
          return incoming;
        });
      } catch { /* ignore */ }
    }, 4000);

    return () => {
      if (msgPollIntervalRef.current) clearInterval(msgPollIntervalRef.current);
    };
  }, [patientChat, isNewChat]);  // eslint-disable-line react-hooks/exhaustive-deps

  const handleConnect = async () => {
    if (connectCalledRef.current) return;
    connectCalledRef.current = true;
    try {
      const headers = await getAuthHeaders();
      setStatus('launching');
      await fetch('/api/whatsapp-web/init', { method: 'POST', headers });
    } catch (err) {
      console.error('Failed to connect:', err);
    }
  };

  const autoInit = async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/whatsapp-web/status', { headers });
      const data = await res.json();
      setStatus(data.status);
      setQrCode(data.qrCode);
      if (data.status === 'ready') {
        await loadPatientChat();
        return;
      }
      // If disconnected, auto-connect once
      if (data.status === 'disconnected') {
        await handleConnect();
      }
    } catch { /* server not up yet */ }
    startPolling();
  };

  const startPolling = () => {
    if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    pollIntervalRef.current = setInterval(async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/whatsapp-web/status', { headers });
        const data = await res.json();
        setStatus(data.status);
        setQrCode(data.qrCode);
        if (data.status === 'ready') {
          clearInterval(pollIntervalRef.current!);
          await loadPatientChat();
        }
      } catch { /* ignore */ }
    }, 2000);
  };

  const loadPatientChat = useCallback(async () => {
    if (!patientPhone) return;
    setLoadingChat(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      // Run both in parallel — chats list is used as fast fallback
      const [chatRes, chatsRes] = await Promise.all([
        fetch(`/api/whatsapp-web/chat-by-phone?phone=${encodeURIComponent(patientPhone)}`, { headers }),
        fetch('/api/whatsapp-web/chats', { headers }),
      ]);
      const chatData = await chatRes.json();
      const chatsData = await chatsRes.json();

      let found: Chat | null = chatData.chat ?? null;

      // Fast client-side fallback: match by last 9 digits in the chat list
      if (!found) {
        const digits = patientPhone.replace(/\D/g, '');
        const normalized = digits.startsWith('0') ? '41' + digits.slice(1) : digits;
        const suffix = normalized.slice(-9);
        const chatList: Chat[] = chatsData.chats || [];
        found = chatList.find(c => c.id.replace('@c.us', '').endsWith(suffix)) ?? null;
      }

      if (found) {
        setPatientChat(found);
        setIsNewChat(false);
        await fetchMessages(found, true);
      } else {
        setIsNewChat(true);
        setPatientChat(null);
        setMessages([]);
      }
    } catch {
      setError('Failed to load chat');
    } finally {
      setLoadingChat(false);
    }
  }, [patientPhone]);

  const fetchMessages = async (chat: Chat, scrollInstant = false) => {
    setLoadingMessages(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/whatsapp-web/messages/${encodeURIComponent(chat.id)}`, { headers });
      const data = await res.json();
      setMessages(data.messages || []);
      // Scroll to bottom after initial load
      if (isFirstLoad.current) {
        isFirstLoad.current = false;
        setTimeout(() => scrollToBottom(scrollInstant ? 'instant' : 'smooth'), 50);
      }
    } catch {
      setError('Failed to load messages');
    } finally {
      setLoadingMessages(false);
    }
  };

  const handleSend = async () => {
    if (!messageInput.trim()) return;
    if (!patientPhone) return;

    const text = messageInput.trim();
    setMessageInput('');
    setSending(true);
    setError(null);

    // Capture chatId NOW (closure) so background refresh uses the correct chat
    const chatId = patientChat?.id ?? phoneToWaChatId(patientPhone);
    const wasNewChat = isNewChat;

    // Optimistically append the message so there's no scroll reset
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: optimisticId,
      body: text,
      fromMe: true,
      timestamp: Math.floor(Date.now() / 1000),
      author: 'me',
    };
    setMessages(prev => [...prev, optimisticMsg]);
    setTimeout(() => scrollToBottom('smooth'), 30);

    try {
      const headers = await getAuthHeaders();
      const sendRes = await fetch('/api/whatsapp-web/send', {
        method: 'POST',
        headers,
        body: JSON.stringify({ chatId, message: text }),
      });

      if (!sendRes.ok) {
        const errData = await sendRes.json().catch(() => ({}));
        throw new Error(errData.error || `Send failed (${sendRes.status})`);
      }

      if (wasNewChat) {
        // Keep messages visible; set a synthetic chat so future sends use the right ID
        const synthId = phoneToWaChatId(patientPhone);
        setPatientChat({ id: synthId, name: patientName, isGroup: false, unreadCount: 0, lastMessage: text });
        setIsNewChat(false);
        // Quietly upgrade to real chat object after WhatsApp creates it
        setTimeout(async () => {
          try {
            const headers = await getAuthHeaders();
            const r = await fetch(`/api/whatsapp-web/chat-by-phone?phone=${encodeURIComponent(patientPhone)}`, { headers });
            const d = await r.json();
            if (d.chat) setPatientChat(d.chat);
          } catch { /* ignore */ }
        }, 2500);
      } else {
        // Silently replace optimistic msg with confirmed messages from server
        // Use the captured chatId (not stale patientChat.id from closure)
        setTimeout(async () => {
          try {
            const headers = await getAuthHeaders();
            const res = await fetch(`/api/whatsapp-web/messages/${encodeURIComponent(chatId)}`, { headers });
            const data = await res.json();
            const realMsgs: Message[] = data.messages || [];
            if (realMsgs.length > 0) {
              // Merge: keep optimistic if server doesn't have it yet, replace if it does
              setMessages(prev => {
                const hasOptimistic = prev.some(m => m.id === optimisticId);
                if (!hasOptimistic) return prev; // already replaced
                // If server returned more messages than we had before the optimistic, use server list
                const prevWithoutOptimistic = prev.filter(m => m.id !== optimisticId);
                if (realMsgs.length >= prevWithoutOptimistic.length) {
                  return realMsgs;
                }
                return prev; // server not caught up yet, keep optimistic
              });
            }
          } catch { /* ignore */ }
        }, 1500);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to send message');
      setMessages(prev => prev.filter(m => m.id !== optimisticId));
      setMessageInput(text);
    } finally {
      setSending(false);
    }
  };

  const formatTime = (ts: number) =>
    new Date(ts * 1000).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Today";
    if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };

  const messagesByDate = messages.reduce((acc, msg) => {
    const key = formatDate(msg.timestamp);
    if (!acc[key]) acc[key] = [];
    acc[key].push(msg);
    return acc;
  }, {} as Record<string, Message[]>);

  // ── Header ──────────────────────────────────────────────────────────────────
  const header = (subtitle: React.ReactNode) => (
    <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-emerald-50 to-green-50 px-4 py-3 flex-shrink-0">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          {WA_ICON}
        </div>
        <div>
          <h3 className="text-sm font-semibold text-slate-900">WhatsApp</h3>
          <div className="text-xs text-slate-500">{subtitle}</div>
        </div>
      </div>
    </div>
  );

  // ── Pre-ready states ────────────────────────────────────────────────────────
  if (status !== 'ready') {
    const isQr = (status === 'qr' || status === 'qr_pending') && qrCode;
    const statusLabel: Record<string, string> = {
      disconnected: 'Waiting for server…',
      launching: 'Launching Chromium…',
      qr: 'Scan QR Code to connect',
      qr_pending: 'Scan QR Code to connect',
      authenticated: 'Finalising connection…',
    };

    return (
      <div className="flex flex-col h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {header(isQr ? statusLabel[status] : (
          <span className="flex items-center gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" />
            {statusLabel[status]}
          </span>
        ))}
        <div className="flex-1 flex items-center justify-center bg-slate-50/30 p-8">
          {isQr ? (
            <div className="text-center max-w-sm">
              <div className="bg-white p-4 rounded-xl shadow-lg inline-block mb-5">
                <img src={qrCode!} alt="WhatsApp QR Code" className="w-56 h-56" />
              </div>
              <p className="text-sm font-medium text-slate-800 mb-3">Scan with WhatsApp on your phone</p>
              <ol className="text-xs text-slate-600 text-left space-y-1.5 bg-white rounded-lg p-4 shadow-sm">
                <li className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex-shrink-0 mt-0.5">1</span>
                  Open WhatsApp on your phone
                </li>
                <li className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex-shrink-0 mt-0.5">2</span>
                  Tap <strong className="mx-1">Settings → Linked Devices</strong>
                </li>
                <li className="flex items-start gap-2">
                  <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-bold flex-shrink-0 mt-0.5">3</span>
                  Tap <strong className="mx-1">Link a Device</strong> and scan
                </li>
              </ol>
              <p className="mt-3 text-[11px] text-slate-400">Session saved — no daily scanning needed</p>
            </div>
          ) : (
            <div className="text-center">
              <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mx-auto mb-3" />
              <p className="text-sm text-slate-600">{statusLabel[status]}</p>
              {(status === 'disconnected' || status === 'launching') && (
                <p className="text-xs text-slate-400 mt-2">
                  Make sure the WhatsApp server is running:<br />
                  <code className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">npm run whatsapp</code>
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Ready: no patient phone ─────────────────────────────────────────────────
  if (!patientPhone) {
    return (
      <div className="flex flex-col h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {header(<span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />Connected</span>)}
        <div className="flex-1 flex items-center justify-center bg-slate-50/30">
          <div className="text-center">
            <Phone className="h-10 w-10 text-slate-300 mx-auto mb-2" />
            <p className="text-sm text-slate-500">No phone number on file for this patient</p>
            <p className="text-xs text-slate-400 mt-1">Add a phone number to the patient profile to start messaging</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Ready: loading chat ─────────────────────────────────────────────────────
  if (loadingChat) {
    return (
      <div className="flex flex-col h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {header(<span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />Connected</span>)}
        <div className="flex-1 flex items-center justify-center bg-slate-50/30">
          <Loader2 className="h-7 w-7 animate-spin text-emerald-500" />
        </div>
      </div>
    );
  }

  // ── Shared message pane (used for both existing and new chats) ──────────────
  const chatName = patientChat?.name || patientName;
  const chatSubtitle = patientPhone;

  return (
    <>
      <div className="flex flex-col h-[600px] rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {header(<span className="flex items-center gap-1"><span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />Connected</span>)}

      {/* Chat header */}
      <div className="px-4 py-2.5 border-b bg-white flex items-center gap-3 flex-shrink-0">
        <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white text-sm font-semibold flex-shrink-0">
          {chatName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-slate-900 truncate">{chatName}</p>
          <p className="text-[11px] text-slate-400">{chatSubtitle}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto bg-[#f0f2f5] p-4 space-y-3">
        {loadingMessages ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
          </div>
        ) : isNewChat || messages.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center bg-white rounded-xl px-6 py-8 shadow-sm max-w-xs">
              <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <MessageSquare className="h-6 w-6 text-emerald-600" />
              </div>
              <p className="text-sm font-medium text-slate-800 mb-1">
                {isNewChat ? 'Start a conversation' : 'No messages yet'}
              </p>
              <p className="text-xs text-slate-500">
                {isNewChat
                  ? `Send the first message to ${patientName} at ${patientPhone}`
                  : 'Send a message below to get started'}
              </p>
            </div>
          </div>
        ) : (
          Object.entries(messagesByDate).map(([dateKey, msgs]) => (
            <div key={dateKey} className="space-y-1.5">
              <div className="flex justify-center my-2">
                <span className="rounded-full bg-white/80 shadow-sm px-3 py-0.5 text-[10px] font-medium text-slate-500">
                  {dateKey}
                </span>
              </div>
              {msgs.map(msg => (
                <div key={msg.id} className={`flex ${msg.fromMe ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
                    msg.fromMe
                      ? 'rounded-br-sm bg-[#dcf8c6] text-slate-900'
                      : 'rounded-bl-sm bg-white text-slate-900'
                  } ${msg.id.startsWith('optimistic-') ? 'opacity-70' : ''}`}>
                    {/* Sender name */}
                    {!msg.fromMe && msg.authorName && (
                      <p className="mb-0.5 text-[10px] font-semibold text-emerald-700">{msg.authorName}</p>
                    )}
                    {!msg.fromMe && !msg.authorName && msg.author && (
                      <p className="mb-0.5 text-[10px] font-medium text-slate-400">{msg.author.replace(/@(c\.us|lid|g\.us)$/g, '')}</p>
                    )}
                    {/* Media: image */}
                    {msg.hasMedia && msg.media?.data && msg.media.mimetype?.startsWith('image/') && (
                      <img
                        src={`data:${msg.media.mimetype};base64,${msg.media.data}`}
                        alt=""
                        className="mb-1 max-w-full cursor-pointer rounded-lg transition-opacity hover:opacity-90"
                        style={{ maxHeight: 240 }}
                        onClick={() => setPreviewImage(`data:${msg.media!.mimetype};base64,${msg.media!.data}`)}
                      />
                    )}
                    {/* Media: video */}
                    {msg.hasMedia && msg.media?.data && msg.media.mimetype?.startsWith('video/') && (
                      <video
                        src={`data:${msg.media.mimetype};base64,${msg.media.data}`}
                        className="mb-1 max-w-full rounded-lg"
                        style={{ maxHeight: 240 }}
                        controls
                        preload="metadata"
                      />
                    )}
                    {/* Media placeholder */}
                    {msg.hasMedia && !msg.media?.data && (
                      <div className="mb-1.5 flex flex-col items-center justify-center gap-2 rounded-lg bg-slate-100/80 px-6 py-5 min-w-[160px]">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200">
                          {msg.type === 'sticker' ? (
                            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M15.182 15.182a4.5 4.5 0 01-6.364 0M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" /></svg>
                          ) : msg.type === 'document' || msg.type === 'ptt' || msg.type === 'audio' ? (
                            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>
                          ) : (
                            <svg className="h-5 w-5 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5"><path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.41a2.25 2.25 0 013.182 0l2.909 2.91M3.75 21h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v13.5a1.5 1.5 0 001.5 1.5z" /></svg>
                          )}
                        </div>
                        <span className="text-[11px] font-medium text-slate-500">
                          {msg.media?.filename || (msg.type === 'sticker' ? 'Sticker' : msg.type === 'ptt' ? 'Voice message' : msg.type === 'audio' ? 'Audio' : msg.type === 'document' ? 'Document' : msg.type === 'video' ? 'Video' : 'Photo')}
                        </span>
                      </div>
                    )}
                    {msg.body && <p className="text-sm whitespace-pre-wrap break-words">{msg.body}</p>}
                    <p className="text-[10px] mt-0.5 text-right text-slate-400">
                      {formatTime(msg.timestamp)}
                      {msg.fromMe && <span className="ml-1">{msg.id.startsWith('optimistic-') ? '🕐' : '✓'}</span>}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>


      {/* Input */}
      <div className="border-t bg-white p-3 flex-shrink-0">
        {error && (
          <p className="mb-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1">{error}</p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={messageInput}
            onChange={e => setMessageInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
            placeholder={`Message ${patientName}…`}
            rows={2}
            disabled={sending}
            className="flex-1 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sending || !messageInput.trim()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <p className="mt-1 text-[10px] text-slate-400">Enter to send · Shift+Enter for new line</p>
      </div>
    </div>

    <ImagePreviewPortal imageUrl={previewImage} onClose={() => setPreviewImage(null)} />
    </>
  );
}
