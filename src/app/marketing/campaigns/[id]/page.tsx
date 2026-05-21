"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
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
  html_snapshot: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
};

type Recipient = {
  id: string;
  patient_id: string | null;
  email: string;
  status: string;
  error: string | null;
  sent_at: string | null;
  opened_at: string | null;
  email_id: string | null;
};

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-slate-100 text-slate-700",
  sent: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  skipped: "bg-amber-100 text-amber-700",
  opened: "bg-sky-100 text-sky-700",
};

export default function CampaignDetailPage() {
  const params = useParams();
  const id = params?.id as string;
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");

  useEffect(() => {
    if (!id) return;
    let isMounted = true;
    (async () => {
      try {
        const resp = await fetch(`/api/marketing/campaigns/${id}`);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.error || "Failed to load");
        if (!isMounted) return;
        setCampaign(data.campaign);
        setRecipients(data.recipients ?? []);
      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load");
      } finally {
        if (isMounted) setLoading(false);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, [id]);

  const filteredRecipients =
    statusFilter === "all" ? recipients : recipients.filter((r) => r.status === statusFilter);

  if (loading) {
    return <main className="mx-auto max-w-7xl p-6">Loading…</main>;
  }
  if (error || !campaign) {
    return (
      <main className="mx-auto max-w-7xl p-6">
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error || "Campaign not found"}</p>
        <Link href="/marketing" className="mt-3 inline-block text-sky-600 hover:underline">← Back</Link>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-4">
        <Link href="/marketing" className="text-xs text-sky-600 hover:underline">← Back to marketing</Link>
      </div>

      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">{campaign.name}</h1>
          <p className="text-sm text-slate-600">{campaign.subject}</p>
          <p className="mt-1 text-xs text-slate-400">
            Sent {new Date(campaign.created_at).toLocaleString()}
            {campaign.completed_at && ` · completed ${new Date(campaign.completed_at).toLocaleString()}`}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            STATUS_COLORS[campaign.status] || "bg-slate-100 text-slate-700"
          }`}
        >
          {campaign.status}
        </span>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-slate-900">{campaign.total_recipients}</p>
          <p className="text-xs text-slate-500">Recipients</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-emerald-700">{campaign.total_sent}</p>
          <p className="text-xs text-slate-500">Delivered</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-red-700">{campaign.total_failed}</p>
          <p className="text-xs text-slate-500">Failed</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-2xl font-bold text-sky-700">{campaign.total_opened}</p>
          <p className="text-xs text-slate-500">Opened</p>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-medium text-slate-600">Filter:</span>
        {["all", "sent", "failed", "pending", "skipped"].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs ${
              statusFilter === s
                ? "bg-slate-900 text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left font-medium">Email</th>
              <th className="px-4 py-2 text-left font-medium">Status</th>
              <th className="px-4 py-2 text-left font-medium">Sent at</th>
              <th className="px-4 py-2 text-left font-medium">Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredRecipients.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td className="px-4 py-2 text-slate-700">
                  {r.patient_id ? (
                    <Link href={`/patients/${r.patient_id}`} className="text-sky-700 hover:underline">
                      {r.email}
                    </Link>
                  ) : (
                    r.email
                  )}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      STATUS_COLORS[r.status] || "bg-slate-100 text-slate-700"
                    }`}
                  >
                    {r.status}
                  </span>
                </td>
                <td className="px-4 py-2 text-xs text-slate-500">
                  {r.sent_at ? new Date(r.sent_at).toLocaleString() : "—"}
                </td>
                <td className="px-4 py-2 text-xs text-red-700 truncate max-w-xs">
                  {r.error || ""}
                </td>
              </tr>
            ))}
            {filteredRecipients.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400">
                  No recipients match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
