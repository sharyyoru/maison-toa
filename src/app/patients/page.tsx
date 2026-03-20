"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
};

type OwnerFilter = "all" | "owner";

type CreatedDateFilter = "all" | "today" | "last_7_days" | "last_30_days";

type StatusFilter = "all" | "has_deal" | "no_deal";

type DealStatusByPatient = Record<string, string | null>;

const PAGE_SIZE = 50;

export default function PatientsPage() {
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
            "id, first_name, last_name, email, phone, created_at, contact_owner_name, dob",
            { count: "exact" }
          );

        // Apply server-side search filter
        if (debouncedSearch.trim()) {
          const searchTerm = `%${debouncedSearch.trim()}%`;
          patientsQuery = patientsQuery.or(
            `first_name.ilike.${searchTerm},last_name.ilike.${searchTerm},email.ilike.${searchTerm},phone.ilike.${searchTerm}`
          );
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
          setError(patientsError?.message ?? "Failed to load patients.");
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
        setError("Failed to load patients.");
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
  }, [page, debouncedSearch, ownerFilter, ownerNameFilter, createdFilter]);

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
  }, [ownerFilter, ownerNameFilter, createdFilter, statusFilter]);

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
          <h1 className="text-lg font-semibold text-slate-900">Contacts</h1>
          <p className="text-xs text-slate-500">
            Patient contacts for all pipelines. Use filters to narrow down the list.
          </p>
          <p className="mt-1 text-xs font-medium text-sky-600">
            Total Records: {totalCount.toLocaleString()}
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
          <option value="all">Filter by Owner...</option>
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
          <option value="all">Filter by Create Date...</option>
          <option value="today">Created Today</option>
          <option value="last_7_days">Created in Last 7 Days</option>
          <option value="last_30_days">Created in Last 30 Days</option>
        </select>

        {/* Placeholder Last Activity filter (aliases created_at for now) */}
        <select
          value={createdFilter}
          onChange={(event) =>
            setCreatedFilter(event.target.value as CreatedDateFilter)
          }
          className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">Filter by Last Activity Date...</option>
          <option value="today">Activity Today</option>
          <option value="last_7_days">Activity in Last 7 Days</option>
          <option value="last_30_days">Activity in Last 30 Days</option>
        </select>

        {/* Filter by Status (deal presence) */}
        <select
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as StatusFilter)
          }
          className="min-w-[160px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">Filter by Status...</option>
          <option value="has_deal">With deals</option>
          <option value="no_deal">No deals</option>
        </select>
      </div>

      {/* Main contacts card */}
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-xs shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-1 gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Type a keyword..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          {selectedIds.length >= 2 && (
            <button
              onClick={() => setShowMergeModal(true)}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700"
            >
              Merge {selectedIds.length} Patients
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-[11px] text-slate-500">Loading contacts...</p>
        ) : error ? (
          <p className="text-[11px] text-red-600">{error}</p>
        ) : filteredPatients.length === 0 ? (
          <p className="text-[11px] text-slate-500">No contacts found.</p>
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
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">DOB</th>
                  <th className="py-2 pr-3 font-medium">Mobile Number</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Contact Owner</th>
                  <th className="py-2 pr-3 font-medium">Deal Status</th>
                  <th className="py-2 pr-3 font-medium">Action</th>
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
                        <Link
                          href={buildPatientHref(patient.id)}
                          className="hover:underline"
                        >
                          {fullName || "Unnamed patient"}
                        </Link>
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
                            Edit
                          </Link>
                          <Link
                            href={buildPatientHref(patient.id)}
                            className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                          >
                            View
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
                Previous
              </button>
              <span>
                Page {currentPage} of {totalPages} ({filteredPatients.length.toLocaleString()} results)
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
                Next
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
