"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type ImportRecord = {
  id: string;
  filename: string;
  service: string;
  total_leads: number;
  imported_count: number;
  failed_count: number;
  imported_patient_ids: string[];
  errors: string[] | null;
  import_date: string;
  created_at: string;
};

export default function LeadImportHistoryPage() {
  const router = useRouter();
  const [imports, setImports] = useState<ImportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [serviceFilter, setServiceFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "success" | "partial" | "failed">("all");
  const [sortBy, setSortBy] = useState<"date" | "filename" | "count">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    loadImportHistory();
  }, []);

  async function loadImportHistory() {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabaseClient
        .from("lead_imports")
        .select("*")
        .order("import_date", { ascending: false });

      if (fetchError) {
        throw fetchError;
      }

      setImports((data as ImportRecord[]) || []);
    } catch (err) {
      console.error("Error loading import history:", err);
      setError(err instanceof Error ? err.message : "Failed to load import history");
    } finally {
      setLoading(false);
    }
  }

  // Apply filters and sorting
  const filteredImports = imports
    .filter((imp) => {
      // Search filter
      if (searchQuery) {
        const query = searchQuery.toLowerCase();
        if (!imp.filename.toLowerCase().includes(query) && 
            !imp.service.toLowerCase().includes(query)) {
          return false;
        }
      }

      // Service filter
      if (serviceFilter && imp.service !== serviceFilter) {
        return false;
      }

      // Status filter
      if (statusFilter !== "all") {
        const hasErrors = imp.failed_count > 0;
        const allFailed = imp.imported_count === 0;
        
        if (statusFilter === "success" && hasErrors) return false;
        if (statusFilter === "partial" && (!hasErrors || allFailed)) return false;
        if (statusFilter === "failed" && !allFailed) return false;
      }

      return true;
    })
    .sort((a, b) => {
      let comparison = 0;

      if (sortBy === "date") {
        comparison = new Date(a.import_date).getTime() - new Date(b.import_date).getTime();
      } else if (sortBy === "filename") {
        comparison = a.filename.localeCompare(b.filename);
      } else if (sortBy === "count") {
        comparison = a.imported_count - b.imported_count;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

  const uniqueServices = Array.from(new Set(imports.map(imp => imp.service))).sort();

  const totalImported = imports.reduce((sum, imp) => sum + imp.imported_count, 0);
  const totalFailed = imports.reduce((sum, imp) => sum + imp.failed_count, 0);

  function getStatusBadge(imp: ImportRecord) {
    const allSuccess = imp.failed_count === 0;
    const allFailed = imp.imported_count === 0;
    
    if (allSuccess) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          Success
        </span>
      );
    } else if (allFailed) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
          Failed
        </span>
      );
    } else {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          Partial
        </span>
      );
    }
  }

  async function viewImportedPatients(importRecord: ImportRecord) {
    if (!importRecord.imported_patient_ids || importRecord.imported_patient_ids.length === 0) {
      alert("No patients to view");
      return;
    }

    // Navigate to patients page with filter (you may need to implement this filter)
    router.push(`/patients?import_id=${importRecord.id}`);
  }

  return (
    <div className="mx-auto max-w-7xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Lead Import History</h1>
          <p className="mt-1 text-sm text-slate-600">
            View all CSV imports and their results
          </p>
        </div>
        <button
          onClick={() => router.push("/lead-import")}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          New Import
        </button>
      </div>

      {/* Statistics */}
      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="text-2xl font-bold text-slate-900">{imports.length}</div>
          <div className="text-xs text-slate-600">Total Imports</div>
        </div>
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
          <div className="text-2xl font-bold text-emerald-900">{totalImported}</div>
          <div className="text-xs text-emerald-800">Total Imported</div>
        </div>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="text-2xl font-bold text-red-900">{totalFailed}</div>
          <div className="text-xs text-red-800">Total Failed</div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="text-2xl font-bold text-blue-900">{uniqueServices.length}</div>
          <div className="text-xs text-blue-800">Unique Services</div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6">
        <h2 className="mb-4 text-sm font-semibold text-slate-900">Filters</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Search
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filename or service..."
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Service
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

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
            >
              <option value="all">All Status</option>
              <option value="success">Success Only</option>
              <option value="partial">Partial Success</option>
              <option value="failed">Failed Only</option>
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">
              Sort By
            </label>
            <div className="flex gap-2">
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:border-sky-500 focus:ring-2 focus:ring-sky-500"
              >
                <option value="date">Date</option>
                <option value="filename">Filename</option>
                <option value="count">Count</option>
              </select>
              <button
                onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm hover:bg-slate-50"
              >
                {sortOrder === "asc" ? "↑" : "↓"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Import List */}
      {loading ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 flex justify-center">
            <div className="h-12 w-12 animate-spin rounded-full border-4 border-sky-200 border-t-sky-600"></div>
          </div>
          <p className="text-sm text-slate-600">Loading import history...</p>
        </div>
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      ) : filteredImports.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-4 flex justify-center">
            <div className="rounded-full bg-slate-100 p-4">
              <svg className="h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
          </div>
          <h3 className="mb-2 text-lg font-semibold text-slate-900">No Imports Found</h3>
          <p className="mb-6 text-sm text-slate-600">
            {imports.length === 0 ? "No imports yet. Upload your first CSV file to get started." : "No imports match your filters."}
          </p>
          {imports.length === 0 && (
            <button
              onClick={() => router.push("/lead-import")}
              className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
            >
              Import Leads
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredImports.map((imp) => (
            <div key={imp.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="mb-2 flex items-center gap-3">
                    <h3 className="text-sm font-semibold text-slate-900">{imp.filename}</h3>
                    {getStatusBadge(imp)}
                    <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                      {imp.service}
                    </span>
                  </div>
                  
                  <div className="mb-3 grid gap-4 text-xs text-slate-600 md:grid-cols-4">
                    <div>
                      <span className="font-medium">Date:</span>{" "}
                      {new Date(imp.import_date).toLocaleString("en-US", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </div>
                    <div>
                      <span className="font-medium">Total Leads:</span> {imp.total_leads}
                    </div>
                    <div className="text-emerald-700">
                      <span className="font-medium">Imported:</span> {imp.imported_count}
                    </div>
                    {imp.failed_count > 0 && (
                      <div className="text-red-700">
                        <span className="font-medium">Failed:</span> {imp.failed_count}
                      </div>
                    )}
                  </div>

                  {imp.errors && imp.errors.length > 0 && (
                    <details className="rounded-lg bg-red-50 p-3">
                      <summary className="cursor-pointer text-xs font-medium text-red-900">
                        View Errors ({imp.errors.length})
                      </summary>
                      <div className="mt-2 space-y-1 text-xs text-red-800">
                        {imp.errors.slice(0, 5).map((err, idx) => (
                          <div key={idx}>• {err}</div>
                        ))}
                        {imp.errors.length > 5 && (
                          <div className="text-red-700">...and {imp.errors.length - 5} more</div>
                        )}
                      </div>
                    </details>
                  )}
                </div>

                <div className="ml-4 flex flex-col gap-2">
                  {imp.imported_patient_ids && imp.imported_patient_ids.length > 0 && (
                    <button
                      onClick={() => viewImportedPatients(imp)}
                      className="inline-flex items-center gap-1 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-800 hover:bg-sky-100"
                    >
                      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                      </svg>
                      View Patients ({imp.imported_patient_ids.length})
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
