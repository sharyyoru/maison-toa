"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";
import PatientMergeModal from "@/components/PatientMergeModal";
import { useAuth } from "@/components/AuthContext";

type PatientRow = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
  contact_owner_name: string | null;
  dob: string | null;
  is_vip: boolean | null;
  is_member: boolean | null;
  is_social_media: boolean | null;
};

// PF-015: status widget filters (AND semantics when multiple are selected)
type WidgetKey = "vip" | "member" | "social";
const WIDGET_COLUMNS: Record<WidgetKey, string> = {
  vip: "is_vip",
  member: "is_member",
  social: "is_social_media",
};

type OwnerFilter = "all" | "owner";

type CreatedDateFilter = "all" | "today" | "last_7_days" | "last_30_days";

type StatusFilter = "all" | "has_deal" | "no_deal";

type DealStatusByPatient = Record<string, string | null>;

const PAGE_SIZE = 50;

export default function PatientsPage() {
  const t = useTranslations("patients");
  const { user } = useAuth();
  const [patients, setPatients] = useState<PatientRow[]>([]);
  const [dealStatusByPatient, setDealStatusByPatient] = useState<DealStatusByPatient>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);

  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>("all");
  const [ownerNameFilter, setOwnerNameFilter] = useState<string | null>(null);
  const [createdFilter, setCreatedFilter] = useState<CreatedDateFilter>("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [widgetFilters, setWidgetFilters] = useState<WidgetKey[]>([]);
  const [widgetDropdownOpen, setWidgetDropdownOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);

  const [priorityMode, setPriorityMode] = useState<"crm" | "medical">("crm");

  // Debounce search input
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // Calculate pagination range
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;

        // Build the patients query with server-side search and pagination
        let patientsQuery = supabaseClient
          .from("patients")
          .select(
            "id, first_name, last_name, email, phone, created_at, contact_owner_name, dob, is_vip, is_member, is_social_media",
            { count: "exact" }
          );

        // PF-015: widget filters — AND semantics across selected widgets
        for (const widget of widgetFilters) {
          patientsQuery = patientsQuery.eq(WIDGET_COLUMNS[widget], true);
        }

        // Apply server-side search filter — chain one .or() per word so that
        // "alexandra christodoulou" is treated as: (any field has "alexandra") AND
        // (any field has "christodoulou"), instead of requiring the exact phrase.
        if (debouncedSearch.trim()) {
          const words = debouncedSearch.trim().split(/\s+/).filter(w => w.length > 0);
          for (const word of words) {
            const t = `%${word}%`;
            patientsQuery = patientsQuery.or(
              `first_name.ilike.${t},last_name.ilike.${t},email.ilike.${t},phone.ilike.${t}`
            );
          }
        }

        // Apply owner filter
        if (ownerFilter === "owner" && ownerNameFilter) {
          patientsQuery = patientsQuery.eq("contact_owner_name", ownerNameFilter);
        }

        // Apply created date filter
        if (createdFilter !== "all") {
          const now = new Date();
          let filterDate: Date;
          if (createdFilter === "today") {
            filterDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          } else if (createdFilter === "last_7_days") {
            filterDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          } else {
            filterDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          }
          patientsQuery = patientsQuery.gte("created_at", filterDate.toISOString());
        }

        // Apply pagination and ordering
        patientsQuery = patientsQuery
          .order("created_at", { ascending: false })
          .range(from, to);

        const patientsResult = await patientsQuery;

        if (!isMounted) return;

        const { data: patientsData, error: patientsError, count } = patientsResult;

        if (patientsError || !patientsData) {
          setError(patientsError?.message ?? t("loadFailed"));
          setPatients([]);
          setDealStatusByPatient({});
          setTotalCount(0);
          setLoading(false);
          return;
        }

        setPatients(patientsData as PatientRow[]);
        setTotalCount(count ?? 0);

        // Only fetch deals for the patients we just loaded (much smaller query)
        if (patientsData.length > 0) {
          const patientIds = patientsData.map((p: any) => p.id);
          const { data: dealsData } = await supabaseClient
            .from("deals")
            .select("patient_id, stage:deal_stages(name)")
            .in("patient_id", patientIds);

          if (isMounted && dealsData) {
            const statusMap: DealStatusByPatient = {};
            for (const row of dealsData as any[]) {
              const pid = row.patient_id as string | null;
              if (!pid || statusMap[pid] != null) continue;
              const stage = row.stage as { name: string | null } | null;
              statusMap[pid] = stage?.name ?? null;
            }
            setDealStatusByPatient(statusMap);
          }
        } else {
          setDealStatusByPatient({});
        }

        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError(t("loadFailed"));
        setPatients([]);
        setDealStatusByPatient({});
        setTotalCount(0);
        setLoading(false);
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [page, debouncedSearch, ownerFilter, ownerNameFilter, createdFilter, widgetFilters]);

  // Load priority mode from user metadata
  useEffect(() => {
    if (!user) return;

    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const rawPriority = (meta["priority_mode"] as string) || "";
    const next: "crm" | "medical" =
      rawPriority === "medical" ? "medical" : "crm";
    setPriorityMode(next);
  }, [user]);

  const ownerOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => {
      if (p.contact_owner_name) {
        set.add(p.contact_owner_name);
      }
    });
    return Array.from(set.values()).sort();
  }, [patients]);

  const statusOptions = useMemo(() => {
    const set = new Set<string>();
    Object.values(dealStatusByPatient).forEach((status) => {
      if (status) set.add(status);
    });
    return Array.from(set.values()).sort();
  }, [dealStatusByPatient]);

  // Client-side filter for status (deal presence) - applied to already paginated results
  const filteredPatients = useMemo(() => {
    if (statusFilter === "all") {
      return patients;
    }
    return patients.filter((patient) => {
      const dealStatus = dealStatusByPatient[patient.id] ?? null;
      if (statusFilter === "has_deal" && !dealStatus) return false;
      if (statusFilter === "no_deal" && dealStatus) return false;
      return true;
    });
  }, [patients, statusFilter, dealStatusByPatient]);

  // Server-side pagination - totalPages based on server count
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [ownerFilter, ownerNameFilter, createdFilter, statusFilter, widgetFilters]);

  function toggleWidgetFilter(widget: WidgetKey) {
    setWidgetFilters((prev) =>
      prev.includes(widget) ? prev.filter((w) => w !== widget) : [...prev, widget],
    );
  }

  // PF-015: export the currently filtered patient list (all pages) as .xlsx
  async function handleExportExcel() {
    setExporting(true);
    try {
      let query = supabaseClient
        .from("patients")
        .select("first_name, last_name, dob, email, phone, contact_owner_name, created_at, is_vip, is_member, is_social_media");

      for (const widget of widgetFilters) {
        query = query.eq(WIDGET_COLUMNS[widget], true);
      }
      if (debouncedSearch.trim()) {
        const words = debouncedSearch.trim().split(/\s+/).filter((w) => w.length > 0);
        for (const word of words) {
          const like = `%${word}%`;
          query = query.or(`first_name.ilike.${like},last_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`);
        }
      }
      if (ownerFilter === "owner" && ownerNameFilter) {
        query = query.eq("contact_owner_name", ownerNameFilter);
      }
      if (createdFilter !== "all") {
        const now = new Date();
        const filterDate =
          createdFilter === "today"
            ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
            : createdFilter === "last_7_days"
              ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
              : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        query = query.gte("created_at", filterDate.toISOString());
      }

      // Fetch all matching rows in pages of 1000 (Supabase limit per request)
      const rows: Record<string, unknown>[] = [];
      const batchSize = 1000;
      for (let offset = 0; ; offset += batchSize) {
        const { data, error: exportError } = await query
          .order("created_at", { ascending: false })
          .range(offset, offset + batchSize - 1);
        if (exportError) throw exportError;
        if (!data || data.length === 0) break;
        rows.push(...(data as Record<string, unknown>[]));
        if (data.length < batchSize) break;
      }

      const XLSX = await import("xlsx");
      const exportData = rows.map((p) => ({
        "First Name": p.first_name ?? "",
        "Last Name": p.last_name ?? "",
        "Date of Birth": p.dob ?? "",
        "Email": p.email ?? "",
        "Phone": p.phone ?? "",
        "Owner": p.contact_owner_name ?? "",
        "VIP": p.is_vip ? "Yes" : "",
        "Membership": p.is_member ? "Yes" : "",
        "Social Media": p.is_social_media ? "Yes" : "",
        "Created At": p.created_at ? new Date(p.created_at as string).toLocaleDateString("fr-CH") : "",
      }));
      const ws = XLSX.utils.json_to_sheet(exportData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Patients");
      const dateStr = new Date().toISOString().slice(0, 10);
      const widgetSuffix = widgetFilters.length > 0 ? `_${widgetFilters.join("-")}` : "";
      XLSX.writeFile(wb, `patients${widgetSuffix}_${dateStr}.xlsx`);
    } catch (err) {
      console.error("Failed to export patients:", err);
      alert("Failed to export patients.");
    } finally {
      setExporting(false);
    }
  }

  // For display - use filtered patients directly (already paginated from server)
  const paginatedPatients = filteredPatients;

  function buildPatientHref(id: string) {
    if (priorityMode === "medical") {
      return `/patients/${id}?mode=medical`;
    }
    return `/patients/${id}`;
  }

  function handleToggleAll(checked: boolean) {
    if (checked) {
      setSelectedIds((prev) => {
        const ids = new Set(prev);
        paginatedPatients.forEach((p) => ids.add(p.id));
        return Array.from(ids.values());
      });
    } else {
      setSelectedIds((prev) =>
        prev.filter((id) => !paginatedPatients.some((p) => p.id === id)),
      );
    }
  }

  function handleToggleRow(id: string, checked: boolean) {
    setSelectedIds((prev) => {
      if (checked) {
        if (prev.includes(id)) return prev;
        return [...prev, id];
      }
      return prev.filter((existing) => existing !== id);
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{t("title")}</h1>
          <p className="text-xs text-slate-500">
            {t("subtitle")}
          </p>
          <p className="mt-1 text-xs font-medium text-sky-600">
            {t("totalRecords", { n: totalCount.toLocaleString() })}
          </p>
        </div>
      </div>

      {/* Top filters row */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Filter by Owner */}
        <select
          value={ownerFilter === "owner" && ownerNameFilter ? ownerNameFilter : "all"}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "all") {
              setOwnerFilter("all");
              setOwnerNameFilter(null);
            } else {
              setOwnerFilter("owner");
              setOwnerNameFilter(value);
            }
          }}
          className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">{t("filterOwner")}</option>
          {ownerOptions.map((owner) => (
            <option key={owner} value={owner}>
              {owner}
            </option>
          ))}
        </select>

        {/* Filter by Create Date */}
        <select
          value={createdFilter}
          onChange={(event) =>
            setCreatedFilter(event.target.value as CreatedDateFilter)
          }
          className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">{t("filterCreateDate")}</option>
          <option value="today">{t("createdToday")}</option>
          <option value="last_7_days">{t("createdLast7")}</option>
          <option value="last_30_days">{t("createdLast30")}</option>
        </select>

        {/* Placeholder Last Activity filter (aliases created_at for now) */}
        <select
          value={createdFilter}
          onChange={(event) =>
            setCreatedFilter(event.target.value as CreatedDateFilter)
          }
          className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">{t("filterLastActivity")}</option>
          <option value="today">{t("activityToday")}</option>
          <option value="last_7_days">{t("activityLast7")}</option>
          <option value="last_30_days">{t("activityLast30")}</option>
        </select>

        {/* Filter by Status (deal presence) */}
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
          className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">{t("filterStatus")}</option>
          <option value="has_deal">{t("withDeals")}</option>
          <option value="no_deal">{t("noDeals")}</option>
        </select>

        {/* PF-015: Filter by status widgets (multi-select checkboxes) */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setWidgetDropdownOpen((open) => !open)}
            className={`min-w-[160px] rounded-lg border px-3 py-1.5 text-left text-xs shadow-sm focus:outline-none ${
              widgetFilters.length > 0
                ? "border-sky-400 bg-sky-50 text-sky-800"
                : "border-slate-200 bg-white text-slate-900"
            }`}
          >
            {widgetFilters.length === 0
              ? t("filterWidgets")
              : widgetFilters
                  .map((w) => (w === "vip" ? "⭐ VIP" : w === "member" ? "💎 MBRS" : "📱 SOCIAL"))
                  .join(" + ")}
          </button>
          {widgetDropdownOpen && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setWidgetDropdownOpen(false)} />
              <div className="absolute left-0 top-full z-40 mt-1 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                {([
                  { key: "vip" as WidgetKey, icon: "⭐", label: t("widgetVip") },
                  { key: "member" as WidgetKey, icon: "💎", label: t("widgetMember") },
                  { key: "social" as WidgetKey, icon: "📱", label: t("widgetSocial") },
                ]).map(({ key, icon, label }) => (
                  <label
                    key={key}
                    className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={widgetFilters.includes(key)}
                      onChange={() => toggleWidgetFilter(key)}
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                    />
                    <span>{icon} {label}</span>
                  </label>
                ))}
                {widgetFilters.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setWidgetFilters([])}
                    className="mt-1 w-full border-t border-slate-100 px-3 py-1.5 text-left text-[11px] text-slate-400 hover:text-slate-600"
                  >
                    ✕ Clear
                  </button>
                )}
              </div>
            </>
          )}
        </div>

        {/* PF-015: Export filtered list to Excel */}
        <button
          type="button"
          onClick={() => void handleExportExcel()}
          disabled={exporting || loading}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-700 shadow-sm hover:bg-emerald-100 disabled:opacity-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2" />
          </svg>
          {exporting ? t("exporting") : t("exportExcel")}
        </button>
      </div>

      {/* Main contacts card */}
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-xs shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={t("searchPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {selectedIds.length >= 2 && (
            <button
              onClick={() => setShowMergeModal(true)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
            >
              {t("mergeBtn", { n: selectedIds.length })}
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-[11px] text-slate-500">{t("loading")}</p>
        ) : error ? (
          <p className="text-[11px] text-red-600">{error}</p>
        ) : filteredPatients.length === 0 ? (
          <p className="text-[11px] text-slate-500">{t("noResults")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="w-8 py-2 pr-2">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      checked={
                        paginatedPatients.length > 0 &&
                        paginatedPatients.every((p) =>
                          selectedIds.includes(p.id),
                        )
                      }
                      onChange={(event) => handleToggleAll(event.target.checked)}
                    />
                  </th>
                  <th className="py-2 pr-3 font-medium">{t("columns.name")}</th>
                  <th className="py-2 pr-3 font-medium">{t("columns.dob")}</th>
                  <th className="py-2 pr-3 font-medium">{t("columns.phone")}</th>
                  <th className="py-2 pr-3 font-medium">{t("columns.email")}</th>
                  <th className="py-2 pr-3 font-medium">{t("columns.owner")}</th>
                  <th className="py-2 pr-3 font-medium">{t("columns.dealStatus")}</th>
                  <th className="py-2 pr-3 font-medium">{t("columns.action")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {paginatedPatients.map((patient) => {
                  const fullName = `${patient.first_name} ${patient.last_name}`.trim();
                  const dealStatus = dealStatusByPatient[patient.id] ?? null;
                  const checked = selectedIds.includes(patient.id);

                  return (
                    <tr key={patient.id} className="hover:bg-slate-50/70">
                      <td className="py-2 pr-2 align-top">
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                          checked={checked}
                          onChange={(event) =>
                            handleToggleRow(patient.id, event.target.checked)
                          }
                        />
                      </td>
                      <td className="py-2 pr-3 align-top text-sky-700">
                        <span className="inline-flex items-center gap-1">
                          <Link
                            href={buildPatientHref(patient.id)}
                            className="hover:underline"
                          >
                            {fullName || t("unnamed")}
                          </Link>
                          {patient.is_vip ? <span title="VIP">⭐</span> : null}
                          {patient.is_member ? <span title="Membership">💎</span> : null}
                          {patient.is_social_media ? <span title="Social Media">📱</span> : null}
                        </span>
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {patient.dob ? new Date(patient.dob).toLocaleDateString() : "—"}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {patient.phone || "—"}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {patient.email || "—"}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {patient.contact_owner_name || "—"}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {dealStatus || "—"}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        <div className="flex flex-wrap items-center gap-1">
                          <Link
                            href={buildPatientHref(patient.id)}
                            className="inline-flex items-center rounded-full border border-emerald-200/80 bg-emerald-500 px-2 py-0.5 text-[10px] font-medium text-white shadow-sm hover:bg-emerald-600"
                          >
                            {t("edit")}
                          </Link>
                          <Link
                            href={buildPatientHref(patient.id)}
                            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            {t("view")}
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mt-3 flex items-center justify-end gap-2 text-[11px] text-slate-600">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
                className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-50"
              >
                {t("previous")}
              </button>
              <span>
                {t("pageInfo", { current: currentPage, total: totalPages, n: filteredPatients.length.toLocaleString() })}
              </span>
              <button
                type="button"
                onClick={() =>
                  setPage((prev) =>
                    prev < totalPages ? prev + 1 : prev,
                  )
                }
                disabled={currentPage === totalPages}
                className="rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-50"
              >
                {t("next")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Patient Merge Modal */}
      {showMergeModal && (
        <PatientMergeModal
          patientIds={selectedIds}
          onClose={() => setShowMergeModal(false)}
          onSuccess={() => {
            setSelectedIds([]);
            setShowMergeModal(false);
            // Reload patients
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
