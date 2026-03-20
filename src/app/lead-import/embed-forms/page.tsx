"use client";

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";

interface EmbedLead {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  service: string | null;
  location: string | null;
  message: string | null;
  is_existing_patient: boolean;
  form_type: string;
  source_url: string | null;
  referrer: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  status: string;
  converted_to_patient_id: string | null;
  created_at: string;
}

const LOCATION_LABELS: Record<string, string> = {
  rhone: "Rhône",
  champel: "Champel",
  gstaad: "Gstaad",
  montreux: "Montreux",
};

const STATUS_OPTIONS = [
  { value: "all", label: "All Statuses" },
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "converted", label: "Converted" },
  { value: "closed", label: "Closed" },
];

const FORM_TYPE_OPTIONS = [
  { value: "all", label: "All Forms" },
  { value: "contact", label: "Contact Form" },
  { value: "booking", label: "Booking Form" },
];

export default function EmbedFormsPage() {
  const [leads, setLeads] = useState<EmbedLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [formTypeFilter, setFormTypeFilter] = useState("all");
  const [locationFilter, setLocationFilter] = useState("all");
  const [serviceFilter, setServiceFilter] = useState("all");
  const [utmSourceFilter, setUtmSourceFilter] = useState("all");
  const [dateRange, setDateRange] = useState<{ start: string; end: string }>({ start: "", end: "" });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    fetchLeads();
  }, []);

  async function fetchLeads() {
    setLoading(true);
    try {
      const { data, error: fetchError } = await supabaseClient
        .from("embed_form_leads")
        .select("*")
        .order("created_at", { ascending: false });

      if (fetchError) throw fetchError;
      setLeads(data || []);
    } catch (err) {
      console.error("Error fetching embed leads:", err);
      setError("Failed to load leads");
    } finally {
      setLoading(false);
    }
  }

  // Get unique values for filters
  const uniqueServices = useMemo(() => {
    const services = new Set(leads.map(l => l.service).filter(Boolean));
    return Array.from(services) as string[];
  }, [leads]);

  const uniqueLocations = useMemo(() => {
    const locations = new Set(leads.map(l => l.location).filter(Boolean));
    return Array.from(locations) as string[];
  }, [leads]);

  const uniqueUtmSources = useMemo(() => {
    const sources = new Set(leads.map(l => l.utm_source).filter(Boolean));
    return Array.from(sources) as string[];
  }, [leads]);

  // Filtered leads
  const filteredLeads = useMemo(() => {
    return leads.filter(lead => {
      // Search query
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        const matchesSearch = 
          lead.first_name.toLowerCase().includes(query) ||
          lead.last_name.toLowerCase().includes(query) ||
          lead.email.toLowerCase().includes(query) ||
          (lead.phone && lead.phone.includes(query)) ||
          (lead.service && lead.service.toLowerCase().includes(query)) ||
          (lead.message && lead.message.toLowerCase().includes(query));
        if (!matchesSearch) return false;
      }

      // Status filter
      if (statusFilter !== "all" && lead.status !== statusFilter) return false;

      // Form type filter
      if (formTypeFilter !== "all" && lead.form_type !== formTypeFilter) return false;

      // Location filter
      if (locationFilter !== "all" && lead.location !== locationFilter) return false;

      // Service filter
      if (serviceFilter !== "all" && lead.service !== serviceFilter) return false;

      // UTM Source filter
      if (utmSourceFilter !== "all" && lead.utm_source !== utmSourceFilter) return false;

      // Date range filter
      if (dateRange.start) {
        const leadDate = new Date(lead.created_at);
        const startDate = new Date(dateRange.start);
        if (leadDate < startDate) return false;
      }
      if (dateRange.end) {
        const leadDate = new Date(lead.created_at);
        const endDate = new Date(dateRange.end);
        endDate.setHours(23, 59, 59, 999);
        if (leadDate > endDate) return false;
      }

      return true;
    });
  }, [leads, searchQuery, statusFilter, formTypeFilter, locationFilter, serviceFilter, utmSourceFilter, dateRange]);

  // Paginated leads
  const paginatedLeads = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredLeads.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredLeads, currentPage]);

  const totalPages = Math.ceil(filteredLeads.length / itemsPerPage);

  // Stats
  const stats = useMemo(() => {
    const total = filteredLeads.length;
    const newLeads = filteredLeads.filter(l => l.status === "new").length;
    const converted = filteredLeads.filter(l => l.status === "converted" || l.converted_to_patient_id).length;
    const contactForms = filteredLeads.filter(l => l.form_type === "contact").length;
    const bookingForms = filteredLeads.filter(l => l.form_type === "booking").length;
    return { total, newLeads, converted, contactForms, bookingForms };
  }, [filteredLeads]);

  async function updateLeadStatus(leadId: string, newStatus: string) {
    try {
      const { error: updateError } = await supabaseClient
        .from("embed_form_leads")
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq("id", leadId);

      if (updateError) throw updateError;

      setLeads(prev => prev.map(l => l.id === leadId ? { ...l, status: newStatus } : l));
    } catch (err) {
      console.error("Error updating lead status:", err);
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function getStatusBadge(status: string) {
    const styles: Record<string, string> = {
      new: "bg-blue-100 text-blue-700",
      contacted: "bg-yellow-100 text-yellow-700",
      converted: "bg-green-100 text-green-700",
      closed: "bg-slate-100 text-slate-700",
    };
    return styles[status] || styles.new;
  }

  function clearFilters() {
    setSearchQuery("");
    setStatusFilter("all");
    setFormTypeFilter("all");
    setLocationFilter("all");
    setServiceFilter("all");
    setUtmSourceFilter("all");
    setDateRange({ start: "", end: "" });
    setCurrentPage(1);
  }

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900">Embed Form Leads</h1>
        <p className="text-slate-600 text-sm mt-1">
          Leads captured from embedded contact and booking forms
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Total Leads</p>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide">New</p>
          <p className="text-2xl font-bold text-blue-600">{stats.newLeads}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Converted</p>
          <p className="text-2xl font-bold text-green-600">{stats.converted}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Contact Forms</p>
          <p className="text-2xl font-bold text-orange-600">{stats.contactForms}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-xs text-slate-500 uppercase tracking-wide">Booking Forms</p>
          <p className="text-2xl font-bold text-purple-600">{stats.bookingForms}</p>
        </div>
      </div>

      {/* Embed URLs Section */}
      <div className="bg-slate-50 rounded-xl p-4 mb-6 border border-slate-200">
        <h3 className="font-medium text-slate-900 mb-3">Embed URLs</h3>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Contact Form</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}/embed/contact` : "/embed/contact"}
                className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/embed/contact`)}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800"
              >
                Copy
              </button>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Booking Form</label>
            <div className="flex items-center gap-2 mt-1">
              <input
                type="text"
                readOnly
                value={typeof window !== "undefined" ? `${window.location.origin}/embed/book` : "/embed/book"}
                className="flex-1 text-sm bg-white border border-slate-200 rounded-lg px-3 py-2"
              />
              <button
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/embed/book`)}
                className="px-3 py-2 bg-slate-900 text-white rounded-lg text-sm hover:bg-slate-800"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl p-4 mb-6 border border-slate-200 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium text-slate-900">Filters</h3>
          <button
            onClick={clearFilters}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Clear All
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Search */}
          <div className="col-span-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
              placeholder="Search name, email, phone..."
              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 focus:ring-1 focus:ring-sky-500 outline-none"
            />
          </div>

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          >
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Form Type */}
          <select
            value={formTypeFilter}
            onChange={(e) => { setFormTypeFilter(e.target.value); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          >
            {FORM_TYPE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Location */}
          <select
            value={locationFilter}
            onChange={(e) => { setLocationFilter(e.target.value); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          >
            <option value="all">All Locations</option>
            {uniqueLocations.map(loc => (
              <option key={loc} value={loc}>{LOCATION_LABELS[loc] || loc}</option>
            ))}
          </select>

          {/* Service */}
          <select
            value={serviceFilter}
            onChange={(e) => { setServiceFilter(e.target.value); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          >
            <option value="all">All Services</option>
            {uniqueServices.map(svc => (
              <option key={svc} value={svc}>{svc}</option>
            ))}
          </select>

          {/* UTM Source */}
          <select
            value={utmSourceFilter}
            onChange={(e) => { setUtmSourceFilter(e.target.value); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          >
            <option value="all">All Sources</option>
            {uniqueUtmSources.map(src => (
              <option key={src} value={src}>{src}</option>
            ))}
          </select>
        </div>

        {/* Date Range */}
        <div className="flex items-center gap-3 mt-3">
          <span className="text-sm text-slate-600">Date Range:</span>
          <input
            type="date"
            value={dateRange.start}
            onChange={(e) => { setDateRange(prev => ({ ...prev, start: e.target.value })); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          />
          <span className="text-slate-400">to</span>
          <input
            type="date"
            value={dateRange.end}
            onChange={(e) => { setDateRange(prev => ({ ...prev, end: e.target.value })); setCurrentPage(1); }}
            className="text-sm border border-slate-200 rounded-lg px-3 py-2 focus:border-sky-500 outline-none"
          />
        </div>
      </div>

      {/* Results count */}
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-600">
          Showing {paginatedLeads.length} of {filteredLeads.length} leads
        </p>
        <button
          onClick={fetchLeads}
          className="text-sm text-sky-600 hover:text-sky-700 flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl mb-4 text-red-700">
          {error}
        </div>
      )}

      {/* Leads Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Lead</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Contact</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Service</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Location</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Form</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Source</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Status</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Date</th>
                <th className="text-left py-3 px-4 font-medium text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedLeads.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-500">
                    No leads found matching your filters
                  </td>
                </tr>
              ) : (
                paginatedLeads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">
                        {lead.first_name} {lead.last_name}
                      </div>
                      {lead.is_existing_patient && (
                        <span className="text-xs text-green-600">Existing Patient</span>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <div className="text-slate-900">{lead.email}</div>
                      {lead.phone && <div className="text-slate-500 text-xs">{lead.phone}</div>}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {lead.service || "-"}
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {lead.location ? (LOCATION_LABELS[lead.location] || lead.location) : "-"}
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        lead.form_type === "contact" ? "bg-orange-100 text-orange-700" : "bg-purple-100 text-purple-700"
                      }`}>
                        {lead.form_type}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">
                      {lead.utm_source || (lead.referrer ? "Referrer" : "Direct")}
                      {lead.utm_campaign && (
                        <div className="text-xs text-slate-400">{lead.utm_campaign}</div>
                      )}
                    </td>
                    <td className="py-3 px-4">
                      <select
                        value={lead.status}
                        onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                        className={`text-xs font-medium rounded-full px-2 py-1 border-0 cursor-pointer ${getStatusBadge(lead.status)}`}
                      >
                        <option value="new">New</option>
                        <option value="contacted">Contacted</option>
                        <option value="converted">Converted</option>
                        <option value="closed">Closed</option>
                      </select>
                    </td>
                    <td className="py-3 px-4 text-slate-500 text-xs">
                      {formatDate(lead.created_at)}
                    </td>
                    <td className="py-3 px-4">
                      {lead.converted_to_patient_id ? (
                        <Link
                          href={`/patients/${lead.converted_to_patient_id}`}
                          className="text-sky-600 hover:text-sky-700 text-xs"
                        >
                          View Patient
                        </Link>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-slate-200 bg-slate-50">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="px-3 py-1 text-sm bg-white border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
            >
              Previous
            </button>
            <span className="text-sm text-slate-600">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-1 text-sm bg-white border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
