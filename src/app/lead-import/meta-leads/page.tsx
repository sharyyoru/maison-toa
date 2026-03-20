"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type MetaLead = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string;
  lifecycle_stage: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Extracted from notes
  ad_name?: string;
  campaign_name?: string;
  form_name?: string;
  service_interest?: string;
};

type SortField = "created_at" | "first_name" | "last_name" | "email";
type SortOrder = "asc" | "desc";

export default function MetaLeadsReportPage() {
  const router = useRouter();
  const [leads, setLeads] = useState<MetaLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Smart filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [adFilter, setAdFilter] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [lifecycleFilter, setLifecycleFilter] = useState("");

  // Sorting
  const [sortField, setSortField] = useState<SortField>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    loadMetaLeads();
  }, []);

  async function loadMetaLeads() {
    try {
      setLoading(true);
      setError(null);

      // Query patients with Facebook Lead Ads source or notes containing Facebook Lead
      const { data, error: fetchError } = await supabaseClient
        .from("patients")
        .select("*")
        .or("source.eq.meta,notes.ilike.%Facebook Lead%")
        .order("created_at", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      // Parse lead info from notes
      const parsedLeads: MetaLead[] = (data || []).map((patient) => {
        const leadInfo = extractLeadInfo(patient.notes);
        return {
          ...patient,
          ad_name: leadInfo.ad_name,
          campaign_name: leadInfo.campaign_name,
          form_name: leadInfo.form_name,
          service_interest: leadInfo.service_interest,
        };
      });

      setLeads(parsedLeads);
    } catch (err) {
      console.error("Error loading Meta leads:", err);
      setError(err instanceof Error ? err.message : "Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  function extractLeadInfo(notes: string | null): {
    ad_name?: string;
    campaign_name?: string;
    form_name?: string;
    service_interest?: string;
  } {
    if (!notes) return {};

    try {
      // Find JSON block in notes
      const jsonMatch = notes.match(/\[Facebook Lead\]\s*(\{[\s\S]*?\})/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[1]);
        return {
          ad_name: parsed.ad_name || undefined,
          campaign_name: parsed.campaign_name || undefined,
          form_name: parsed.form_name || undefined,
          service_interest: parsed.service_interest || undefined,
        };
      }
    } catch {
      // Fallback to regex extraction
      const adMatch = notes.match(/"ad_name":\s*"([^"]+)"/);
      const campaignMatch = notes.match(/"campaign_name":\s*"([^"]+)"/);
      const formMatch = notes.match(/"form_name":\s*"([^"]+)"/);
      const serviceMatch = notes.match(/"service_interest":\s*"([^"]+)"/);

      return {
        ad_name: adMatch?.[1],
        campaign_name: campaignMatch?.[1],
        form_name: formMatch?.[1],
        service_interest: serviceMatch?.[1],
      };
    }

    return {};
  }

  // Extract unique values for filter dropdowns
  const uniqueCampaigns = useMemo(() => {
    const campaigns = leads
      .map((l) => l.campaign_name)
      .filter((c): c is string => !!c);
    return Array.from(new Set(campaigns)).sort();
  }, [leads]);

  const uniqueAds = useMemo(() => {
    const ads = leads.map((l) => l.ad_name).filter((a): a is string => !!a);
    return Array.from(new Set(ads)).sort();
  }, [leads]);

  const uniqueServices = useMemo(() => {
    const services = leads
      .map((l) => l.service_interest)
      .filter((s): s is string => !!s);
    return Array.from(new Set(services)).sort();
  }, [leads]);

  const uniqueLifecycles = useMemo(() => {
    const lifecycles = leads
      .map((l) => l.lifecycle_stage)
      .filter((l): l is string => !!l);
    return Array.from(new Set(lifecycles)).sort();
  }, [leads]);

  // Apply filters and sorting
  const filteredLeads = useMemo(() => {
    let result = [...leads];

    // Search filter (name, email, phone)
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      result = result.filter(
        (lead) =>
          lead.first_name?.toLowerCase().includes(query) ||
          lead.last_name?.toLowerCase().includes(query) ||
          lead.email?.toLowerCase().includes(query) ||
          lead.phone?.includes(query)
      );
    }

    // Date filters
    if (dateFrom) {
      const fromDate = new Date(dateFrom);
      result = result.filter((lead) => new Date(lead.created_at) >= fromDate);
    }
    if (dateTo) {
      const toDate = new Date(dateTo);
      toDate.setHours(23, 59, 59, 999);
      result = result.filter((lead) => new Date(lead.created_at) <= toDate);
    }

    // Campaign filter
    if (campaignFilter) {
      result = result.filter((lead) => lead.campaign_name === campaignFilter);
    }

    // Ad filter
    if (adFilter) {
      result = result.filter((lead) => lead.ad_name === adFilter);
    }

    // Service filter
    if (serviceFilter) {
      result = result.filter((lead) => lead.service_interest === serviceFilter);
    }

    // Lifecycle filter
    if (lifecycleFilter) {
      result = result.filter((lead) => lead.lifecycle_stage === lifecycleFilter);
    }

    // Sorting
    result.sort((a, b) => {
      let comparison = 0;
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (sortField === "created_at") {
        comparison =
          new Date(aVal || 0).getTime() - new Date(bVal || 0).getTime();
      } else {
        comparison = (aVal || "").toString().localeCompare((bVal || "").toString());
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return result;
  }, [
    leads,
    searchQuery,
    dateFrom,
    dateTo,
    campaignFilter,
    adFilter,
    serviceFilter,
    lifecycleFilter,
    sortField,
    sortOrder,
  ]);

  // Pagination
  const totalPages = Math.ceil(filteredLeads.length / pageSize);
  const paginatedLeads = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredLeads.slice(start, start + pageSize);
  }, [filteredLeads, currentPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, dateFrom, dateTo, campaignFilter, adFilter, serviceFilter, lifecycleFilter]);

  // Stats
  const stats = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);
    const thisMonth = new Date(today);
    thisMonth.setMonth(thisMonth.getMonth() - 1);

    return {
      total: leads.length,
      today: leads.filter((l) => new Date(l.created_at) >= today).length,
      thisWeek: leads.filter((l) => new Date(l.created_at) >= thisWeek).length,
      thisMonth: leads.filter((l) => new Date(l.created_at) >= thisMonth).length,
    };
  }, [leads]);

  function clearFilters() {
    setSearchQuery("");
    setDateFrom("");
    setDateTo("");
    setCampaignFilter("");
    setAdFilter("");
    setServiceFilter("");
    setLifecycleFilter("");
  }

  function handleSort(field: SortField) {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  }

  function getSortIcon(field: SortField) {
    if (sortField !== field) return "↕";
    return sortOrder === "asc" ? "↑" : "↓";
  }

  function exportToCSV() {
    const headers = [
      "First Name",
      "Last Name",
      "Email",
      "Phone",
      "Service Interest",
      "Campaign",
      "Ad",
      "Form",
      "Lifecycle Stage",
      "Created At",
    ];

    const rows = filteredLeads.map((lead) => [
      lead.first_name,
      lead.last_name,
      lead.email || "",
      lead.phone || "",
      lead.service_interest || "",
      lead.campaign_name || "",
      lead.ad_name || "",
      lead.form_name || "",
      lead.lifecycle_stage || "",
      new Date(lead.created_at).toLocaleString(),
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map((row) =>
        row.map((cell) => `"${(cell || "").replace(/"/g, '""')}"`).join(",")
      ),
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `meta-leads-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto max-w-7xl">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Meta & Zapier Leads Report
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            All leads imported via Facebook Lead Ads and Zapier integration
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={exportToCSV}
            disabled={filteredLeads.length === 0}
            className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
              />
            </svg>
            Export CSV
          </button>
          <button
            onClick={() => loadMetaLeads()}
            className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
              <svg
                className="h-5 w-5 text-blue-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
              <div className="text-xs text-slate-600">Total Leads</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
              <svg
                className="h-5 w-5 text-emerald-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-emerald-900">{stats.today}</div>
              <div className="text-xs text-emerald-800">Today</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
              <svg
                className="h-5 w-5 text-amber-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-900">{stats.thisWeek}</div>
              <div className="text-xs text-amber-800">This Week</div>
            </div>
          </div>
        </div>
        <div className="rounded-xl border border-purple-200 bg-purple-50 p-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-purple-100">
              <svg
                className="h-5 w-5 text-purple-600"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
            </div>
            <div>
              <div className="text-2xl font-bold text-purple-900">{stats.thisMonth}</div>
              <div className="text-xs text-purple-800">This Month</div>
            </div>
          </div>
        </div>
      </div>

      {/* Smart Filters */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Smart Filters</h2>
          <button
            onClick={clearFilters}
            className="text-xs font-medium text-sky-600 hover:text-sky-700"
          >
            Clear All
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          {/* Search */}
          <div className="md:col-span-2">
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Search
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Name, email, or phone..."
                className="block w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
              />
              <svg
                className="absolute left-3 top-2.5 h-4 w-4 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </div>
          </div>

          {/* Date From */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              From Date
            </label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              To Date
            </label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {/* Campaign Filter */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Campaign
            </label>
            <select
              value={campaignFilter}
              onChange={(e) => setCampaignFilter(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Campaigns</option>
              {uniqueCampaigns.map((campaign) => (
                <option key={campaign} value={campaign}>
                  {campaign}
                </option>
              ))}
            </select>
          </div>

          {/* Ad Filter */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Ad Name
            </label>
            <select
              value={adFilter}
              onChange={(e) => setAdFilter(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Ads</option>
              {uniqueAds.map((ad) => (
                <option key={ad} value={ad}>
                  {ad}
                </option>
              ))}
            </select>
          </div>

          {/* Service Filter */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Service Interest
            </label>
            <select
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Services</option>
              {uniqueServices.map((service) => (
                <option key={service} value={service}>
                  {service}
                </option>
              ))}
            </select>
          </div>

          {/* Lifecycle Filter */}
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Lifecycle Stage
            </label>
            <select
              value={lifecycleFilter}
              onChange={(e) => setLifecycleFilter(e.target.value)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            >
              <option value="">All Stages</option>
              {uniqueLifecycles.map((lifecycle) => (
                <option key={lifecycle} value={lifecycle}>
                  {lifecycle}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-600">
          Showing {paginatedLeads.length} of {filteredLeads.length} leads
          {filteredLeads.length !== leads.length && ` (filtered from ${leads.length})`}
        </p>
      </div>

      {/* Leads Table */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600"></div>
          </div>
          <p className="text-sm text-slate-600">Loading Meta leads...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 shadow-sm">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-slate-100 p-4">
              <svg
                className="h-12 w-12 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">No Leads Found</h3>
          <p className="text-sm text-slate-600">
            {leads.length === 0
              ? "No Meta/Zapier leads have been imported yet."
              : "No leads match your current filters."}
          </p>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                      onClick={() => handleSort("first_name")}
                    >
                      Name {getSortIcon("first_name")}
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                      onClick={() => handleSort("email")}
                    >
                      Contact {getSortIcon("email")}
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Service Interest
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Campaign / Ad
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Stage
                    </th>
                    <th
                      className="cursor-pointer px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 hover:bg-slate-100"
                      onClick={() => handleSort("created_at")}
                    >
                      Created {getSortIcon("created_at")}
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-600">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {paginatedLeads.map((lead) => (
                    <tr key={lead.id} className="hover:bg-slate-50">
                      <td className="whitespace-nowrap px-4 py-3">
                        <div className="font-medium text-slate-900">
                          {lead.first_name} {lead.last_name}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        {lead.email && (
                          <div className="text-sm text-slate-600">{lead.email}</div>
                        )}
                        {lead.phone && (
                          <div className="text-sm text-slate-500">{lead.phone}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.service_interest && (
                          <span className="inline-flex rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                            {lead.service_interest}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.campaign_name && (
                          <div className="text-sm text-slate-600">
                            {lead.campaign_name}
                          </div>
                        )}
                        {lead.ad_name && (
                          <div className="text-xs text-slate-400">{lead.ad_name}</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {lead.lifecycle_stage && (
                          <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            {lead.lifecycle_stage}
                          </span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-sm text-slate-600">
                        {new Date(lead.created_at).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          onClick={() => router.push(`/patients/${lead.id}`)}
                          className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100"
                        >
                          <svg
                            className="h-3 w-3"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                            />
                          </svg>
                          View
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-between">
              <p className="text-sm text-slate-600">
                Page {currentPage} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                  disabled={currentPage === 1}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                  disabled={currentPage === totalPages}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
