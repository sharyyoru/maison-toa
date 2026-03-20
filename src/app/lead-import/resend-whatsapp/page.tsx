"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DealInput = {
  id: string;
  patient_id: string;
  title?: string;
  owner_id?: string;
  owner_name?: string;
};

type ResultItem = { dealId: string; status: string; error?: string };

type ResendResult = {
  ok: boolean;
  workflow: string;
  total: number;
  queued: number;
  skipped: number;
  failed: number;
  results: ResultItem[];
};

export default function ResendWhatsAppPage() {
  const router = useRouter();
  const [rawInput, setRawInput] = useState("");
  const [deals, setDeals] = useState<DealInput[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ResendResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleParse() {
    setParseError(null);
    setDeals([]);
    try {
      const trimmed = rawInput.trim();
      if (!trimmed) { setParseError("Please paste JSON data"); return; }
      let parsed: unknown;
      try { parsed = JSON.parse(trimmed); } catch { setParseError("Invalid JSON format."); return; }
      if (!Array.isArray(parsed)) parsed = [parsed];
      const dealList: DealInput[] = [];
      for (const item of parsed as Record<string, unknown>[]) {
        if (!item.id) { setParseError("Each deal must have an 'id' field"); return; }
        dealList.push({
          id: String(item.id),
          patient_id: String(item.patient_id || ""),
          title: item.title ? String(item.title) : undefined,
          owner_id: item.owner_id ? String(item.owner_id) : undefined,
          owner_name: item.owner_name ? String(item.owner_name) : undefined,
        });
      }
      if (dealList.length === 0) { setParseError("No deals found"); return; }
      setDeals(dealList);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : "Parse failed");
    }
  }

  function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result;
      if (typeof text === "string") setRawInput(text);
    };
    reader.readAsText(file);
  }

  async function handleResend() {
    if (deals.length === 0) return;
    setSending(true);
    setError(null);
    setResult(null);
    setProgress(0);
    try {
      const BATCH_SIZE = 50;
      let totalQueued = 0, totalSkipped = 0, totalFailed = 0;
      let allResults: ResultItem[] = [];
      let workflowName = "";
      for (let i = 0; i < deals.length; i += BATCH_SIZE) {
        const batch = deals.slice(i, i + BATCH_SIZE);
        const res = await fetch("/api/workflows/resend-whatsapp", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ deals: batch }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "API request failed");
        totalQueued += data.queued || 0;
        totalSkipped += data.skipped || 0;
        totalFailed += data.failed || 0;
        allResults = [...allResults, ...(data.results || [])];
        workflowName = data.workflow || "";
        setProgress(Math.round(((i + batch.length) / deals.length) * 100));
      }
      setResult({ ok: true, workflow: workflowName, total: deals.length, queued: totalQueued, skipped: totalSkipped, failed: totalFailed, results: allResults });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to resend");
    } finally {
      setSending(false);
    }
  }

  function reset() {
    setRawInput("");
    setDeals([]);
    setParseError(null);
    setResult(null);
    setError(null);
    setProgress(0);
  }

  const failedResults = result?.results.filter((r) => r.status === "failed") || [];
  const skippedResults = result?.results.filter((r) => r.status === "skipped") || [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Resend WhatsApp Messages</h1>
          <p className="mt-1 text-sm text-slate-600">
            Paste deal data (JSON) to re-trigger the WhatsApp workflow step for those deals
          </p>
        </div>
        <button onClick={() => router.push("/lead-import")} className="inline-flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Import
        </button>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <svg className="h-5 w-5 flex-shrink-0 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            <div>
              <h3 className="text-sm font-semibold text-red-900">Error</h3>
              <p className="mt-1 text-sm text-red-800">{error}</p>
            </div>
          </div>
        </div>
      )}

      {!result && !sending && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-900">Deal Data</h2>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                Upload JSON File
                <input type="file" accept=".json,.txt" onChange={handleFileUpload} className="sr-only" />
              </label>
            </div>
            <textarea
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={'Paste JSON array of deals here, e.g.:\n[\n  { "id": "deal-uuid-1", "patient_id": "patient-uuid-1", ... },\n  { "id": "deal-uuid-2", "patient_id": "patient-uuid-2", ... }\n]'}
              rows={12}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-sky-300 focus:ring-1 focus:ring-sky-300"
            />
            {parseError && (
              <p className="mt-2 text-sm text-red-600">{parseError}</p>
            )}
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                Required fields: <code className="rounded bg-slate-100 px-1">id</code>. The API will fetch deal &amp; patient data from the database.
              </p>
              <button onClick={handleParse} disabled={!rawInput.trim()} className="rounded-lg bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:opacity-50">
                Parse Deals
              </button>
            </div>
          </div>

          {deals.length > 0 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                <h2 className="mb-4 text-lg font-semibold text-slate-900">
                  Parsed {deals.length} Deal{deals.length !== 1 ? "s" : ""}
                </h2>
                <div className="max-h-80 overflow-y-auto rounded-lg border border-slate-100">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-slate-50">
                      <tr className="border-b border-slate-200">
                        <th className="px-3 py-2 text-left font-medium text-slate-600">#</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Deal ID</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Title</th>
                        <th className="px-3 py-2 text-left font-medium text-slate-600">Owner</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {deals.map((d, i) => (
                        <tr key={d.id} className="hover:bg-slate-50">
                          <td className="px-3 py-2 text-slate-500">{i + 1}</td>
                          <td className="px-3 py-2 font-mono text-slate-700">{d.id.slice(0, 8)}...</td>
                          <td className="px-3 py-2 text-slate-800">{d.title || "—"}</td>
                          <td className="px-3 py-2 text-slate-600">{d.owner_name || d.owner_id?.slice(0, 8) || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs text-amber-800">
                  <strong>Note:</strong> This will queue a WhatsApp message for each deal using the active workflow&apos;s message template.
                  Deals that already have a WhatsApp queue entry will be skipped.
                  The deal owner will be used as the WhatsApp sender.
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={reset} className="rounded-lg border border-slate-300 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                  Cancel
                </button>
                <button onClick={handleResend} className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-green-700">
                  <span className="inline-flex items-center gap-2">
                    <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" /></svg>
                    Resend WhatsApp ({deals.length})
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {sending && (
        <div className="rounded-xl border border-slate-200 bg-white p-12 text-center">
          <div className="mb-6 flex justify-center">
            <div className="h-16 w-16 animate-spin rounded-full border-4 border-green-200 border-t-green-600"></div>
          </div>
          <h2 className="mb-2 text-xl font-semibold text-slate-900">Sending WhatsApp Messages...</h2>
          <p className="mb-4 text-sm text-slate-600">Processing {deals.length} deals</p>
          <div className="mx-auto max-w-md">
            <div className="mb-2 flex justify-between text-xs text-slate-600">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200">
              <div className="h-3 rounded-full bg-green-600 transition-all duration-300" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="space-y-6">
          <div className="rounded-xl border border-emerald-200 bg-white p-8">
            <div className="mb-6 flex justify-center">
              <div className="rounded-full bg-emerald-100 p-4">
                <svg className="h-12 w-12 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
            </div>
            <h2 className="mb-2 text-center text-2xl font-bold text-slate-900">Resend Complete!</h2>
            <p className="mb-6 text-center text-sm text-slate-600">
              Workflow: <strong>{result.workflow}</strong>
            </p>
            <div className="mb-6 grid gap-4 md:grid-cols-3">
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-6 text-center">
                <div className="text-3xl font-bold text-emerald-900">{result.queued}</div>
                <div className="text-sm text-emerald-800">Queued</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center">
                <div className="text-3xl font-bold text-amber-900">{result.skipped}</div>
                <div className="text-sm text-amber-800">Skipped</div>
              </div>
              <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
                <div className="text-3xl font-bold text-red-900">{result.failed}</div>
                <div className="text-sm text-red-800">Failed</div>
              </div>
            </div>

            {skippedResults.length > 0 && (
              <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h3 className="mb-2 text-xs font-semibold text-amber-900">Skipped ({skippedResults.length})</h3>
                <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-amber-800">
                  {skippedResults.map((r) => (
                    <div key={r.dealId} className="flex justify-between">
                      <span className="font-mono">{r.dealId.slice(0, 12)}...</span>
                      <span>{r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {failedResults.length > 0 && (
              <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4">
                <h3 className="mb-2 text-xs font-semibold text-red-900">Failed ({failedResults.length})</h3>
                <div className="max-h-40 space-y-1 overflow-y-auto text-xs text-red-800">
                  {failedResults.map((r) => (
                    <div key={r.dealId} className="flex justify-between">
                      <span className="font-mono">{r.dealId.slice(0, 12)}...</span>
                      <span>{r.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-center gap-3">
              <button onClick={reset} className="rounded-lg border border-slate-300 bg-white px-6 py-2.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50">
                Resend More
              </button>
              <button onClick={() => router.push("/lead-import")} className="rounded-lg bg-sky-600 px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-sky-700">
                Back to Lead Import
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
