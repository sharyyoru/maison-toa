"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";
import { usePatientTabs } from "./PatientTabsContext";

type PatientResult = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  dob: string | null;
};

const ACCENT_GROUPS = [
  "aàáâãäå", "cç", "eèéêë", "iìíîï", "nñ", "oòóôõöø",
  "uùúûü", "yýÿ", "sš", "zž", "lł",
];

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase().replace(/œ/g, "oe").replace(/æ/g, "ae")
    .replace(/ß/g, "ss").replace(/ø/g, "o").replace(/ł/g, "l")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function accentVariants(value: string, limit = 20) {
  let variants = [""];
  for (const character of normalizeSearchText(value)) {
    const group = ACCENT_GROUPS.find((candidate) => candidate[0] === character);
    const options = group ? [...group] : [character];
    const next: string[] = [];
    for (const prefix of variants) {
      for (const option of options) {
        next.push(prefix + option);
        if (next.length >= limit) break;
      }
      if (next.length >= limit) break;
    }
    variants = next;
  }
  return [...new Set([value.toLocaleLowerCase(), ...variants])];
}

function patientSearchText(patient: PatientResult) {
  return normalizeSearchText([
    patient.first_name, patient.last_name, patient.email, patient.phone, patient.dob,
  ].filter(Boolean).join(" "));
}

function formatDob(dob: string) {
  const match = dob.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dob;

  const [, year, month, day] = match;
  return `${day}.${month}.${year}`;
}

