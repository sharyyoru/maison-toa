"use client";

import { useState, useEffect, useRef, FormEvent } from "react";
import Image from "next/image";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function generateVisitorId(): string {
  const stored = typeof window !== "undefined" ? localStorage.getItem("aliice_visitor_id") : null;
  if (stored) return stored;
  
  const newId = `v_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  if (typeof window !== "undefined") {
    localStorage.setItem("aliice_visitor_id", newId);
  }
  return newId;
}

export default function EmbedChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [visitorId, setVisitorId] = useState<string>("");
  const [hasGreeted, setHasGreeted] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Attribution data
  const [attribution, setAttribution] = useState({
    sourceUrl: "",
    referrer: "",
    utmSource: "",
    utmMedium: "",
    utmCampaign: "",
    utmTerm: "",
    utmContent: "",
  });

  useEffect(() => {
    // Generate or retrieve visitor ID
    setVisitorId(generateVisitorId());
    
    // Capture attribution data
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      setAttribution({
        sourceUrl: window.location.href,
        referrer: document.referrer,
        utmSource: params.get("utm_source") || "",
        utmMedium: params.get("utm_medium") || "",
        utmCampaign: params.get("utm_campaign") || "",
        utmTerm: params.get("utm_term") || "",
        utmContent: params.get("utm_content") || "",
      });
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Send initial greeting when chat opens
  useEffect(() => {
    if (isOpen && !hasGreeted && messages.length === 0) {
      setHasGreeted(true);
      // Add initial assistant greeting
      setMessages([
        {
          id: "greeting",
          role: "assistant",
          content: "Hello! I'm Aliice, your virtual assistant at Maison Toa. How can I help you today? Whether you have questions about our treatments, want to learn more about our services, or would like to schedule a consultation, I'm here to assist! 💫",
        },
      ]);
    }
  }, [isOpen, hasGreeted, messages.length]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMessage: ChatMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: trimmed,
    };

    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const response = await fetch("/api/public/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          session: {
            sessionId,
            visitorId,
            sourceUrl: attribution.sourceUrl,
            referrer: attribution.referrer,
            utmSource: attribution.utmSource,
            utmMedium: attribution.utmMedium,
            utmCampaign: attribution.utmCampaign,
            utmTerm: attribution.utmTerm,
            utmContent: attribution.utmContent,
          },
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to get response");
      }

      const data = await response.json();
      
      if (data.sessionId && !sessionId) {
        setSessionId(data.sessionId);
      }

      if (data.message) {
        setMessages((prev) => [
          ...prev,
          {
            id: `assistant_${Date.now()}`,
            role: "assistant",
            content: data.message.content,
          },
        ]);
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          id: `error_${Date.now()}`,
          role: "assistant",
          content: "I'm sorry, I'm having trouble connecting right now. Please try again in a moment, or contact us directly at info@maisontoa.com",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as unknown as FormEvent);
    }
  }

  // Widget mode - floating button + expandable chat
  return (
    <div className="fixed bottom-4 right-4 z-50 font-sans">
      {/* Chat Window */}
      {isOpen && (
        <div className="mb-4 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl bg-white shadow-2xl border border-slate-200 overflow-hidden flex flex-col animate-in slide-in-from-bottom-4 duration-300">
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-500 to-indigo-600 px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="relative">
                <Image
                  src="/logos/aliice-avatar.png"
                  alt="Aliice"
                  width={40}
                  height={40}
                  className="rounded-full border-2 border-white/30"
                  onError={(e) => {
                    e.currentTarget.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 40 40'%3E%3Ccircle cx='20' cy='20' r='20' fill='%23818cf8'/%3E%3Ctext x='20' y='26' text-anchor='middle' fill='white' font-size='16' font-weight='bold'%3EA%3C/text%3E%3C/svg%3E";
                  }}
                />
                <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-400 border-2 border-white rounded-full"></span>
              </div>
              <div>
                <h3 className="text-white font-semibold text-sm">Aliice</h3>
                <p className="text-white/80 text-xs">Maison Toa Assistant</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="text-white/80 hover:text-white p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px] min-h-[300px] bg-slate-50">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm ${
                    message.role === "user"
                      ? "bg-gradient-to-r from-sky-500 to-indigo-600 text-white rounded-br-md"
                      : "bg-white text-slate-700 shadow-sm border border-slate-100 rounded-bl-md"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-start">
                <div className="bg-white rounded-2xl rounded-bl-md px-4 py-3 shadow-sm border border-slate-100">
                  <div className="flex gap-1.5">
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-2 h-2 bg-slate-300 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="p-3 bg-white border-t border-slate-100">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Type your message..."
                rows={1}
                className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                style={{ maxHeight: "100px" }}
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="flex-shrink-0 rounded-xl bg-gradient-to-r from-sky-500 to-indigo-600 p-2.5 text-white shadow-sm hover:from-sky-600 hover:to-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                </svg>
              </button>
            </div>
            <p className="text-[10px] text-slate-400 text-center mt-2">
              Powered by Aliice AI • Maison Toa
            </p>
          </form>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`group relative w-16 h-16 rounded-full shadow-lg transition-all duration-300 ${
          isOpen
            ? "bg-slate-600 hover:bg-slate-700 scale-90"
            : "bg-gradient-to-r from-sky-500 to-indigo-600 hover:from-sky-600 hover:to-indigo-700 hover:scale-105"
        }`}
      >
        {isOpen ? (
          <svg className="w-6 h-6 text-white mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <>
            <Image
              src="/logos/aliice-avatar.png"
              alt="Chat with Aliice"
              width={64}
              height={64}
              className="rounded-full"
              onError={(e) => {
                e.currentTarget.style.display = "none";
                const parent = e.currentTarget.parentElement;
                if (parent) {
                  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
                  svg.setAttribute("class", "w-8 h-8 text-white mx-auto");
                  svg.setAttribute("fill", "none");
                  svg.setAttribute("viewBox", "0 0 24 24");
                  svg.setAttribute("stroke", "currentColor");
                  svg.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />';
                  parent.appendChild(svg);
                }
              }}
            />
            {/* Notification dot for unread */}
            {!isOpen && messages.length === 0 && (
              <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 border-2 border-white rounded-full animate-pulse"></span>
            )}
          </>
        )}
        
        {/* Tooltip */}
        {!isOpen && (
          <div className="absolute bottom-full right-0 mb-2 px-3 py-1.5 bg-slate-800 text-white text-sm rounded-lg opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none">
            Chat with Aliice
            <div className="absolute top-full right-4 w-2 h-2 bg-slate-800 transform rotate-45 -mt-1"></div>
          </div>
        )}
      </button>
    </div>
  );
}
