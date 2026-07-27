"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

const CATEGORY_LABELS: Record<string, string> = {
  pages: "Pages",
  patients: "Patients",
  tasks: "Tasks",
  deals: "Deals",
  services: "Services",
  invoices: "Invoices",
  appointments: "Appointments",
};

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  pages: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 3v18M3 9h6" />
    </svg>
  ),
  patients: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" /><path d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
    </svg>
  ),
  tasks: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  ),
  deals: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h4v12H3zM10 10h4v8h-4zM17 8h4v10h-4z" />
    </svg>
  ),
  services: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />
    </svg>
  ),
  invoices: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h4M7 14h2" />
    </svg>
  ),
  appointments: (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  ),
};

type SearchResultItem = {
  id: string;
  title: string;
  subtitle: string;
  href: string;
  category: string;
};

type SearchResultGroup = {
  category: string;
  items: SearchResultItem[];
  total: number;
};

type AssistResponse = {
  triggered: boolean;
  answer?: string;
  links?: { label: string; href: string }[];
  type?: "navigation" | "medical" | "mixed";
};

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(
    new Set(Object.keys(CATEGORY_LABELS))
  );
  const [assist, setAssist] = useState<AssistResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [assistLoading, setAssistLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchResultItem[]>([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const performSearch = useCallback(async (term: string) => {
    if (!term.trim()) {
      setResults([]);
      setAssist(null);
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    setLoading(true);
    setAssistLoading(true);

    try {
      const [searchRes, assistRes] = await Promise.all([
        fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term, categories: Array.from(selectedCategories) }),
        }),
        fetch("/api/search/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term }),
        }),
      ]);

      const searchData = await searchRes.json().catch(() => ({ results: [] }));
      setResults(searchData.results || []);

      const assistData = await assistRes.json().catch(() => ({ triggered: false }));
      setAssist(assistData);
    } finally {
      setLoading(false);
      setAssistLoading(false);
      setShowSuggestions(false);
    }
  }, [selectedCategories]);

  const fetchSuggestions = useCallback(async (term: string) => {
    if (!term.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: term, limit: 5 }),
      });
      const data = await res.json();
      const items = (data.results || []).flatMap((g: SearchResultGroup) => g.items).slice(0, 5);
      setSuggestions(items);
      setShowSuggestions(items.length > 0);
    } catch {
      setSuggestions([]);
      setShowSuggestions(false);
    }
  }, []);

  useEffect(() => {
    if (initialQuery.trim()) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }
    debounceRef.current = setTimeout(() => fetchSuggestions(query), 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, fetchSuggestions]);

  const filteredResults = results.filter((group) => selectedCategories.has(group.category));

  const toggleCategory = (category: string) => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setShowSuggestions(false);
    router.push(`/search?q=${encodeURIComponent(query.trim())}`);
    performSearch(query.trim());
  };

  const selectSuggestion = (item: SearchResultItem) => {
    setQuery(item.title);
    setShowSuggestions(false);
    router.push(item.href);
  };

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-8 text-center">
        <h1 className="bg-gradient-to-r from-sky-500 via-violet-500 to-fuchsia-500 bg-clip-text text-3xl font-bold text-transparent">
          Universal Search
        </h1>
        <p className="mt-2 text-sm text-[var(--blz-text-secondary)]">
          Search pages, patients, tasks, deals, services, invoices, and appointments.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative mb-6">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
          placeholder="Search anything..."
          className="w-full rounded-2xl border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] py-4 pl-5 pr-14 text-lg text-[var(--blz-text-primary)] placeholder:text-[var(--blz-text-muted)] shadow-sm focus:border-sky-500/50 focus:outline-none focus:ring-2 focus:ring-sky-500/20"
        />
        <button
          type="submit"
          disabled={!query.trim() || loading}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-sky-500 p-2 text-white shadow-md transition-colors hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </button>

        {showSuggestions && (
          <div className="absolute z-10 mt-1 w-full overflow-hidden rounded-xl border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] shadow-lg">
            {suggestions.map((item) => (
              <button
                key={`${item.category}-${item.id}`}
                type="button"
                onClick={() => selectSuggestion(item)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--blz-text-secondary)] hover:bg-[var(--blz-hover)]"
              >
                <span className="text-[var(--blz-text-muted)]">{CATEGORY_ICONS[item.category]}</span>
                <span className="flex-1 truncate">{item.title}</span>
                <span className="text-[10px] text-[var(--blz-text-muted)]">{CATEGORY_LABELS[item.category]}</span>
              </button>
            ))}
          </div>
        )}
      </form>

      {loading && (
        <div className="mb-6 flex items-center justify-center gap-2 text-sm text-[var(--blz-text-muted)]">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
          Searching...
        </div>
      )}

      {assist?.triggered && (
        <div className="mb-6 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-violet-50/50 p-5 dark:from-sky-900/20 dark:to-violet-900/20">
          <div className="mb-2 flex items-center gap-2 text-sm font-medium text-sky-700 dark:text-sky-300">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
            </svg>
            Aliice Assistant
          </div>
          <p className="whitespace-pre-wrap text-sm text-[var(--blz-text-secondary)]">{assist.answer}</p>
          {assist.links && assist.links.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {assist.links.map((link, i) => (
                <Link
                  key={i}
                  href={link.href}
                  className="inline-flex items-center gap-1 rounded-lg bg-white/70 px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm hover:bg-white dark:bg-slate-800/70 dark:text-sky-300"
                >
                  {link.label}
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17L17 7M17 7H7M17 7v10" />
                  </svg>
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {!loading && assistLoading && (
        <div className="mb-6 flex items-center gap-2 text-sm text-[var(--blz-text-muted)]">
          <div className="h-3 w-3 animate-pulse rounded-full bg-violet-400" />
          Aliice is thinking...
        </div>
      )}

      {results.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {Object.entries(CATEGORY_LABELS).map(([category, label]) => {
            const count = results.find((g) => g.category === category)?.total || 0;
            const active = selectedCategories.has(category);
            return (
              <button
                key={category}
                type="button"
                onClick={() => toggleCategory(category)}
                disabled={count === 0}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-900/30 dark:text-sky-300"
                    : "border-slate-200 bg-white text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                } disabled:opacity-40`}
              >
                {CATEGORY_ICONS[category]}
                {label}
                {count > 0 && <span className="text-[10px] opacity-70">({count})</span>}
              </button>
            );
          })}
        </div>
      )}

      <div className="space-y-6">
        {filteredResults.map((group) => (
          <div key={group.category}>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--blz-text-primary)]">
              <span className="text-[var(--blz-text-muted)]">{CATEGORY_ICONS[group.category]}</span>
              {CATEGORY_LABELS[group.category]}
              <span className="rounded-full bg-[var(--blz-hover)] px-2 py-0.5 text-[10px] font-normal text-[var(--blz-text-muted)]">
                {group.total}
              </span>
            </h2>
            <div className="divide-y divide-[var(--blz-border)] rounded-2xl border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] overflow-hidden">
              {group.items.map((item) => (
                <Link
                  key={`${group.category}-${item.id}`}
                  href={item.href}
                  className="flex items-center justify-between px-4 py-3 transition-colors hover:bg-[var(--blz-hover)]"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--blz-text-primary)]">{item.title}</p>
                    {item.subtitle && (
                      <p className="truncate text-xs text-[var(--blz-text-muted)]">{item.subtitle}</p>
                    )}
                  </div>
                  <svg className="h-4 w-4 shrink-0 text-[var(--blz-text-muted)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </Link>
              ))}
            </div>
          </div>
        ))}

        {!loading && query.trim() && filteredResults.length === 0 && !assist?.triggered && (
          <div className="py-12 text-center text-sm text-[var(--blz-text-muted)]">
            No results found for &ldquo;{query}&rdquo;. Try a different search term or ask Aliice a question.
          </div>
        )}
      </div>
    </div>
  );
}
