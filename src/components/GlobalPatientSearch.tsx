"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
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

export default function GlobalPatientSearch() {
  const router = useRouter();
  const { addTab } = usePatientTabs();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PatientResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    if (trimmed.length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    const debounce = setTimeout(async () => {
      setLoading(true);
      try {
        const searchTerm = `%${trimmed}%`;
        
        // Split search into words for multi-word name searches
        const words = trimmed.split(/\s+/).filter(w => w.length > 0);
        
        // Build OR conditions for individual fields
        let orConditions = `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`;
        
        // For multi-word queries, also search each word individually
        // This handles "art wilson" matching first_name="Art" AND last_name="Wilson"
        if (words.length > 1) {
          for (const word of words) {
            const wordTerm = `%${word}%`;
            orConditions += `,first_name.ilike.${wordTerm},last_name.ilike.${wordTerm}`;
          }
        }
        
        // Run text search query
        const textQuery = supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone, dob")
          .or(orConditions)
          .limit(20);

        // Run DOB query in parallel if search looks like a date pattern
        const hasDigits = /\d/.test(trimmed);
        let dobQuery = null;
        if (hasDigits) {
          // Try DD/MM/YYYY format first (e.g. "28/10/1985")
          const ddmmyyyyMatch = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
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

        if (textResult.error) {
          console.error("Search error:", textResult.error);
          setResults([]);
        } else {
          let filtered = (textResult.data ?? []) as PatientResult[];

          // For multi-word searches, filter results to ensure ALL words match somewhere
          if (words.length > 1) {
            filtered = filtered.filter(patient => {
              const fullName = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.toLowerCase();
              const email = (patient.email ?? "").toLowerCase();
              const phone = (patient.phone ?? "").toLowerCase();
              const dob = (patient.dob ?? "").toLowerCase();
              const combined = `${fullName} ${email} ${phone} ${dob}`;
              return words.every(word => combined.includes(word.toLowerCase()));
            });
          }

          // Merge DOB results (avoiding duplicates)
          const dobData = (dobResult?.data ?? []) as PatientResult[];
          for (const m of dobData) {
            if (!filtered.some(f => f.id === m.id)) filtered.push(m);
          }

          // Score and sort results by relevance
          const queryLower = trimmed.toLowerCase();
          const scored = filtered.map(patient => {
            let score = 0;
            const firstName = (patient.first_name ?? "").toLowerCase();
            const lastName = (patient.last_name ?? "").toLowerCase();
            const fullName = `${firstName} ${lastName}`.trim();
            const email = (patient.email ?? "").toLowerCase();
            const phone = (patient.phone ?? "").toLowerCase();

            // Exact full name match = highest priority
            if (fullName === queryLower) {
              score += 100;
            }
            // Exact first name or last name match
            else if (firstName === queryLower || lastName === queryLower) {
              score += 80;
            }
            // Name starts with query
            else if (fullName.startsWith(queryLower) || firstName.startsWith(queryLower) || lastName.startsWith(queryLower)) {
              score += 60;
            }
            // For multi-word queries, check if each word starts a name part
            else if (words.length > 1) {
              const allWordsStartName = words.every(word => 
                firstName.startsWith(word.toLowerCase()) || lastName.startsWith(word.toLowerCase())
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
          setIsOpen(filtered.length > 0);
        }
      } catch (err) {
        console.error("Search catch error:", err);
        setResults([]);
      } finally {
        setLoading(false);
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
          onFocus={() => results.length > 0 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search patients..."
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

      {isOpen && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
          {results.map((patient) => {
            const name = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim() || "Unnamed";
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
                        DOB: {new Date(patient.dob).toLocaleDateString()}
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
