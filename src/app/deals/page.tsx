"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import AppointmentModal, { type AppointmentData } from "@/components/AppointmentModal";
import { formatSwissShortDate, formatSwissTime } from "@/lib/swissTimezone";

type DealStageType =
  | "lead"
  | "consultation"
  | "surgery"
  | "post_op"
  | "follow_up"
  | "other";

type DealStage = {
  id: string;
  name: string;
  type: DealStageType;
  sort_order: number;
  is_default: boolean;
};

type DealPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  contact_owner_name: string | null;
};

type DealService = {
  id: string;
  name: string | null;
};

type DealAppointment = {
  id: string;
  start_time: string;
  end_time: string;
  status: string;
  reason: string | null;
  location: string | null;
};

type DealRow = {
  id: string;
  patient_id: string;
  stage_id: string;
  service_id: string | null;
  pipeline: string | null;
  contact_label: string | null;
  location: string | null;
  title: string | null;
  value: number | null;
  notes: string | null;
  owner_id: string | null;
  owner_name: string | null;
  created_at: string;
  updated_at: string;
  patient: DealPatient | null;
  service: DealService | null;
  appointment?: DealAppointment | null;
};

type DealsView = "list" | "board";

export default function DealsPage() {
  const router = useRouter();
  const [view, setView] = useState<DealsView>("list");
  const [deals, setDeals] = useState<DealRow[]>([]);
  const [dealStages, setDealStages] = useState<DealStage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [stageFilter, setStageFilter] = useState<string>("all");
  const [dragDealId, setDragDealId] = useState<string | null>(null);
  const [updatingDealId, setUpdatingDealId] = useState<string | null>(null);
  const [invoicedDealIds, setInvoicedDealIds] = useState<Set<string>>(new Set());

  const [contactOwnerFilter, setContactOwnerFilter] = useState<string>("");
  const [contactOwnerSearch, setContactOwnerSearch] = useState("");
  const [contactOwnerDropdownOpen, setContactOwnerDropdownOpen] = useState(false);
  const [dealOwnerFilter, setDealOwnerFilter] = useState<string>("");
  const [dealOwnerSearch, setDealOwnerSearch] = useState("");
  const [dealOwnerDropdownOpen, setDealOwnerDropdownOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [userOptions, setUserOptions] = useState<Array<{ id: string; full_name: string | null; email: string | null }>>([]);

  // List view pagination
  const [listPage, setListPage] = useState(1);
  const LIST_ITEMS_PER_PAGE = 25;

  // Kanban view load more (per stage)
  const KANBAN_ITEMS_PER_STAGE = 20;
  const [stageLoadMoreCounts, setStageLoadMoreCounts] = useState<Record<string, number>>({});

  // Appointment modal state
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const [appointmentDeal, setAppointmentDeal] = useState<DealRow | null>(null);
  const [appointmentPreviousStageId, setAppointmentPreviousStageId] = useState<string | null>(null);
  const [appointmentTargetStageId, setAppointmentTargetStageId] = useState<string | null>(null);
  const appointmentSuccessRef = useRef(false);

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        const response = await fetch("/api/users/list");
        if (!response.ok) return;
        const json = await response.json();
        if (!isMounted) return;
        setUserOptions(Array.isArray(json) ? json : []);
      } catch {
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        const [stagesResult, dealsResult] = await Promise.all([
          supabaseClient
            .from("deal_stages")
            .select("id, name, type, sort_order, is_default")
            .order("sort_order", { ascending: true }),
          supabaseClient
            .from("deals")
            .select(
              "id, patient_id, stage_id, service_id, pipeline, contact_label, location, title, value, notes, owner_id, owner_name, created_at, updated_at, patient:patients(id, first_name, last_name, contact_owner_name), service:services(id, name)",
            )
            .order("created_at", { ascending: false }),
        ]);

        if (!isMounted) return;

        const { data: stagesData, error: stagesError } = stagesResult;
        const { data: dealsData, error: dealsError } = dealsResult;

        if (stagesError || !stagesData) {
          setDealStages([]);
        } else {
          setDealStages(stagesData as DealStage[]);
        }

        if (dealsError || !dealsData) {
          setError(dealsError?.message ?? "Failed to load deals.");
          setDeals([]);
          setLoading(false);
          return;
        }

        // Fetch appointments for patients to link to deals in "Appointment Set" stage
        const patientIds = [...new Set((dealsData as unknown as DealRow[]).map(d => d.patient_id))];
        const { data: appointmentsData } = await supabaseClient
          .from("appointments")
          .select("id, patient_id, start_time, end_time, status, reason, location")
          .in("patient_id", patientIds)
          .order("start_time", { ascending: false });

        // Map appointments by patient_id (most recent first)
        const appointmentsByPatient: Record<string, DealAppointment> = {};
        if (appointmentsData) {
          for (const apt of appointmentsData) {
            if (!appointmentsByPatient[apt.patient_id]) {
              appointmentsByPatient[apt.patient_id] = apt as DealAppointment;
            }
          }
        }

        // Attach appointments to deals in "Appointment Set" or "Operation Scheduled" stages
        const appointmentStages = stagesData?.filter(
          (s: DealStage) => s.name.toLowerCase().includes("appointment set") || s.name.toLowerCase().includes("operation scheduled")
        ) || [];
        const appointmentStageIds = new Set(appointmentStages.map((s: DealStage) => s.id));
        const dealsWithAppointments = (dealsData as unknown as DealRow[]).map(deal => {
          if (appointmentStageIds.has(deal.stage_id)) {
            return { ...deal, appointment: appointmentsByPatient[deal.patient_id] || null };
          }
          return deal;
        });

        setDeals(dealsWithAppointments);

        // Fetch invoiced deals (consultations with invoice data)
        const dealIds = dealsWithAppointments.map(d => d.id);
        if (dealIds.length > 0) {
          const { data: consultationsData } = await supabaseClient
            .from("consultations")
            .select("id, deal_id")
            .in("deal_id", dealIds)
            .not("invoice_total_amount", "is", null);

          if (consultationsData) {
            const invoicedIds = new Set(
              consultationsData
                .map(c => c.deal_id)
                .filter((id): id is string => id !== null)
            );
            setInvoicedDealIds(invoicedIds);
          }
        }

        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError("Failed to load deals.");
        setDeals([]);
        setLoading(false);
      }
    }

    load();

    return () => {
      isMounted = false;
    };
  }, []);

  function handleContactOwnerSearchChange(value: string) {
    setContactOwnerSearch(value);
    setContactOwnerDropdownOpen(value.trim().length > 0);
  }

  function handleContactOwnerSelect(userId: string, userName: string) {
    setContactOwnerFilter(userId);
    setContactOwnerSearch(userName);
    setContactOwnerDropdownOpen(false);
  }

  function handleContactOwnerClear() {
    setContactOwnerFilter("");
    setContactOwnerSearch("");
    setContactOwnerDropdownOpen(false);
  }

  function handleDealOwnerSearchChange(value: string) {
    setDealOwnerSearch(value);
    setDealOwnerDropdownOpen(value.trim().length > 0);
  }

  function handleDealOwnerSelect(userId: string, userName: string) {
    setDealOwnerFilter(userId);
    setDealOwnerSearch(userName);
    setDealOwnerDropdownOpen(false);
  }

  function handleDealOwnerClear() {
    setDealOwnerFilter("");
    setDealOwnerSearch("");
    setDealOwnerDropdownOpen(false);
  }

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const normalizedPatientSearch = patientSearch.trim().toLowerCase();

  const filteredDeals = useMemo(() => {
    let filtered = deals;

    // Service filter
    if (serviceFilter !== "all") {
      filtered = filtered.filter((deal) => deal.service?.id === serviceFilter);
    }

    // Stage filter
    if (stageFilter !== "all") {
      filtered = filtered.filter((deal) => deal.stage_id === stageFilter);
    }

    // Contact Owner filter - filter by patient's contact_owner_name
    if (contactOwnerFilter) {
      const selectedUser = userOptions.find(u => u.id === contactOwnerFilter);
      if (selectedUser) {
        const ownerName = (selectedUser.full_name || selectedUser.email || "").toLowerCase();
        filtered = filtered.filter((deal) => {
          const patientOwner = (deal.patient?.contact_owner_name ?? "").toLowerCase();
          return patientOwner.includes(ownerName);
        });
      }
    }

    // Deal Owner filter - filter by deal's owner_id
    if (dealOwnerFilter) {
      filtered = filtered.filter((deal) => deal.owner_id === dealOwnerFilter);
    }

    // Patient name/email search
    if (normalizedPatientSearch) {
      filtered = filtered.filter((deal) => {
        const patientName = `${deal.patient?.first_name ?? ""} ${deal.patient?.last_name ?? ""}`
          .trim()
          .toLowerCase();
        return patientName.includes(normalizedPatientSearch);
      });
    }

    // General search
    if (normalizedSearch) {
      filtered = filtered.filter((deal) => {
        const title = (deal.title ?? "").toLowerCase();
        const pipeline = (deal.pipeline ?? "").toLowerCase();
        const patientName = `${deal.patient?.first_name ?? ""} ${deal.patient?.last_name ?? ""}`
          .trim()
          .toLowerCase();
        const serviceName = (deal.service?.name ?? "").toLowerCase();

        return (
          title.includes(normalizedSearch) ||
          pipeline.includes(normalizedSearch) ||
          patientName.includes(normalizedSearch) ||
          serviceName.includes(normalizedSearch)
        );
      });
    }

    return filtered;
  }, [deals, normalizedSearch, normalizedPatientSearch, serviceFilter, stageFilter, contactOwnerFilter, dealOwnerFilter, userOptions]);

  const uniqueServices = useMemo(() => {
    const map = new Map<string, string>();
    deals.forEach((deal) => {
      const id = deal.service?.id;
      const name = deal.service?.name;
      if (id && name && !map.has(id)) {
        map.set(id, name);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [deals]);

  // Board deals should use the same filtered deals as the list view
  const boardDeals = filteredDeals;

  // List view pagination calculations
  const totalListPages = Math.ceil(filteredDeals.length / LIST_ITEMS_PER_PAGE);
  const paginatedListDeals = useMemo(() => {
    const start = (listPage - 1) * LIST_ITEMS_PER_PAGE;
    const end = start + LIST_ITEMS_PER_PAGE;
    return filteredDeals.slice(start, end);
  }, [filteredDeals, listPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setListPage(1);
  }, [searchQuery, serviceFilter, stageFilter]);

  // Helper to get visible deals count for a stage in kanban
  function getVisibleCountForStage(stageId: string): number {
    return stageLoadMoreCounts[stageId] ?? KANBAN_ITEMS_PER_STAGE;
  }

  function handleLoadMoreForStage(stageId: string) {
    setStageLoadMoreCounts((prev) => ({
      ...prev,
      [stageId]: (prev[stageId] ?? KANBAN_ITEMS_PER_STAGE) + KANBAN_ITEMS_PER_STAGE,
    }));
  }

  const boardScrollRef = useRef<HTMLDivElement | null>(null);
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const boardContentRef = useRef<HTMLDivElement | null>(null);

  function handleBoardDragOver(event: any) {
    if (!dragDealId) return;

    const container = boardScrollRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const edgeThreshold = 80;
    const scrollSpeed = 20;
    const x = event.clientX as number;

    if (x - rect.left < edgeThreshold) {
      container.scrollLeft -= scrollSpeed;
    } else if (rect.right - x < edgeThreshold) {
      container.scrollLeft += scrollSpeed;
    }

    event.preventDefault();
  }

  function getStageName(stageId: string) {
    const stage = dealStages.find((candidate) => candidate.id === stageId);
    return stage ? stage.name : "Unknown";
  }

  async function handleDropOnStage(stageId: string) {
    if (!dragDealId) return;

    const current = deals.find((deal) => deal.id === dragDealId);
    if (!current || current.stage_id === stageId) {
      setDragDealId(null);
      return;
    }

    const previousStageId = current.stage_id;

    setDeals((prev) =>
      prev.map((deal) =>
        deal.id === dragDealId
          ? {
              ...deal,
              stage_id: stageId,
            }
          : deal,
      ),
    );
    setUpdatingDealId(dragDealId);

    try {
      const { error } = await supabaseClient
        .from("deals")
        .update({ stage_id: stageId, updated_at: new Date().toISOString() })
        .eq("id", dragDealId);

      if (error) {
        setDeals((prev) =>
          prev.map((deal) =>
            deal.id === dragDealId
              ? {
                  ...deal,
                  stage_id: previousStageId,
                }
              : deal,
          ),
        );
      } else {
        // Check if the target stage is "Appointment Set" or "Operation Scheduled" to show the appointment modal
        const targetStage = dealStages.find((stage) => stage.id === stageId);
        const stageLower = targetStage?.name.toLowerCase() || "";
        if (targetStage && (stageLower.includes("appointment set") || stageLower.includes("operation scheduled"))) {
          // Show the appointment modal - store stage info for potential revert
          setAppointmentDeal(current);
          setAppointmentPreviousStageId(previousStageId);
          setAppointmentTargetStageId(stageId);
          setAppointmentModalOpen(true);
        }
        
        try {
          void fetch("/api/workflows/deal-stage-changed", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              dealId: dragDealId,
              patientId: current.patient_id,
              fromStageId: previousStageId,
              toStageId: stageId,
              pipeline: current.pipeline,
            }),
          });
        } catch {
        }
      }
    } catch {
      setDeals((prev) =>
        prev.map((deal) =>
          deal.id === dragDealId
            ? {
                ...deal,
                stage_id: previousStageId,
              }
            : deal,
        ),
      );
    } finally {
      setUpdatingDealId(null);
      setDragDealId(null);
    }
  }

  const totalDeals = deals.length;

  // Calculate metrics
  const metrics = useMemo(() => {
    // Total Deal Amount: sum of all deal values
    const totalDealAmount = deals.reduce((sum, deal) => {
      return sum + (deal.value || 0);
    }, 0);

    // Weighted Deal: sum of deals that have been invoiced
    const weightedDeal = deals
      .filter(deal => invoicedDealIds.has(deal.id))
      .reduce((sum, deal) => sum + (deal.value || 0), 0);

    // Find "Closed Won" stage
    const closedWonStage = dealStages.find(
      stage => stage.name.toLowerCase().includes("closed won")
    );

    // Open Deal Amount: deals in stages before Closed Won
    const openDealAmount = deals
      .filter(deal => {
        if (!closedWonStage) return true;
        return deal.stage_id !== closedWonStage.id;
      })
      .reduce((sum, deal) => sum + (deal.value || 0), 0);

    // Closed Deal Amount: deals in Closed Won stage
    const closedDealAmount = deals
      .filter(deal => {
        if (!closedWonStage) return 0;
        return deal.stage_id === closedWonStage.id;
      })
      .reduce((sum, deal) => sum + (deal.value || 0), 0);

    return {
      totalDealAmount,
      weightedDeal,
      openDealAmount,
      closedDealAmount,
    };
  }, [deals, dealStages, invoicedDealIds]);

  return (
    <div className="space-y-6">
      {/* Main centered container: header, metrics, filter, and list view */}
      <div className="flex justify-center">
        <div className="w-full max-w-5xl space-y-6">
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Deals</h1>
              <p className="text-sm text-slate-500">
                Global overview of all deals. Use a patient record to create and
                manage individual deals.
              </p>
            </div>
            <div className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50/80 p-1 text-[11px] text-slate-600">
              <button
                type="button"
                onClick={() => setView("list")}
                className={
                  "rounded-full px-3 py-1 " +
                  (view === "list"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "hover:text-slate-900")
                }
              >
                List
              </button>
              <button
                type="button"
                onClick={() => setView("board")}
                className={
                  "rounded-full px-3 py-1 " +
                  (view === "board"
                    ? "bg-slate-900 text-white shadow-sm"
                    : "hover:text-slate-900")
                }
              >
                Board
              </button>
            </div>
          </div>

          <div className="space-y-4">
            {/* Metrics */}
            <div className="grid w-full gap-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 text-xs shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">Total Deal Amount</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {metrics.totalDealAmount.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Sum of all deal values</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 text-xs shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">Weighted Deal</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {metrics.weightedDeal.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Invoiced deals only</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 text-xs shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">Open Deal Amount</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {metrics.openDealAmount.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF
                </p>
                <p className="mt-1 text-[11px] text-slate-400">Before Closed Won</p>
              </div>
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 text-xs shadow-sm">
                <p className="text-[11px] font-medium text-slate-500">Closed Deal Amount</p>
                <p className="mt-2 text-lg font-semibold text-slate-900">
                  {metrics.closedDealAmount.toLocaleString('en-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} CHF
                </p>
                <p className="mt-1 text-[11px] text-slate-400">{totalDeals} total deals</p>
              </div>
            </div>

            {/* Global filters (applies to list + board) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={stageFilter}
                  onChange={(event) => setStageFilter(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All stages</option>
                  {dealStages.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </select>
                <select
                  value={serviceFilter}
                  onChange={(event) => setServiceFilter(event.target.value)}
                  className="rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="all">All services</option>
                  {uniqueServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
                
                {/* Contact Owner Smart Search */}
                <div className="relative">
                  <input
                    type="text"
                    value={contactOwnerSearch}
                    onChange={(event) => handleContactOwnerSearchChange(event.target.value)}
                    placeholder="Contact Owner..."
                    className="w-48 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 pr-7 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {contactOwnerFilter && (
                    <button
                      type="button"
                      onClick={handleContactOwnerClear}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  )}
                  {contactOwnerDropdownOpen && (() => {
                    const query = contactOwnerSearch.trim().toLowerCase();
                    const filteredUsers = userOptions
                      .filter((u) => {
                        const hay = (u.full_name || u.email || "").toLowerCase();
                        return hay.includes(query);
                      })
                      .slice(0, 6);

                    if (filteredUsers.length === 0) return null;

                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                        {filteredUsers.map((user) => {
                          const display = user.full_name || user.email || "Unnamed user";
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => handleContactOwnerSelect(user.id, display)}
                              className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                            >
                              {display}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Deal Owner Smart Search */}
                <div className="relative">
                  <input
                    type="text"
                    value={dealOwnerSearch}
                    onChange={(event) => handleDealOwnerSearchChange(event.target.value)}
                    placeholder="Deal Owner..."
                    className="w-48 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 pr-7 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                  {dealOwnerFilter && (
                    <button
                      type="button"
                      onClick={handleDealOwnerClear}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      ×
                    </button>
                  )}
                  {dealOwnerDropdownOpen && (() => {
                    const query = dealOwnerSearch.trim().toLowerCase();
                    const filteredUsers = userOptions
                      .filter((u) => {
                        const hay = (u.full_name || u.email || "").toLowerCase();
                        return hay.includes(query);
                      })
                      .slice(0, 6);

                    if (filteredUsers.length === 0) return null;

                    return (
                      <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                        {filteredUsers.map((user) => {
                          const display = user.full_name || user.email || "Unnamed user";
                          return (
                            <button
                              key={user.id}
                              type="button"
                              onClick={() => handleDealOwnerSelect(user.id, display)}
                              className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                            >
                              {display}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })()}
                </div>

                {/* Patient Smart Search */}
                <input
                  type="text"
                  value={patientSearch}
                  onChange={(event) => setPatientSearch(event.target.value)}
                  placeholder="Search patient..."
                  className="w-48 rounded-lg border border-slate-200 bg-slate-50/80 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            {/* List view card (only when view === 'list') */}
            {view === "list" && (
              <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-xs shadow-sm">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-1 gap-2">
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(event) => setSearchQuery(event.target.value)}
                      placeholder="Search by deal, patient, pipeline, or service"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href="/patients"
                      className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
                    >
                      <span className="inline-flex h-3 w-3 items-center justify-center">
                        <svg
                          className="h-3 w-3"
                          viewBox="0 0 20 20"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        >
                          <path d="M10 4v12" />
                          <path d="M4 10h12" />
                        </svg>
                      </span>
                      <span>Create Deal (via patient)</span>
                    </Link>
                  </div>
                </div>

                {loading ? (
                  <p className="text-[11px] text-slate-500">Loading deals...</p>
                ) : error ? (
                  <p className="text-[11px] text-red-600">{error}</p>
                ) : filteredDeals.length === 0 ? (
                  <p className="text-[11px] text-slate-500">No deals found.</p>
                ) : (
                  <>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-[11px]">
                      <thead className="border-b text-[10px] uppercase tracking-wide text-slate-500">
                        <tr>
                          <th className="py-2 pr-3 font-medium">ID</th>
                          <th className="py-2 pr-3 font-medium">Deal Name</th>
                          <th className="py-2 pr-3 font-medium">Pipeline</th>
                          <th className="py-2 pr-3 font-medium">Stage</th>
                          <th className="py-2 pr-3 font-medium">Service</th>
                          <th className="py-2 pr-3 font-medium">Patient</th>
                          <th className="py-2 pr-3 font-medium">Contact Owner</th>
                          <th className="py-2 pr-3 font-medium">Deal Owner</th>
                          <th className="py-2 pr-3 font-medium">Created</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {paginatedListDeals.map((deal) => {
                          const stageName = getStageName(deal.stage_id);
                          const patientName = deal.patient
                            ? `${deal.patient.first_name ?? ""} ${
                                deal.patient.last_name ?? ""
                              }`.trim() || "Unknown patient"
                            : "Unknown patient";
                          const createdDate = deal.created_at
                            ? new Date(deal.created_at)
                            : null;
                          const createdLabel =
                            createdDate && !Number.isNaN(createdDate.getTime())
                              ? createdDate.toLocaleDateString()
                              : "—";

                          const serviceName = deal.service?.name ?? "Not set";

                          return (
                            <tr
                              key={deal.id}
                              onClick={() =>
                                router.push(
                                  `/patients/${deal.patient_id}?m_tab=crm&crm_sub=deals`,
                                )
                              }
                              className="cursor-pointer hover:bg-slate-50/70"
                            >
                              <td className="py-2 pr-3 align-top text-slate-500">
                                {deal.id.slice(0, 8)}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-900">
                                {deal.title || "Untitled deal"}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-700">
                                {deal.pipeline || "Geneva"}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-700">
                                <span>{stageName}</span>
                                {/* Show appointment details for "Appointment Set" stage */}
                                {deal.appointment && (
                                  <div className="mt-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-1">
                                    <div className="flex items-center gap-1 text-emerald-700">
                                      <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                      </svg>
                                      <span className="text-[10px] font-medium">
                                        {formatSwissShortDate(deal.appointment.start_time)}{" "}
                                        {formatSwissTime(deal.appointment.start_time)}
                                      </span>
                                    </div>
                                  </div>
                                )}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-700">
                                {serviceName}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-700">
                                <span className="text-sky-700 underline-offset-2 hover:underline">
                                  {patientName}
                                </span>
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-600">
                                {deal.patient?.contact_owner_name || "—"}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-600">
                                {deal.owner_name || "—"}
                              </td>
                              <td className="py-2 pr-3 align-top text-slate-500">
                                {createdLabel}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination controls */}
                  {totalListPages > 1 && (
                    <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                      <p className="text-[11px] text-slate-500">
                        Showing {((listPage - 1) * LIST_ITEMS_PER_PAGE) + 1} to {Math.min(listPage * LIST_ITEMS_PER_PAGE, filteredDeals.length)} of {filteredDeals.length} deals
                      </p>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setListPage((p) => Math.max(1, p - 1))}
                          disabled={listPage === 1}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          ←
                        </button>
                        {Array.from({ length: Math.min(5, totalListPages) }, (_, i) => {
                          let pageNum: number;
                          if (totalListPages <= 5) {
                            pageNum = i + 1;
                          } else if (listPage <= 3) {
                            pageNum = i + 1;
                          } else if (listPage >= totalListPages - 2) {
                            pageNum = totalListPages - 4 + i;
                          } else {
                            pageNum = listPage - 2 + i;
                          }
                          return (
                            <button
                              key={pageNum}
                              type="button"
                              onClick={() => setListPage(pageNum)}
                              className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border text-[11px] ${
                                listPage === pageNum
                                  ? "border-sky-500 bg-sky-500 text-white"
                                  : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                              }`}
                            >
                              {pageNum}
                            </button>
                          );
                        })}
                        <button
                          type="button"
                          onClick={() => setListPage((p) => Math.min(totalListPages, p + 1))}
                          disabled={listPage === totalListPages}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-[11px] text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          →
                        </button>
                      </div>
                    </div>
                  )}
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Floating kanban board, outside the main container but aligned to it */}
      {view === "board" && (
        <div className="relative z-10 w-full px-4">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between gap-2 px-1 text-xs">
              <span className="text-[11px] text-slate-400">
                Drag deals between stages to update their status.
              </span>
            </div>
          </div>
          <div className="mt-2 rounded-xl border border-slate-200/80 bg-white/90 text-xs shadow-sm">
              {/* Top scrollbar - identical to bottom, synced with main board */}
              <div
                ref={topScrollRef}
                className="kanban-scroll w-full max-w-full"
                style={{ height: '18px' }}
                onScroll={(e) => {
                  if (boardScrollRef.current) {
                    boardScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
              >
                {/* Mirror the same content width as bottom scroller */}
                <div className="flex w-max gap-3 px-3 md:gap-4" style={{ visibility: 'hidden', height: '1px' }}>
                  {dealStages.map((stage) => (
                    <div key={stage.id} className="min-w-[260px] max-w-xs flex-shrink-0" />
                  ))}
                </div>
              </div>
              <div
                className="kanban-scroll w-full max-w-full pb-2"
                ref={boardScrollRef}
                onDragOver={handleBoardDragOver}
                onScroll={(e) => {
                  if (topScrollRef.current) {
                    topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
                  }
                }}
              >
                <div ref={boardContentRef} className="flex w-max gap-3 px-3 py-3 md:gap-4">
                  {dealStages.map((stage) => {
                    const allStageDeals = boardDeals.filter(
                      (deal) => deal.stage_id === stage.id,
                    );
                    const visibleCount = getVisibleCountForStage(stage.id);
                    const stageDeals = allStageDeals.slice(0, visibleCount);
                    const hasMoreDeals = allStageDeals.length > visibleCount;

                    return (
                      <div
                        key={stage.id}
                        className="flex min-w-[260px] max-w-xs flex-shrink-0 flex-col rounded-xl border border-slate-200/80 bg-slate-50/80"
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          void handleDropOnStage(stage.id);
                        }}
                      >
                        <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-white/90 px-3 py-2 text-[11px]">
                          <p className="font-semibold text-slate-800">
                            {stage.name}
                          </p>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {allStageDeals.length}
                          </span>
                        </div>
                        <div className="flex-1 space-y-2 overflow-y-auto p-2">
                          {stageDeals.length === 0 ? (
                            <p className="text-[10px] text-slate-400">
                              No deals in this stage.
                            </p>
                          ) : (
                            stageDeals.map((deal) => {
                              const createdDate = deal.created_at
                                ? new Date(deal.created_at)
                                : null;
                              const createdLabel =
                                createdDate &&
                                !Number.isNaN(createdDate.getTime())
                                  ? createdDate.toLocaleDateString()
                                  : "—";

                              const serviceName = deal.service?.name ?? "Not set";
                              const patientName = deal.patient
                                ? `${deal.patient.first_name ?? ""} ${
                                    deal.patient.last_name ?? ""
                                  }`.trim() || "Unknown patient"
                                : "Unknown patient";

                              const isUpdating = updatingDealId === deal.id;

                              return (
                                <div
                                  key={deal.id}
                                  draggable
                                  onDragStart={() => setDragDealId(deal.id)}
                                  onDragEnd={() => setDragDealId(null)}
                                  onClick={() =>
                                    router.push(
                                      `/patients/${deal.patient_id}?m_tab=crm&crm_sub=deals&dealId=${deal.id}`,
                                    )
                                  }
                                  className="cursor-pointer rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-[11px] text-slate-800 shadow-sm transition hover:border-sky-300 hover:shadow-md"
                                >
                                  <p className="text-[11px] font-semibold text-sky-700">
                                    {deal.title || "Untitled deal"}
                                  </p>
                                  <p className="mt-0.5 text-[12px] font-semibold text-emerald-700">
                                    Patient: {patientName}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Pipeline: {deal.pipeline || "Geneva"}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Location: {deal.location || "Rhône"}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Service:{" "}
                                    <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                                      {serviceName}
                                    </span>
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Contact label: {deal.contact_label || "Marketing"}
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Contact Owner: <span className="font-medium text-emerald-700">{deal.patient?.contact_owner_name || "—"}</span>
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-600">
                                    Deal Owner: <span className="font-medium text-sky-700">{deal.owner_name || "—"}</span>
                                  </p>
                                  <p className="mt-0.5 text-[10px] text-slate-500">
                                    Created: {createdLabel}
                                  </p>
                                  {/* Show appointment details for "Appointment Set" stage */}
                                  {deal.appointment && (
                                    <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50 p-2">
                                      <div className="flex items-center gap-1.5 text-emerald-700">
                                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                        </svg>
                                        <span className="text-[10px] font-semibold">Appointment Scheduled</span>
                                      </div>
                                      <p className="mt-1 text-[10px] text-emerald-600">
                                        {new Date(deal.appointment.start_time).toLocaleDateString("en-US", {
                                          weekday: "short",
                                          month: "short",
                                          day: "numeric",
                                        })}{" "}
                                        at{" "}
                                        {new Date(deal.appointment.start_time).toLocaleTimeString("en-US", {
                                          hour: "numeric",
                                          minute: "2-digit",
                                        })}
                                      </p>
                                      {deal.appointment.location && (
                                        <p className="text-[9px] text-emerald-500">
                                          📍 {deal.appointment.location}
                                        </p>
                                      )}
                                    </div>
                                  )}
                                  {isUpdating ? (
                                    <p className="mt-0.5 text-[9px] text-slate-400">
                                      Updating stage…
                                    </p>
                                  ) : null}
                                </div>
                              );
                            })
                          )}
                          {hasMoreDeals && (
                            <button
                              type="button"
                              onClick={() => handleLoadMoreForStage(stage.id)}
                              className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-[10px] font-medium text-slate-600 hover:bg-slate-50"
                            >
                              Load more ({allStageDeals.length - stageDeals.length} remaining)
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
        </div>
      )}

      {/* Appointment Modal */}
      <AppointmentModal
        open={appointmentModalOpen}
        onClose={async () => {
          // Only revert deal stage on cancel if appointment wasn't successful
          if (!appointmentSuccessRef.current && appointmentDeal && appointmentPreviousStageId) {
            // Revert in UI
            setDeals((prev) =>
              prev.map((deal) =>
                deal.id === appointmentDeal.id
                  ? { ...deal, stage_id: appointmentPreviousStageId }
                  : deal
              )
            );
            // Revert in database
            try {
              await supabaseClient
                .from("deals")
                .update({ stage_id: appointmentPreviousStageId, updated_at: new Date().toISOString() })
                .eq("id", appointmentDeal.id);
            } catch (err) {
              console.error("Failed to revert deal stage:", err);
            }
          }
          setAppointmentModalOpen(false);
          setAppointmentDeal(null);
          setAppointmentPreviousStageId(null);
          setAppointmentTargetStageId(null);
          appointmentSuccessRef.current = false;
        }}
        onSuccess={() => {
          appointmentSuccessRef.current = true;
        }}
        onSubmit={async (data: AppointmentData) => {
          const response = await fetch("/api/appointments/create", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              patientId: data.patientId,
              dealId: data.dealId,
              providerId: data.providerId,
              title: data.title,
              appointmentDate: data.appointmentDate,
              durationMinutes: data.durationMinutes,
              location: data.location,
              notes: data.notes,
              sendPatientEmail: data.sendPatientEmail,
              sendUserEmail: data.sendUserEmail,
              scheduleReminder: data.scheduleReminder,
              appointmentType: data.appointmentType,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error || "Failed to create appointment");
          }
        }}
        patientId={appointmentDeal?.patient_id || ""}
        patientName={
          appointmentDeal?.patient
            ? [appointmentDeal.patient.first_name, appointmentDeal.patient.last_name]
                .filter(Boolean)
                .join(" ") || "Patient"
            : "Patient"
        }
        dealId={appointmentDeal?.id}
        dealTitle={appointmentDeal?.title}
        defaultType={
          appointmentTargetStageId
            ? dealStages.find((s) => s.id === appointmentTargetStageId)?.name.toLowerCase().includes("operation")
              ? "operation"
              : "appointment"
            : "appointment"
        }
      />
    </div>
  );
}
