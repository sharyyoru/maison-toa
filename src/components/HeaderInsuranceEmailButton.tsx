"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { useEmailNotifications } from "@/components/EmailNotificationsContext";

type Insurer = {
  id: string;
  name: string;
  gln: string;
  contact_email: string | null;
};

type Patient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
};

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query.trim()) return text;
  const escaped = query.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const regex = new RegExp(`(${escaped})`, "gi");
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="rounded bg-sky-100 px-0.5 text-sky-900 dark:bg-sky-900 dark:text-sky-100">{part}</mark>
    ) : (
      part
    ),
  );
}

export default function HeaderInsuranceEmailButton() {
  const router = useRouter();
  const { notifications } = useEmailNotifications();
  const [modalOpen, setModalOpen] = useState(false);

  // Insurer state
  const [insurers, setInsurers] = useState<Insurer[]>([]);
  const [insurersLoaded, setInsurersLoaded] = useState(false);
  const [insurersLoading, setInsurersLoading] = useState(false);
  const [selectedInsurer, setSelectedInsurer] = useState<Insurer | null>(null);
  const [insurerQuery, setInsurerQuery] = useState("");
  const [insurerDropdownOpen, setInsurerDropdownOpen] = useState(false);
  const [insurerActiveIndex, setInsurerActiveIndex] = useState(-1);
  const insurerWrapperRef = useRef<HTMLDivElement>(null);

  // Patient state
  const [patientQuery, setPatientQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [patientDropdownOpen, setPatientDropdownOpen] = useState(false);
  const [patientActiveIndex, setPatientActiveIndex] = useState(-1);
  const patientWrapperRef = useRef<HTMLDivElement>(null);
  const patientSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const insurerEmails = useMemo(
    () => new Set(insurers.flatMap((i) => (i.contact_email ? [i.contact_email.toLowerCase()] : []))),
    [insurers],
  );
  const unreadReplyCount = notifications.filter(
    (n) => !n.read_at && !!n.reply_email?.from_address && insurerEmails.has(n.reply_email.from_address.toLowerCase()),
  ).length;

  // Load all insurers once on mount
  useEffect(() => {
    if (insurersLoaded) return;
    async function load() {
      setInsurersLoading(true);
      const { data } = await supabaseClient
        .from("swiss_insurers")
        .select("id, name, gln, contact_email")
        .order("name");
      setInsurers(data || []);
      setInsurersLoaded(true);
      setInsurersLoading(false);
    }
    void load();
  }, [insurersLoaded]);

  // Filter insurers locally (we already loaded all)
  const filteredInsurers = useMemo(() => {
    const q = insurerQuery.trim().toLowerCase();
    if (!q) return insurers;
    return insurers.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        i.gln.includes(q) ||
        (i.contact_email || "").toLowerCase().includes(q),
    );
  }, [insurers, insurerQuery]);

  // Reset active index when filter changes
  useEffect(() => {
    setInsurerActiveIndex(-1);
  }, [insurerQuery]);

  // Patient search with debounce
  useEffect(() => {
    if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
    if (patientQuery.trim().length < 2) {
      setPatients([]);
      setPatientsLoading(false);
      return;
    }
    setPatientsLoading(true);
    patientSearchTimer.current = setTimeout(async () => {
      const search = patientQuery.trim().replace(/[%_]/g, "");
      if (!search) return;
      const words = search.split(/\s+/).filter((w) => w.length >= 2);
      if (words.length === 0) {
        setPatients([]);
        setPatientsLoading(false);
        return;
      }
      let query = supabaseClient
        .from("patients")
        .select("id, first_name, last_name, email");
      for (const word of words) {
        query = query.or(`first_name.ilike.%${word}%,last_name.ilike.%${word}%,email.ilike.%${word}%`);
      }
      const { data } = await query.order("last_name").limit(10);
      setPatients(data || []);
      setPatientsLoading(false);
    }, 250);
    return () => {
      if (patientSearchTimer.current) clearTimeout(patientSearchTimer.current);
    };
  }, [patientQuery]);

  useEffect(() => {
    setPatientActiveIndex(-1);
  }, [patientQuery]);

  // Click outside handlers
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (insurerWrapperRef.current && !insurerWrapperRef.current.contains(event.target as Node)) {
        setInsurerDropdownOpen(false);
      }
      if (patientWrapperRef.current && !patientWrapperRef.current.contains(event.target as Node)) {
        setPatientDropdownOpen(false);
      }
    }
    if (insurerDropdownOpen || patientDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [insurerDropdownOpen, patientDropdownOpen]);

  // Escape key to close dropdowns
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setInsurerDropdownOpen(false);
        setPatientDropdownOpen(false);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  const closeModal = useCallback(() => {
    setModalOpen(false);
    setSelectedInsurer(null);
    setSelectedPatient(null);
    setInsurerQuery("");
    setPatientQuery("");
    setPatients([]);
    setInsurerDropdownOpen(false);
    setPatientDropdownOpen(false);
  }, []);

  function openComposer() {
    if (!selectedInsurer?.contact_email || !selectedPatient?.email) return;
    const params = new URLSearchParams({
      m_tab: "crm",
      composeEmail: "insurance",
      insurerEmail: selectedInsurer.contact_email,
      insurerName: selectedInsurer.name,
    });
    closeModal();
    router.push(`/patients/${selectedPatient.id}?${params.toString()}`);
  }

  // Keyboard navigation for insurer dropdown
  function handleInsurerKeyDown(e: React.KeyboardEvent) {
    if (!insurerDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setInsurerDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }
    const selectable = filteredInsurers;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setInsurerActiveIndex((prev) => {
        let next = prev + 1;
        while (next < selectable.length && !selectable[next].contact_email) next++;
        return next >= selectable.length ? -1 : next;
      });
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setInsurerActiveIndex((prev) => {
        if (prev <= 0) {
          let last = selectable.length - 1;
          while (last >= 0 && !selectable[last].contact_email) last--;
          return last;
        }
        let next = prev - 1;
        while (next >= 0 && !selectable[next].contact_email) next--;
        return next < 0 ? -1 : next;
      });
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (insurerActiveIndex >= 0 && insurerActiveIndex < selectable.length) {
        const insurer = selectable[insurerActiveIndex];
        if (insurer.contact_email) {
          setSelectedInsurer(insurer);
          setInsurerQuery("");
          setInsurerDropdownOpen(false);
        }
      }
    }
  }

  // Keyboard navigation for patient dropdown
  function handlePatientKeyDown(e: React.KeyboardEvent) {
    if (!patientDropdownOpen) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setPatientDropdownOpen(true);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setPatientActiveIndex((prev) => Math.min(prev + 1, patients.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setPatientActiveIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (patientActiveIndex >= 0 && patientActiveIndex < patients.length) {
        const patient = patients[patientActiveIndex];
        setSelectedPatient(patient);
        setPatientQuery("");
        setPatientDropdownOpen(false);
      }
    }
  }

  function formatPatientName(p: Patient): string {
    return [p.first_name, p.last_name].filter(Boolean).join(" ") || "Unknown";
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
        title="Email an insurance company"
      >
        <span className="sr-only">Email an insurance company</span>
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M7 10h.01M17 10h.01M7 13h.01M17 13h.01" />
        </svg>
        {unreadReplyCount > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-semibold text-white shadow-sm">
            {unreadReplyCount > 9 ? "9+" : unreadReplyCount}
          </span>
        )}
      </button>

      {modalOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 p-4 dark:bg-black/60" onClick={closeModal}>
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-2xl dark:border dark:border-slate-700 dark:bg-slate-800" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-white">Email insurance company</h2>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Select an insurer and patient. The patient will be added in CC.</p>
              </div>
              <button type="button" onClick={closeModal} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-200" title="Close">
                <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="m6 6 12 12M18 6 6 18" />
                </svg>
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {/* Insurer searchable dropdown */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Insurance company</label>
                {selectedInsurer ? (
                  <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-700 dark:bg-sky-900/30">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-sky-900 dark:text-sky-100">{selectedInsurer.name}</span>
                      <span className="block truncate text-xs text-sky-700 dark:text-sky-300">{selectedInsurer.contact_email}</span>
                    </div>
                    <button type="button" onClick={() => { setSelectedInsurer(null); setInsurerQuery(""); setInsurerDropdownOpen(true); }} className="ml-2 flex-shrink-0 text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={insurerWrapperRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={insurerQuery}
                        onChange={(e) => { setInsurerQuery(e.target.value); setInsurerDropdownOpen(true); }}
                        onFocus={() => setInsurerDropdownOpen(true)}
                        onKeyDown={handleInsurerKeyDown}
                        disabled={insurersLoading}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-700/50"
                      />
                      <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                      </svg>
                      {insurerQuery && (
                        <button type="button" onClick={() => { setInsurerQuery(""); setInsurerDropdownOpen(true); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {insurerDropdownOpen && (
                      <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-700">
                        {insurersLoading ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                            <svg className="h-3.5 w-3.5 animate-spin text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" className="opacity-75" /></svg>
                            Loading insurers...
                          </div>
                        ) : filteredInsurers.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">No insurers found</div>
                        ) : (
                          <>
                            {filteredInsurers.slice(0, 50).map((insurer, index) => {
                              const hasEmail = !!insurer.contact_email;
                              const isActive = index === insurerActiveIndex;
                              return (
                                <button
                                  key={insurer.id}
                                  type="button"
                                  disabled={!hasEmail}
                                  onClick={() => {
                                    if (!hasEmail) return;
                                    setSelectedInsurer(insurer);
                                    setInsurerQuery("");
                                    setInsurerDropdownOpen(false);
                                  }}
                                  onMouseEnter={() => hasEmail && setInsurerActiveIndex(index)}
                                  className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${
                                    isActive && hasEmail ? "bg-sky-50 dark:bg-sky-900/40" : ""
                                  } ${!hasEmail ? "cursor-not-allowed opacity-50" : "hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                                >
                                  <span className={`mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full ${hasEmail ? "bg-green-500" : "bg-slate-300 dark:bg-slate-500"}`} />
                                  <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                      {highlightMatch(insurer.name, insurerQuery)}
                                    </div>
                                    <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                                      <span className="font-mono">{highlightMatch(insurer.gln, insurerQuery)}</span>
                                      {hasEmail ? (
                                        <span className="truncate text-green-600 dark:text-green-400">{highlightMatch(insurer.contact_email!, insurerQuery)}</span>
                                      ) : (
                                        <span className="text-amber-500 dark:text-amber-400">No email configured</span>
                                      )}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                            {filteredInsurers.length > 50 && (
                              <div className="border-t border-slate-100 px-3 py-1.5 text-center text-[10px] text-slate-400 dark:border-slate-600 dark:text-slate-500">
                                {filteredInsurers.length} results — refine search to narrow down
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Patient searchable dropdown */}
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700 dark:text-slate-300">Patient</label>
                {selectedPatient ? (
                  <div className="flex items-center justify-between rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 dark:border-sky-700 dark:bg-sky-900/30">
                    <div className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-sky-900 dark:text-sky-100">{formatPatientName(selectedPatient)}</span>
                      <span className="block truncate text-xs text-sky-700 dark:text-sky-300">{selectedPatient.email || "No email address"}</span>
                    </div>
                    <button type="button" onClick={() => { setSelectedPatient(null); setPatientQuery(""); setPatientDropdownOpen(true); }} className="ml-2 flex-shrink-0 text-xs font-medium text-sky-700 hover:text-sky-800 dark:text-sky-300 dark:hover:text-sky-200">
                      Change
                    </button>
                  </div>
                ) : (
                  <div className="relative" ref={patientWrapperRef}>
                    <div className="relative">
                      <input
                        type="text"
                        value={patientQuery}
                        onChange={(e) => { setPatientQuery(e.target.value); setPatientDropdownOpen(true); }}
                        onFocus={() => patientQuery.trim().length >= 2 && setPatientDropdownOpen(true)}
                        onKeyDown={handlePatientKeyDown}
                        autoComplete="off"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pl-9 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500"
                      />
                      <svg className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" />
                      </svg>
                      {patientQuery && (
                        <button type="button" onClick={() => { setPatientQuery(""); setPatients([]); setPatientDropdownOpen(false); }} className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300">
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                    </div>
                    {patientDropdownOpen && patientQuery.trim().length >= 2 && (
                      <div className="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-600 dark:bg-slate-700">
                        {patientsLoading ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-xs text-slate-500 dark:text-slate-400">
                            <svg className="h-3.5 w-3.5 animate-spin text-slate-400 dark:text-slate-500" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" /><path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" className="opacity-75" /></svg>
                            Searching patients...
                          </div>
                        ) : patients.length === 0 ? (
                          <div className="px-3 py-3 text-xs text-slate-500 dark:text-slate-400">No patients found</div>
                        ) : (
                          patients.map((patient, index) => {
                            const isActive = index === patientActiveIndex;
                            const hasEmail = !!patient.email;
                            return (
                              <button
                                key={patient.id}
                                type="button"
                                onClick={() => { setSelectedPatient(patient); setPatientQuery(""); setPatientDropdownOpen(false); }}
                                onMouseEnter={() => setPatientActiveIndex(index)}
                                className={`flex w-full items-start gap-2.5 px-3 py-2 text-left transition-colors ${isActive ? "bg-sky-50 dark:bg-sky-900/40" : "hover:bg-slate-50 dark:hover:bg-slate-600"}`}
                              >
                                <span className={`mt-0.5 flex h-2 w-2 flex-shrink-0 rounded-full ${hasEmail ? "bg-green-500" : "bg-amber-400"}`} />
                                <div className="min-w-0 flex-1">
                                  <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                                    {highlightMatch(formatPatientName(patient), patientQuery)}
                                  </div>
                                  <div className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                                    {hasEmail ? highlightMatch(patient.email!, patientQuery) : <span className="text-amber-600 dark:text-amber-400">No email — patient cannot be CC&apos;d</span>}
                                  </div>
                                </div>
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {selectedPatient && !selectedPatient.email && (
                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                  <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" /></svg>
                  This patient needs an email address to be included in CC.
                </p>
              )}
              {unreadReplyCount > 0 && (
                <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <svg className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25h-15a2.25 2.25 0 0 1-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5h-15a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" /></svg>
                  {unreadReplyCount} unread insurance {unreadReplyCount === 1 ? "reply" : "replies"} in email notifications.
                </p>
              )}
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-700">
              <button type="button" onClick={closeModal} className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700">Cancel</button>
              <button
                type="button"
                onClick={openComposer}
                disabled={!selectedInsurer?.contact_email || !selectedPatient?.email}
                className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.769 59.769 0 0 1 3.269 20.875L5.999 12Zm0 0h7.5" /></svg>
                Open composer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
