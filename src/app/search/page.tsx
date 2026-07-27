"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";

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

export default function SearchPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const initialQuery = searchParams.get("q") || "";

  const [query, setQuery] = useState(initialQuery);
  const [results, setResults] = useState<SearchResultGroup[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(new Set(Object.keys(CATEGORY_LABELS)));
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
      return;
    }

    setLoading(true);
    setAssistLoading(true);

    try {
      const [searchRes, assistRes] = await Promise.all([
        fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term, page: 1, limit: 20 }),
        }).then((r) => r.json()),
        fetch("/api/search/assist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query: term }),
        }).then((r) => r.json()),
      ]);

      setResults(searchRes.results || []);
      setAssist(assistRes.triggered ? assistRes : null);
    } catch {
      setResults([]);
      setAssist(null);
    } finally {
      setLoading(false);
      setAssistLoading(false);
    }
  }, []);

  const fetchSuggestions = useCallback(async (term: string) => {
    if (!term.trim() || term.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: term, page: 1, limit: 5 }),
      });
      const data = await res.json();
      const all: SearchResultItem[] = [];
      for (const group of data.results || []) {
        for (const item of group.items.slice(0, 3)) {
          all.push(item);
          if (all.length >= 8) break;
        }
        if (all.length >= 8) break;
      }
      setSuggestions(all);
    } catch {
      setSuggestions([]);
    }
  }, []);

  useEffect(() => {
    if (initialQuery) {
      performSearch(initialQuery);
    }
  }, [initialQuery, performSearch]);

  useEffect(() => {
    setSelectedCategories((prev) => {
      const next = new Set(prev);
      for (const group of results) {
        next.add(group.category);
      }
      return next;
    });
  }, [results]);

  function handleInputChange(value: string) {
    setQuery(value);
    setShowSuggestions(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchSuggestions(value);
    }, 300);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setShowSuggestions(false);
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      performSearch(query.trim());
    }
  }

  function handleSuggestionClick(item: SearchResultItem) {
    setShowSuggestions(false);
    router.push(item.href);
  }

  const filteredResults = results.filter((group) => selectedCategories.has(group.category));
  const totalResults = filteredResults.reduce((sum, g) => sum + g.items.length, 0);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold bg-gradient-to-r from-sky-500 via-violet-500 to-fuchsia-500 bg-clip-text text-transparent">
          Search
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Find patients, pages, tasks, deals, and more
        </p>
      </div>

      <form onSubmit={handleSubmit} className="relative mb-8">
        <div className="relative">
          <svg
            className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleInputChange(e.target.value)}
            onFocus={() => suggestions.length > 0 && setShowSuggestions(true)}
            onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
            placeholder="Search anything... or ask 'How do I create an invoice?'"
            className="w-full rounded-2xl border border-slate-200 bg-white py-4 pl-12 pr-4 text-base text-slate-900 shadow-lg shadow-slate-200/50 placeholder:text-slate-400 focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-100 dark:border-slate-700 dark:bg-[#1e2433] dark:text-slate-100 dark:shadow-black/20 dark:placeholder:text-slate-500 dark:focus:border-sky-500 dark:focus:ring-sky-900/30"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(""); setSuggestions([]); setResults([]); setAssist(null); }}
              className="absolute right-14 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
          <button
            type="submit"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-xl bg-sky-500 px-3 py-2 text-white hover:bg-sky-600 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 && (
          <div className="absolute z-50 mt-2 w-full rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-700 dark:bg-[#1e2433]">
            {suggestions.map((item) => (
              <button
                key={`${item.category}-${item.id}`}
                type="button"
                onMouseDown={() => handleSuggestionClick(item)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5 first:rounded-t-xl last:rounded-b-xl"
              >
                <span className="flex-shrink-0 text-slate-400">
                  {CATEGORY_ICONS[item.category] || CATEGORY_ICONS.pages}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-slate-800 dark:text-slate-200">
                    {item.title}
                  </p>
                  {item.subtitle && (
                    <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                  )}
                </div>
                <span className="flex-shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {CATEGORY_LABELS[item.category] || item.category}
                </span>
              </button>
            ))}
          </div>
        )}
      </form>

      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          <span className="ml-3 text-sm text-slate-500">Searching...</span>
        </div>
      )}

      {assist && assist.triggered && (
        <div className="mb-6 rounded-2xl border border-sky-200/60 bg-gradient-to-br from-sky-50/80 to-violet-50/50 p-5 shadow-sm dark:border-sky-800/40 dark:from-sky-900/20 dark:to-violet-900/10">
          <div className="mb-3 flex items-center gap-2">
            <span className="text-lg">
              {assist.type === "medical" ? "🏥" : assist.type === "navigation" ? "✨" : "✨🏥"}
            </span>
            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">
              {assist.type === "medical"
                ? "Medical Information"
                : assist.type === "navigation"
                ? "How-to Guide"
                : "AI Answer"}
            </span>
          </div>
          <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line leading-relaxed">
            {assist.answer}
          </p>
          {assist.links && assist.links.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {assist.links.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-white px-3 py-1.5 text-xs font-medium text-sky-700 shadow-sm hover:bg-sky-50 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300 dark:hover:bg-sky-900/50"
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" />
                  </svg>
                  {link.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {assistLoading && !assist && query && (
        <div className="mb-6 rounded-2xl border border-slate-200/60 bg-slate-50/50 p-5 dark:border-slate-700/40 dark:bg-slate-800/20">
          <div className="flex items-center gap-2">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-violet-400 border-t-transparent" />
            <span className="text-sm text-slate-500">AI is thinking...</span>
          </div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {totalResults} result{totalResults !== 1 ? "s" : ""} for &ldquo;{initialQuery || query}&rdquo;
            </p>
            <div className="flex flex-wrap gap-2">
              {results.map((group) => {
                const selected = selectedCategories.has(group.category);
                return (
                  <button
                    key={group.category}
                    type="button"
                    onClick={() => {
                      setSelectedCategories((prev) => {
                        const next = new Set(prev);
                        if (selected) {
                          next.delete(group.category);
                        } else {
                          next.add(group.category);
                        }
                        return next;
                      });
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                      selected
                        ? "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-900/30 dark:text-sky-300"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
                    }`}
                  >
                    <span className={selected ? "text-sky-600 dark:text-sky-300" : "text-slate-400 dark:text-slate-500"}>
                      {CATEGORY_ICONS[group.category] || CATEGORY_ICONS.pages}
                    </span>
                    {CATEGORY_LABELS[group.category] || group.category}
                    <span className="rounded-full bg-white/70 px-1.5 py-0 text-[10px] dark:bg-black/20">
                      {group.total}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {filteredResults.map((group) => (
            <div key={group.category}>
              <div className="mb-2 flex items-center gap-2">
                <span className="text-slate-400">
                  {CATEGORY_ICONS[group.category] || CATEGORY_ICONS.pages}
                </span>
                <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                  {CATEGORY_LABELS[group.category] || group.category}
                </h2>
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-700 dark:text-slate-400">
                  {group.total}
                </span>
              </div>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <Link
                    key={`${group.category}-${item.id}`}
                    href={item.href}
                    className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 dark:text-slate-200">
                        {item.title}
                      </p>
                      {item.subtitle && (
                        <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                      )}
                    </div>
                    <svg className="h-4 w-4 flex-shrink-0 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !assistLoading && initialQuery && results.length === 0 && (
        <div className="py-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <p className="mt-4 text-sm text-slate-500">
            No results found for &ldquo;{initialQuery}&rdquo;
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Try different keywords or ask a question
          </p>
        </div>
      )}

      {!loading && !assistLoading && results.length > 0 && filteredResults.length === 0 && (
        <div className="py-12 text-center">
          <svg className="mx-auto h-12 w-12 text-slate-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <p className="mt-4 text-sm text-slate-500">
            No results match the selected filters.
          </p>
          <p className="mt-1 text-xs text-slate-400">
            Select a category above to show results.
          </p>
        </div>
      )}

      {!loading && !initialQuery && results.length === 0 && (
        <div className="py-12 text-center">
          <svg className="mx-auto h-16 w-16 text-slate-200 dark:text-slate-700" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
            <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
          </svg>
          <p className="mt-4 text-sm text-slate-500">
            Search across your entire clinic system
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {["How do I create an invoice?", "Botox contraindications", "Lead import"].map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuery(suggestion);
                  router.push(`/search?q=${encodeURIComponent(suggestion)}`);
                  performSearch(suggestion);
                }}
                className="rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-600 shadow-sm hover:border-sky-300 hover:text-sky-600 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-sky-600 dark:hover:text-sky-400"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
