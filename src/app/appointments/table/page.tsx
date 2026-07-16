"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";
import {
  formatSwissDate,
  formatSwissTimeRange,
  formatSwissYmd,
  getSwissDayRange,
} from "@/lib/swissTimezone";

const PAGE_SIZE = 50;
const FETCH_CHUNK_SIZE = 1000;

type PatientRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
};

type NamedRelation = { id: string; name: string | null };

type AppointmentRow = {
  id: string;
  patient_id: string | null;
  no_patient: boolean | null;
  provider_id: string | null;
  start_time: string;
  end_time: string | null;
  status: string;
  reason: string | null;
  location: string | null;
  service_ids: string[] | null;
  patient: PatientRow | null;
  provider: NamedRelation | null;
  booking_category: NamedRelation | null;
  booking_treatment: NamedRelation | null;
};

type ServiceRow = {
  id: string;
  name: string;
  category: NamedRelation | null;
};

type NormalizedAppointment = AppointmentRow & {
  patientName: string;
  service: string;
  serviceNames: string[];
  category: string;
  workflowStatus: string;
  doctor: string;
};

const WORKFLOW_STATUSES = [
  "Aucune sélection",
  "Salle d'attente",
  "Chez le médecin/dans la salle de consult.",
  "fait",
  "Attention",
  "Annulé",
  "N'est pas venu",
  "en retard",
  "Urgent",
  "Déplacé",
];

function extractTag(reason: string | null, tag: string): string | null {
  if (!reason) return null;
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = reason.match(new RegExp(`\\[${escapedTag}:\\s*(.+?)\\s*]`, "i"));
  return match?.[1]?.trim() || null;
}

function extractService(reason: string | null): string {
  if (!reason) return "Appointment";
  const bracketIndex = reason.indexOf("[");
  return (bracketIndex === -1 ? reason : reason.slice(0, bracketIndex)).trim() || "Appointment";
}

function swissMonthInputs(): { from: string; to: string } {
  const today = formatSwissYmd(new Date());
  const [year, month] = today.split("-").map(Number);
  const lastDay = new Date(year, month, 0).getDate();
  return {
    from: `${year}-${String(month).padStart(2, "0")}-01`,
    to: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
  };
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );
}

