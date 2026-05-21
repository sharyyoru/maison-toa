"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Campaign = {
  id: string;
  name: string;
  subject: string;
  status: string;
  total_recipients: number;
  total_sent: number;
  total_failed: number;
  total_opened: number;
  created_at: string;
  completed_at: string | null;
};

type SavedList = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-slate-100 text-slate-700",
  sending: "bg-amber-100 text-amber-800",
  sent: "bg-emerald-100 text-emerald-700",
  partial: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export default function MarketingHomePage() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [lists, setLists] = useState<SavedList[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const [campaignsRes, listsRes] = await Promise.all([
          fetch("/api/marketing/campaigns").then((r) => r.json()),
          fetch("/api/marketing/lists").then((r) => r.json()),
        ]);
        if (!isMounted) return;
        setCampaigns(campaignsRes.campaigns ?? []);
        setLists(listsRes.lists ?? []);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  async function handleDeleteList(id: string) {
    if (!confirm("Delete this list? Existing campaigns that reference it will still work.")) return;
    const resp = await fetch(`/api/marketing/lists/${id}`, { method: "DELETE" });
    if (resp.ok) {
      setLists((prev) => prev.filter((l) => l.id !== id));
    }
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing</h1>
          <p className="text-sm text-slate-500">Saved lists and campaign history.</p>
        </div>
        <Link
          href="/marketing/campaigns"
          className="rounded-full border border-sky-600 bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          + New campaign
        </Link>
      </div>

      {error && (
        <p className="mb-4 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
      )}

      {/* Saved Lists */}
      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Saved lists</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : lists.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-500">
              No saved lists yet. Create one from the{" "}
              <Link href="/marketing/campaigns" className="text-sky-600 underline">
                campaigns page
              </Link>
              .
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {lists.map((list) => (
              <div
                key={list.id}
                className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate font-semibold text-slate-900">{list.name}</h3>
                    {list.description && (
                      <p className="mt-1 text-xs text-slate-500">{list.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => handleDeleteList(list.id)}
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    title="Delete list"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                </div>
                <p className="mt-2 text-[10px] text-slate-400">
                  {new Date(list.created_at).toLocaleDateString()}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Campaign history */}
      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-900">Campaign history</h2>
        {loading ? (
          <p className="text-sm text-slate-400">Loading…</p>
        ) : campaigns.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-6 text-center">
            <p className="text-sm text-slate-500">No campaigns sent yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
            <table className="min-w-full divide-y divide-slate-100 text-sm">
              <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-2 text-left font-medium">Name</th>
                  <th className="px-4 py-2 text-left font-medium">Subject</th>
                  <th className="px-4 py-2 text-left font-medium">Status</th>
                  <th className="px-4 py-2 text-right font-medium">Recipients</th>
                  <th className="px-4 py-2 text-right font-medium">Sent</th>
                  <th className="px-4 py-2 text-right font-medium">Failed</th>
                  <th className="px-4 py-2 text-left font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {campaigns.map((c) => (
                  <tr key={c.id} className="hover:bg-slate-50">
                    <td className="px-4 py-2">
                      <Link href={`/marketing/campaigns/${c.id}`} className="font-medium text-sky-700 hover:underline">
                        {c.name}
                      </Link>
                    </td>
                    <td className="px-4 py-2 text-slate-700 truncate max-w-xs">{c.subject}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          STATUS_COLORS[c.status] || "bg-slate-100 text-slate-700"
                        }`}
                      >
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">{c.total_recipients}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-emerald-700">{c.total_sent}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-red-700">
                      {c.total_failed || ""}
                    </td>
                    <td className="px-4 py-2 text-xs text-slate-500">
                      {new Date(c.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