export default function GlobalPatientSearch() {
  const router = useRouter();
  const t = useTranslations("header");
  const { addTab } = usePatientTabs();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searchError, setSearchError] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    const requestId = ++requestIdRef.current;
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      setLoading(false);
      setSearchError(false);
      return;
    }

    setIsOpen(true);
    setSearchError(false);

    const debounce = setTimeout(async () => {
      setLoading(true);
      try {
        // Split search into words for multi-word name searches
        const words = trimmed.replace(/[,()%_]/g, " ").split(/\s+/).filter(Boolean);

        // For multi-word queries (e.g. "alexandra christodoulou"), chain one .or()
        // per word so PostgREST applies AND logic between words. This avoids passing
        // the full phrase as a single ilike pattern which would never match split names.
        let textQuery = supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone, dob");

        for (const word of words) {
          const nameFilters = accentVariants(word).flatMap((variant) => {
            const term = `%${variant}%`;
            return [`first_name.ilike.${term}`, `last_name.ilike.${term}`];
          });
          const term = `%${word}%`;
          textQuery = textQuery.or([
            ...nameFilters,
            `email.ilike.${term}`,
            `phone.ilike.${term}`,
          ].join(","));
        }

        textQuery = textQuery.limit(50);

        // Run DOB query in parallel if search looks like a date pattern
        const hasDigits = /\d/.test(trimmed);
        let dobQuery = null;
        if (hasDigits) {
          // Try DD.MM.YYYY or DD/MM/YYYY (e.g. "28.10.1985")
          const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})$/);
          if (ddmmyyyyMatch) {
            const day = ddmmyyyyMatch[1].padStart(2, "0");
            const month = ddmmyyyyMatch[2].padStart(2, "0");
            const year = ddmmyyyyMatch[3];
            const isoDate = `${year}-${month}-${day}`;
            dobQuery = supabaseClient
              .from("patients")
              .select("id, first_name, last_name, email, phone, dob")
              .eq("dob", isoDate)
              .limit(10);
          } else {
            // Try exact date match (e.g. "1998-08-21")
            const dateMatch = trimmed.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
            if (dateMatch) {
              dobQuery = supabaseClient
                .from("patients")
                .select("id, first_name, last_name, email, phone, dob")
                .eq("dob", trimmed)
                .limit(10);
            } else {
              // Year-only search (e.g. "1998")
              const yearMatch = trimmed.match(/^(\d{4})$/);
              if (yearMatch) {
                dobQuery = supabaseClient
                  .from("patients")
                  .select("id, first_name, last_name, email, phone, dob")
                  .gte("dob", `${yearMatch[1]}-01-01`)
                  .lte("dob", `${yearMatch[1]}-12-31`)
                  .limit(10);
              }
            }
          }
        }

        const [textResult, dobResult] = await Promise.all([
          textQuery,
          dobQuery ?? Promise.resolve({ data: [] as PatientResult[], error: null }),
        ]);

        if (requestId !== requestIdRef.current) return;

        if (textResult.error) {
          console.error("Search error:", textResult.error);
          setResults([]);
          setSearchError(true);
        } else {
          let filtered = (textResult.data ?? []) as PatientResult[];

          const normalizedWords = words.map(normalizeSearchText);
          filtered = filtered.filter((patient) => {
            const combined = patientSearchText(patient);
            return normalizedWords.every((word) => combined.includes(word));
          });

          // Merge DOB results (avoiding duplicates)
          const dobData = (dobResult?.data ?? []) as PatientResult[];
          for (const m of dobData) {
            if (!filtered.some(f => f.id === m.id)) filtered.push(m);
          }

          // Score and sort results by relevance
          const queryLower = normalizeSearchText(trimmed);
          const scored = filtered.map(patient => {
            let score = 0;
            const firstName = normalizeSearchText(patient.first_name ?? "");
            const lastName = normalizeSearchText(patient.last_name ?? "");
            const fullName = `${firstName} ${lastName}`.trim();
            const reverseFullName = `${lastName} ${firstName}`.trim();
            const email = normalizeSearchText(patient.email ?? "");
            const phone = normalizeSearchText(patient.phone ?? "");

            // Exact full name match = highest priority
            if (fullName === queryLower || reverseFullName === queryLower) {
              score += 100;
            }
            // Exact first name or last name match
            else if (firstName === queryLower || lastName === queryLower) {
              score += 80;
            }
            // Name starts with query
            else if (fullName.startsWith(queryLower) || reverseFullName.startsWith(queryLower) || firstName.startsWith(queryLower) || lastName.startsWith(queryLower)) {
              score += 60;
            }
            // For multi-word queries, check if each word starts a name part
            else if (words.length > 1) {
              const allWordsStartName = words.every(word => 
                firstName.startsWith(normalizeSearchText(word)) || lastName.startsWith(normalizeSearchText(word))
              );
              if (allWordsStartName) score += 50;
            }
            
            // Contains query in name
            if (fullName.includes(queryLower)) {
              score += 20;
            }
            
            // Exact email match
            if (email === queryLower) {
              score += 70;
            }
            // Email starts with query
            else if (email.startsWith(queryLower)) {
              score += 40;
            }
            // Email contains query
            else if (email.includes(queryLower)) {
              score += 15;
            }

            // Phone exact match
            if (phone === queryLower || phone.replace(/\D/g, "") === queryLower.replace(/\D/g, "")) {
              score += 70;
            }
            // Phone contains query
            else if (phone.includes(queryLower) || phone.replace(/\D/g, "").includes(queryLower.replace(/\D/g, ""))) {
              score += 25;
            }

            return { ...patient, _score: score };
          });

          // Sort by score descending, then by name alphabetically for ties
          scored.sort((a, b) => {
            if (b._score !== a._score) return b._score - a._score;
            const nameA = `${a.first_name ?? ""} ${a.last_name ?? ""}`.toLowerCase();
            const nameB = `${b.first_name ?? ""} ${b.last_name ?? ""}`.toLowerCase();
            return nameA.localeCompare(nameB);
          });

          setResults(scored.slice(0, 8));
          setSearchError(false);
        }
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        console.error("Search catch error:", err);
        setResults([]);
        setSearchError(true);
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(debounce);
  }, [query]);

  function handleSelect(patient: PatientResult) {
    // Add patient to tabs
    addTab({
      id: patient.id,
      firstName: patient.first_name ?? "",
      lastName: patient.last_name ?? "",
    });
    
    setQuery("");
    setResults([]);
    setIsOpen(false);
    router.push(`/patients/${patient.id}`);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setIsOpen(false);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={containerRef} className="relative flex-1 max-w-md mx-4">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.trim().length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={t("searchPatients")}
          className="w-full rounded-full border border-slate-300/60 bg-slate-200/70 px-4 py-2 pl-4 pr-10 text-sm text-slate-900 placeholder-slate-500 shadow-inner backdrop-blur-sm transition-all focus:border-slate-400/80 focus:bg-slate-100/90 focus:outline-none focus:ring-1 focus:ring-slate-300/60"
        />
        <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
          {loading ? (
            <svg className="h-4 w-4 animate-spin text-slate-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          ) : (
            <svg className="h-4 w-4 text-slate-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {!loading && searchError && (
            <p className="px-4 py-3 text-sm text-rose-600">{t("patientSearchFailed")}</p>
          )}
          {!loading && !searchError && results.length === 0 && (
            <p className="px-4 py-3 text-sm text-slate-500">{t("noPatientsFound")}</p>
          )}
          {results.map((patient) => {
            const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || t("unnamed");
            return (
              <button
                key={patient.id}
                type="button"
                onClick={() => handleSelect(patient)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50 first:rounded-t-xl last:rounded-b-xl"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-indigo-500 text-sm font-semibold text-white shadow-sm">
                  {(patient.first_name?.[0] ?? patient.email?.[0] ?? "?").toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{name}</p>
                  <div className="flex items-center gap-2">
                    {patient.email && (
                      <p className="text-xs text-slate-500 truncate">{patient.email}</p>
                    )}
                    {patient.dob && (
                      <p className="text-xs text-slate-400">
                        {t("dob")}: {formatDob(patient.dob)}
                      </p>
                    )}
                  </div>
                </div>
                {patient.phone && (
                  <span className="text-xs text-slate-400">{patient.phone}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
