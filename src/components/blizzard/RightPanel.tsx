"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { usePatientTabs } from "../PatientTabsContext";
import { supabaseClient } from "@/lib/supabaseClient";

type PatientResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type Props = {
  collapsed: boolean;
  onToggle: () => void;
};

export default function RightPanel({ collapsed, onToggle }: Props) {
  const router = useRouter();
  const { tabs, activePatientId, removeTab } = usePatientTabs();
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<PatientResult[]>([]);
  const [searching, setSearching] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearch = (query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    searchTimeoutRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const { data } = await supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone")
          .or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,email.ilike.%${query}%,phone.ilike.%${query}%`)
          .limit(8);
        setSearchResults((data || []) as PatientResult[]);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  };

  const selectPatient = (id: string) => {
    setSearchQuery("");
    setSearchResults([]);
    router.push(`/patients/${id}`);
  };

  if (collapsed) {
    return (
      <div className="flex flex-col items-center border-l border-[var(--blz-border)] bg-[var(--blz-surface)] py-3 px-1.5 w-10">
        <button
          onClick={onToggle}
          className="flex h-7 w-7 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)] transition-colors"
          title="Expand panel"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <aside className="flex w-72 flex-col border-l border-[var(--blz-border)] bg-[var(--blz-surface)] overflow-hidden">
      <div className="flex items-center justify-between border-b border-[var(--blz-border)] px-3 py-2">
        <div className="flex items-center gap-2">
          <button className="flex h-7 w-7 items-center justify-center rounded bg-[var(--blz-hover)] text-[var(--blz-text-secondary)]" title="Patients">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
              <path d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
            </svg>
          </button>
          <button
            onClick={() => router.push("/chat")}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-secondary)] transition-colors"
            title="Chat with Aliice"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 6h16v9H8l-4 3z" />
              <path d="M8 10h8M8 13h5" />
            </svg>
          </button>
        </div>
        <div className="flex items-center gap-1">
          <div className="group relative flex items-center justify-center">
            <Link
              href="/add-patients"
              className="flex h-7 w-7 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)] transition-colors"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </Link>
            <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--blz-surface-elevated)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--blz-text-primary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
              Add patient
              <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[var(--blz-surface-elevated)]" />
            </div>
          </div>
          <button
            onClick={onToggle}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)] transition-colors"
            title="Collapse panel"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 18l6-6-6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div className="px-3 py-2">
        <div className="relative">
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--blz-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21-4.35-4.35" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search patients..."
            className="w-full rounded-lg border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--blz-text-primary)] placeholder:text-[var(--blz-text-muted)] focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"
          />
        </div>
        {searchQuery && (
          <div className="mt-1 max-h-48 overflow-y-auto rounded-lg border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)]">
            {searching ? (
              <div className="py-3 text-center text-xs text-[var(--blz-text-muted)]">Searching...</div>
            ) : searchResults.length > 0 ? (
              searchResults.map((p) => (
                <button
                  key={p.id}
                  onClick={() => selectPatient(p.id)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--blz-text-secondary)] hover:bg-[var(--blz-hover)]"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-sky-500/20 text-sky-500 dark:text-sky-400 text-[10px] font-semibold flex-shrink-0">
                    {(p.first_name?.[0] || "").toUpperCase()}{(p.last_name?.[0] || "").toUpperCase()}
                  </span>
                  <span className="truncate">{p.first_name} {p.last_name}</span>
                </button>
              ))
            ) : (
              <div className="py-3 text-center text-xs text-[var(--blz-text-muted)]">No results</div>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto px-1">
        <div className="px-2 py-1.5">
          <span className="text-[10px] font-semibold tracking-wider text-[var(--blz-text-muted)] uppercase">
            Open Patients &middot; {tabs.length}
          </span>
        </div>
        <div className="space-y-0.5">
          {tabs.map((tab) => {
            const isActive = tab.id === activePatientId;
            const initials = `${tab.firstName?.[0] ?? ""}${tab.lastName?.[0] ?? ""}`.toUpperCase() || "?";
            const displayName = `${tab.firstName ?? ""} ${tab.lastName ?? ""}`.trim() || "Unknown";

            return (
              <div
                key={tab.id}
                className={`group flex items-center gap-2 rounded-lg px-2 py-1.5 cursor-pointer transition-colors ${
                  isActive ? "bg-sky-500/10" : "hover:bg-[var(--blz-hover)]"
                }`}
                onClick={() => router.push(`/patients/${tab.id}`)}
              >
                <span className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-semibold flex-shrink-0 ${
                  isActive ? "bg-sky-500/20 text-sky-500 dark:text-sky-400" : "bg-[var(--blz-hover)] text-[var(--blz-text-muted)]"
                }`}>
                  {initials}
                </span>
                <span className={`flex-1 truncate text-xs ${isActive ? "text-[var(--blz-text-primary)] font-medium" : "text-[var(--blz-text-secondary)]"}`}>
                  {displayName}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTab(tab.id);
                  }}
                  className="hidden group-hover:flex h-5 w-5 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)]"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            );
          })}
          {tabs.length === 0 && (
            <div className="py-6 text-center text-xs text-[var(--blz-text-muted)]">
              No patients open
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-[var(--blz-border)] px-3 py-2">
        <Link
          href="/chat"
          className="flex items-center gap-2 rounded-lg px-2 py-2 text-xs text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-secondary)] transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 6h16v9H8l-4 3z" />
            <path d="M8 10h8M8 13h5" />
          </svg>
          <span>Chat with Aliice</span>
        </Link>
      </div>
    </aside>
  );
}
