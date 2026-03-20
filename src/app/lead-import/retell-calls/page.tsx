"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type RetellLead = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  source: string | null;
  notes: string | null;
  created_at: string;
};

export default function RetellCallsPage() {
  const [leads, setLeads] = useState<RetellLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadRetellLeads() {
      try {
        setLoading(true);
        const { data, error } = await supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone, source, notes, created_at")
          .eq("source", "Retell AI Agent")
          .order("created_at", { ascending: false })
          .limit(100);

        if (error) {
          setError(error.message);
        } else {
          setLeads(data || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    loadRetellLeads();
  }, []);

  const webhookUrl = typeof window !== "undefined" 
    ? `${window.location.origin}/api/webhooks/retell-agent`
    : "/api/webhooks/retell-agent";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50/80 via-white to-sky-50/60 p-4 sm:p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
            Retell AI Calls
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Leads generated from Retell AI Agent phone calls
          </p>
        </div>

        {/* Webhook Setup Instructions */}
        <div className="mb-6 rounded-xl border border-sky-200 bg-sky-50/50 p-4">
          <h2 className="mb-2 text-sm font-semibold text-sky-900">
            Webhook Setup
          </h2>
          <p className="mb-3 text-xs text-sky-700">
            Configure your Retell AI Agent to send webhooks to this URL:
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg bg-white px-3 py-2 text-xs font-mono text-slate-800 border border-sky-200">
              {webhookUrl}
            </code>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(webhookUrl);
              }}
              className="rounded-lg bg-sky-500 px-3 py-2 text-xs font-medium text-white hover:bg-sky-600"
            >
              Copy
            </button>
          </div>
          <p className="mt-2 text-xs text-sky-600">
            The webhook will automatically create contacts in the &quot;Request for Information&quot; stage when calls end.
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center py-12">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
          </div>
        )}

        {/* Leads Table */}
        {!loading && leads.length === 0 && (
          <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
              <svg
                className="h-6 w-6 text-slate-400"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-slate-900">No Retell calls yet</h3>
            <p className="mt-1 text-xs text-slate-500">
              Configure the webhook in your Retell AI dashboard to start receiving calls.
            </p>
          </div>
        )}

        {!loading && leads.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600">
                    Received
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.map((lead) => (
                  <tr key={lead.id} className="hover:bg-slate-50/50">
                    <td className="px-4 py-3 text-sm text-slate-900">
                      {lead.first_name} {lead.last_name}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {lead.phone || "-"}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600">
                      {lead.email || "-"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">
                      {new Date(lead.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