export default function AppointmentsTablePage() {
  const t = useTranslations("appointmentsTable");
  const router = useRouter();
  const initialRange = useMemo(swissMonthInputs, []);
  const [rows, setRows] = useState<AppointmentRow[]>([]);
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fromDate, setFromDate] = useState(initialRange.from);
  const [toDate, setToDate] = useState(initialRange.to);
  const [patientFilter, setPatientFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [doctorFilter, setDoctorFilter] = useState("");
  const [dateSortDirection, setDateSortDirection] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    let mounted = true;

    async function loadReferenceData() {
      const { data } = await supabaseClient
        .from("services")
        .select("id, name, category:service_categories(id, name)")
        .order("name", { ascending: true });
      if (mounted && data) setServices(data as unknown as ServiceRow[]);
    }

    void loadReferenceData();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;

    async function loadAppointments() {
      setLoading(true);
      setError(null);

      try {
        const allRows: AppointmentRow[] = [];
        let offset = 0;

        while (true) {
          let query = supabaseClient
            .from("appointments")
            .select(
              "id, patient_id, no_patient, provider_id, start_time, end_time, status, reason, location, service_ids, patient:patients(id, first_name, last_name), provider:providers(id, name), booking_category:booking_categories(id, name), booking_treatment:booking_treatments(id, name)",
            )
            .order("start_time", { ascending: true })
            .range(offset, offset + FETCH_CHUNK_SIZE - 1);

          if (fromDate) query = query.gte("start_time", getSwissDayRange(fromDate).start);
          if (toDate) query = query.lte("start_time", getSwissDayRange(toDate).end);

          const { data, error: queryError } = await query;
          if (queryError) throw queryError;

          const chunk = (data || []) as unknown as AppointmentRow[];
          allRows.push(...chunk);
          if (chunk.length < FETCH_CHUNK_SIZE) break;
          offset += FETCH_CHUNK_SIZE;
        }

        if (mounted) setRows(allRows);
      } catch (loadError) {
        if (mounted) {
          setRows([]);
          setError(loadError instanceof Error ? loadError.message : t("loadError"));
        }
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void loadAppointments();
    return () => {
      mounted = false;
    };
  }, [fromDate, toDate, t]);

  const serviceById = useMemo(
    () => new Map(services.map((service) => [service.id, service])),
    [services],
  );

  const normalizedRows = useMemo<NormalizedAppointment[]>(() => {
    return rows.map((row) => {
      const structuredServices = (row.service_ids || [])
        .map((id) => serviceById.get(id)?.name)
        .filter((name): name is string => Boolean(name));
      const fallbackService = row.booking_treatment?.name || extractService(row.reason);
      const serviceNames = structuredServices.length > 0 ? structuredServices : [fallbackService];
      const service = serviceNames.join(", ");
      const serviceCategory = (row.service_ids || [])
        .map((id) => serviceById.get(id)?.category?.name)
        .find((name): name is string => Boolean(name));
      const category =
        row.booking_category?.name || extractTag(row.reason, "Category") || serviceCategory || t("notSpecified");
      const workflowStatus = extractTag(row.reason, "Status") || WORKFLOW_STATUSES[0];
      const doctor = row.provider?.name || extractTag(row.reason, "Doctor") || t("notSpecified");
      const patientName = row.patient
        ? `${row.patient.last_name || ""} ${row.patient.first_name || ""}`.trim() || t("unknownPatient")
        : row.no_patient
          ? t("noPatient")
          : t("unknownPatient");

      return { ...row, patientName, service, serviceNames, category, workflowStatus, doctor };
    });
  }, [rows, serviceById, t]);

  const serviceOptions = useMemo(
    () => uniqueSorted([...services.map((service) => service.name), ...normalizedRows.flatMap((row) => row.serviceNames)]),
    [services, normalizedRows],
  );
  const patientOptions = useMemo(
    () => uniqueSorted(normalizedRows.map((row) => row.patientName)),
    [normalizedRows],
  );
  const categoryOptions = useMemo(
    () => uniqueSorted(normalizedRows.map((row) => row.category).filter((value) => value !== t("notSpecified"))),
    [normalizedRows, t],
  );
  const doctorOptions = useMemo(
    () => uniqueSorted(normalizedRows.map((row) => row.doctor).filter((value) => value !== t("notSpecified"))),
    [normalizedRows, t],
  );
  const statusOptions = useMemo(
    () => uniqueSorted([...WORKFLOW_STATUSES, ...normalizedRows.map((row) => row.workflowStatus)]),
    [normalizedRows],
  );

  const filteredRows = useMemo(() => {
    const matchingRows = normalizedRows.filter(
      (row) =>
        (!patientFilter || row.patientName === patientFilter) &&
        (serviceFilter.length === 0 || serviceFilter.some((service) => row.serviceNames.includes(service))) &&
        (!categoryFilter || row.category === categoryFilter) &&
        (!statusFilter || row.workflowStatus === statusFilter) &&
        (!doctorFilter || row.doctor === doctorFilter),
    );
    return matchingRows.sort((a, b) => {
      const difference = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
      return dateSortDirection === "asc" ? difference : -difference;
    });
  }, [normalizedRows, patientFilter, serviceFilter, categoryFilter, statusFilter, doctorFilter, dateSortDirection]);

  useEffect(() => setPage(1), [fromDate, toDate, patientFilter, serviceFilter, categoryFilter, statusFilter, doctorFilter, dateSortDirection]);

  const pageCount = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const visibleRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function clearFilters() {
    setFromDate("");
    setToDate("");
    setPatientFilter("");
    setServiceFilter([]);
    setCategoryFilter("");
    setStatusFilter("");
    setDoctorFilter("");
  }

  function openInCalendar(row: NormalizedAppointment) {
    const params = new URLSearchParams({ date: formatSwissYmd(new Date(row.start_time)) });
    if (row.provider_id) params.set("doctor", row.provider_id);
    else if (row.doctor !== t("notSpecified")) params.set("doctorName", row.doctor);
    router.push(`/appointments?${params.toString()}`);
  }

  return (
    <div className="w-full space-y-5 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">{t("title")}</h1>
          <p className="mt-1 text-xs text-slate-500">{t("subtitle")}</p>
        </div>
        <Link
          href="/appointments"
          className="inline-flex items-center rounded-full border border-sky-200 bg-white px-4 py-2 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-50"
        >
          {t("calendarView")}
        </Link>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
          <label className="space-y-1 text-[11px] font-medium text-slate-600">
            <span>{t("filters.from")}</span>
            <input type="date" value={fromDate} max={toDate || undefined} onChange={(event) => setFromDate(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
          </label>
          <label className="space-y-1 text-[11px] font-medium text-slate-600">
            <span>{t("filters.to")}</span>
            <input type="date" value={toDate} min={fromDate || undefined} onChange={(event) => setToDate(event.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800" />
          </label>
          <SearchableFilterSelect
            listId="appointment-patient-options"
            label={t("filters.patient")}
            allLabel={t("filters.allPatients")}
            searchPlaceholder={t("filters.searchPatients")}
            value={patientFilter}
            onChange={setPatientFilter}
            options={patientOptions}
          />
          <MultiSearchableFilterSelect
            listId="appointment-service-options"
            label={t("filters.service")}
            allLabel={t("filters.allServices")}
            searchPlaceholder={t("filters.searchServices")}
            selectedLabel={(count) => t("filters.servicesSelected", { count })}
            values={serviceFilter}
            onChange={setServiceFilter}
            options={serviceOptions}
          />
          <FilterSelect label={t("filters.category")} allLabel={t("filters.allCategories")} value={categoryFilter} onChange={setCategoryFilter} options={categoryOptions} />
          <FilterSelect label={t("filters.status")} allLabel={t("filters.allStatuses")} value={statusFilter} onChange={setStatusFilter} options={statusOptions} />
          <FilterSelect label={t("filters.doctor")} allLabel={t("filters.allDoctors")} value={doctorFilter} onChange={setDoctorFilter} options={doctorOptions} />
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="text-xs text-slate-500">{t("resultCount", { count: filteredRows.length })}</span>
          <button type="button" onClick={clearFilters} className="rounded-full border border-slate-200 px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50">
            {t("filters.clear")}
          </button>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">{t("loading")}</div>
        ) : error ? (
          <div className="p-6 text-xs text-red-600">{error}</div>
        ) : visibleRows.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">{t("empty")}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th
                    aria-sort={dateSortDirection === "asc" ? "ascending" : "descending"}
                    className="whitespace-nowrap px-4 py-3 font-medium"
                  >
                    <button
                      type="button"
                      onClick={() => setDateSortDirection((direction) => direction === "asc" ? "desc" : "asc")}
                      aria-label={`${t("columns.date")}: ${t(dateSortDirection === "asc" ? "sortAscending" : "sortDescending")}`}
                      className="inline-flex items-center gap-1.5 rounded text-left hover:text-sky-700 focus:outline-none focus:ring-2 focus:ring-sky-500/40"
                    >
                      <span>{t("columns.date")}</span>
                      <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
                        {dateSortDirection === "asc" ? <path d="m6 12 4-4 4 4" /> : <path d="m6 8 4 4 4-4" />}
                      </svg>
                    </button>
                  </th>
                  <TableHeader>{t("columns.patient")}</TableHeader>
                  <TableHeader>{t("columns.service")}</TableHeader>
                  <TableHeader>{t("columns.category")}</TableHeader>
                  <TableHeader>{t("columns.status")}</TableHeader>
                  <TableHeader>{t("columns.doctor")}</TableHeader>
                  <TableHeader>{t("columns.location")}</TableHeader>
                  <TableHeader>{t("columns.state")}</TableHeader>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map((row) => (
                  <tr key={row.id} tabIndex={0} onClick={() => openInCalendar(row)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") openInCalendar(row); }} className="cursor-pointer hover:bg-sky-50/60 focus:bg-sky-50 focus:outline-none">
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                      <div className="font-medium">{formatSwissDate(row.start_time)}</div>
                      <div className="text-slate-500">{formatSwissTimeRange(new Date(row.start_time), row.end_time ? new Date(row.end_time) : null)}</div>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">{row.patientName}</td>
                    <td className="max-w-[260px] px-4 py-3 text-slate-700">{row.service}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.category}</td>
                    <td className="whitespace-nowrap px-4 py-3"><span className="rounded-full bg-sky-100 px-2 py-1 font-medium text-sky-800">{row.workflowStatus}</span></td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.doctor}</td>
                    <td className="whitespace-nowrap px-4 py-3 text-slate-700">{row.location || t("notSpecified")}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {row.status === "cancelled" ? <span className="rounded-full bg-rose-100 px-2 py-1 font-medium text-rose-700">{t("cancelled")}</span> : <span className="text-slate-400">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!loading && !error && filteredRows.length > PAGE_SIZE && (
          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
            <button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))} className="rounded-full border border-slate-200 px-3 py-1.5 disabled:opacity-40">{t("previous")}</button>
            <span>{t("page", { page, pages: pageCount })}</span>
            <button type="button" disabled={page === pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))} className="rounded-full border border-slate-200 px-3 py-1.5 disabled:opacity-40">{t("next")}</button>
          </div>
        )}
      </section>
    </div>
  );
}

function FilterSelect({ label, allLabel, value, onChange, options }: { label: string; allLabel: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="space-y-1 text-[11px] font-medium text-slate-600">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-800">
        <option value="">{allLabel}</option>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function SearchableFilterSelect({
  listId,
  label,
  allLabel,
  searchPlaceholder,
  value,
  onChange,
  options,
}: {
  listId: string;
  label: string;
  allLabel: string;
  searchPlaceholder: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);

  useEffect(() => setQuery(value), [value]);

  const matchingOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    if (!normalizedQuery || (value && query === value)) return options;
    return options.filter((option) =>
      option.toLocaleLowerCase("fr").includes(normalizedQuery),
    );
  }, [options, query, value]);

  function selectOption(nextValue: string) {
    onChange(nextValue);
    setQuery(nextValue);
    setOpen(false);
  }

  return (
    <label className="relative space-y-1 text-[11px] font-medium text-slate-600">
      <span>{label}</span>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          placeholder={searchPlaceholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            if (value) onChange("");
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
            if (event.key === "Enter" && matchingOptions.length === 1) {
              event.preventDefault();
              selectOption(matchingOptions[0]);
            }
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-800"
        />
        {(query || value) && (
          <button
            type="button"
            aria-label={allLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => selectOption("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        )}
        {open && (
          <div id={listId} role="listbox" className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <button
              type="button"
              role="option"
              aria-selected={!value}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption("")}
              className={`block w-full px-3 py-2 text-left text-xs hover:bg-sky-50 ${!value ? "font-medium text-sky-700" : "text-slate-700"}`}
            >
              {allLabel}
            </button>
            {matchingOptions.map((option) => (
              <button
                key={option}
                type="button"
                role="option"
                aria-selected={value === option}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => selectOption(option)}
                className={`block w-full px-3 py-2 text-left text-xs hover:bg-sky-50 ${value === option ? "bg-sky-50 font-medium text-sky-700" : "text-slate-700"}`}
              >
                {option}
              </button>
            ))}
            {matchingOptions.length === 0 && (
              <p className="px-3 py-3 text-xs font-normal text-slate-400">{searchPlaceholder}</p>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

function MultiSearchableFilterSelect({
  listId,
  label,
  allLabel,
  searchPlaceholder,
  selectedLabel,
  values,
  onChange,
  options,
}: {
  listId: string;
  label: string;
  allLabel: string;
  searchPlaceholder: string;
  selectedLabel: (count: number) => string;
  values: string[];
  onChange: (values: string[]) => void;
  options: string[];
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  const matchingOptions = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr");
    if (!normalizedQuery) return options;
    return options.filter((option) =>
      option.toLocaleLowerCase("fr").includes(normalizedQuery),
    );
  }, [options, query]);

  function toggleOption(option: string) {
    onChange(
      values.includes(option)
        ? values.filter((value) => value !== option)
        : [...values, option],
    );
  }

  return (
    <label className="relative space-y-1 text-[11px] font-medium text-slate-600">
      <span>{label}</span>
      <div className="relative">
        <input
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          value={query}
          placeholder={values.length > 0 ? selectedLabel(values.length) : searchPlaceholder}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 150)}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 pr-8 text-xs text-slate-800 placeholder:text-slate-500"
        />
        {(query || values.length > 0) && (
          <button
            type="button"
            aria-label={allLabel}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              setQuery("");
              onChange([]);
            }}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            ×
          </button>
        )}
        {open && (
          <div id={listId} role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <button
              type="button"
              role="option"
              aria-selected={values.length === 0}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => onChange([])}
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-sky-50 ${values.length === 0 ? "font-medium text-sky-700" : "text-slate-700"}`}
            >
              <input type="checkbox" readOnly checked={values.length === 0} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600" />
              {allLabel}
            </button>
            {matchingOptions.map((option) => {
              const selected = values.includes(option);
              return (
                <button
                  key={option}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => toggleOption(option)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs hover:bg-sky-50 ${selected ? "bg-sky-50 font-medium text-sky-700" : "text-slate-700"}`}
                >
                  <input type="checkbox" readOnly checked={selected} className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600" />
                  <span>{option}</span>
                </button>
              );
            })}
            {matchingOptions.length === 0 && (
              <p className="px-3 py-3 text-xs font-normal text-slate-400">{searchPlaceholder}</p>
            )}
          </div>
        )}
      </div>
    </label>
  );
}

function TableHeader({ children }: { children: React.ReactNode }) {
  return <th className="whitespace-nowrap px-4 py-3 font-medium">{children}</th>;
}
