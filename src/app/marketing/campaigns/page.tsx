"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import type { MarketingFilter, PatientRow } from "@/lib/marketingFilters";

type EmailTemplate = {
  id: string;
  name: string;
  subject_template: string;
  html_content: string | null;
  body_template: string | null;
};

type DealStage = {
  id: string;
  name: string;
};

type SavedList = {
  id: string;
  name: string;
  description: string | null;
  filter: MarketingFilter;
  created_at: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function MarketingCampaignsPage() {
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [stages, setStages] = useState<DealStage[]>([]);
  const [ownerNames, setOwnerNames] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [savedLists, setSavedLists] = useState<SavedList[]>([]);

  // Audience filter state
  const [filter, setFilter] = useState<MarketingFilter>({
    requireEmail: true,
    excludeOptOut: true,
    hasDeal: "any",
    ownerNames: [],
    dealStageIds: [],
    sources: [],
    createdAfter: null,
    createdBefore: null,
    dobMonth: null,
    search: "",
  });

  // Campaign state
  const [campaignName, setCampaignName] = useState("");
  const [templateId, setTemplateId] = useState<string>("");
  const [subjectOverride, setSubjectOverride] = useState("");
  const [userId, setUserId] = useState<string | null>(null);

  // Preview state
  const [previewCount, setPreviewCount] = useState(0);
  const [previewSample, setPreviewSample] = useState<PatientRow[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Send state
  const [testEmail, setTestEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [testSending, setTestSending] = useState(false);
  const [sendResult, setSendResult] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  // Save list state
  const [saveListName, setSaveListName] = useState("");
  const [savingList, setSavingList] = useState(false);

  // Load templates, stages, owners, sources, user, saved lists
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        const { data: authData } = await supabaseClient.auth.getUser();
        const user = authData?.user;
        if (isMounted && user) {
          setUserId(user.id);
          setTestEmail(user.email ?? "");
        }

        const [templatesRes, stagesRes, patientsRes, listsRes] = await Promise.all([
          supabaseClient
            .from("email_templates")
            .select("id, name, subject_template, html_content, body_template")
            .order("created_at", { ascending: false }),
          supabaseClient
            .from("deal_stages")
            .select("id, name, sort_order")
            .order("sort_order"),
          // Distinct owner/source values — fetch a sample since there's no DISTINCT API
          supabaseClient
            .from("patients")
            .select("contact_owner_name, source")
            .limit(2000),
          fetch("/api/marketing/lists").then((r) => r.json()).catch(() => ({ lists: [] })),
        ]);

        if (!isMounted) return;

        setTemplates((templatesRes.data as EmailTemplate[]) ?? []);
        setStages((stagesRes.data as DealStage[]) ?? []);
        setSavedLists((listsRes?.lists as SavedList[]) ?? []);

        const ownerSet = new Set<string>();
        const sourceSet = new Set<string>();
        (patientsRes.data ?? []).forEach((p: { contact_owner_name: string | null; source: string | null }) => {
          if (p.contact_owner_name) ownerSet.add(p.contact_owner_name);
          if (p.source) sourceSet.add(p.source);
        });
        setOwnerNames(Array.from(ownerSet).sort());
        setSources(Array.from(sourceSet).sort());
      } catch (err) {
        console.error("Failed to load marketing page data:", err);
      }
    })();
    return () => {
      isMounted = false;
    };
  }, []);

  // Debounced preview
  useEffect(() => {
    const handle = setTimeout(() => {
      runPreview();
    }, 400);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(filter)]);

  async function runPreview() {
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const resp = await fetch("/api/marketing/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filter, sampleSize: 10 }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Preview failed");
      setPreviewCount(data.count);
      setPreviewSample(data.sample ?? []);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Preview failed");
      setPreviewCount(0);
      setPreviewSample([]);
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleSendTest() {
    if (!templateId) {
      setSendError("Pick a template first");
      return;
    }
    if (!testEmail.trim()) {
      setSendError("Enter a test email address");
      return;
    }
    try {
      setTestSending(true);
      setSendError(null);
      setSendResult(null);
      const resp = await fetch("/api/marketing/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateId,
          subject: subjectOverride || undefined,
          filter,
          testEmail: testEmail.trim(),
          userId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Test send failed");
      setSendResult(`Test sent to ${testEmail}`);
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Test send failed");
    } finally {
      setTestSending(false);
    }
  }

  async function handleSendCampaign() {
    if (!templateId) {
      setSendError("Pick a template first");
      return;
    }
    if (previewCount === 0) {
      setSendError("No recipients match this filter");
      return;
    }
    const name = campaignName.trim() || `Campaign ${new Date().toISOString().slice(0, 10)}`;
    const confirmed = window.confirm(
      `Send this email to ${previewCount} recipient${previewCount === 1 ? "" : "s"}?\n\nCampaign: ${name}\n\nThis cannot be undone.`,
    );
    if (!confirmed) return;

    try {
      setSending(true);
      setSendError(null);
      setSendResult(null);
      const resp = await fetch("/api/marketing/campaigns/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          campaignName: name,
          templateId,
          subject: subjectOverride || undefined,
          filter,
          userId,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Send failed");
      const failMsg = data.firstError ? ` — first error: ${data.firstError}` : "";
      setSendResult(
        `Campaign ${data.status} — ${data.sent} delivered${data.failed ? `, ${data.failed} failed` : ""}.${failMsg}`,
      );
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function handleSaveList() {
    const name = saveListName.trim();
    if (!name) return;
    try {
      setSavingList(true);
      const resp = await fetch("/api/marketing/lists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, filter, userId }),
      });
      const data = await resp.json();
      if (!resp.ok) throw new Error(data.error || "Failed to save");
      setSavedLists((prev) => [data.list, ...prev]);
      setSaveListName("");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to save list");
    } finally {
      setSavingList(false);
    }
  }

  function applyList(list: SavedList) {
    setFilter({
      requireEmail: true,
      excludeOptOut: true,
      hasDeal: "any",
      ownerNames: [],
      dealStageIds: [],
      sources: [],
      createdAfter: null,
      createdBefore: null,
      dobMonth: null,
      search: "",
      ...list.filter,
    });
  }

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId],
  );

  function toggleInArray<T>(arr: T[] | undefined, value: T): T[] {
    const safe = arr ?? [];
    return safe.includes(value) ? safe.filter((v) => v !== value) : [...safe, value];
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Marketing Campaigns</h1>
          <p className="text-sm text-slate-500">
            Build an audience by filter, preview recipients, pick a template, and send.
          </p>
        </div>
        <Link
          href="/marketing"
          className="rounded-full border border-slate-300 bg-white px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
        >
          View history
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* LEFT: Filter builder */}
        <section className="lg:col-span-2 space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Audience filter</h2>

            {savedLists.length > 0 && (
              <div className="mb-4">
                <label className="text-xs font-medium text-slate-600">Load a saved list</label>
                <div className="mt-1 flex flex-wrap gap-2">
                  {savedLists.slice(0, 8).map((list) => (
                    <button
                      key={list.id}
                      type="button"
                      onClick={() => applyList(list)}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs text-slate-700 hover:bg-sky-50 hover:border-sky-300"
                    >
                      {list.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-medium text-slate-600">Search (name, email, phone)</span>
                <input
                  type="text"
                  value={filter.search ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, search: e.target.value }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Has a deal?</span>
                <select
                  value={filter.hasDeal ?? "any"}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, hasDeal: e.target.value as MarketingFilter["hasDeal"] }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="any">Any (all patients)</option>
                  <option value="has">Only patients with a deal</option>
                  <option value="none">Only patients WITHOUT a deal</option>
                </select>
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Created on or after</span>
                <input
                  type="date"
                  value={filter.createdAfter ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, createdAfter: e.target.value || null }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Created before</span>
                <input
                  type="date"
                  value={filter.createdBefore ?? ""}
                  onChange={(e) => setFilter((f) => ({ ...f, createdBefore: e.target.value || null }))}
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Birthday month</span>
                <select
                  value={filter.dobMonth ?? ""}
                  onChange={(e) =>
                    setFilter((f) => ({ ...f, dobMonth: e.target.value ? parseInt(e.target.value, 10) : null }))
                  }
                  className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Any</option>
                  {MONTHS.map((m, i) => (
                    <option key={m} value={i + 1}>{m}</option>
                  ))}
                </select>
              </label>

              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={filter.requireEmail ?? true}
                    onChange={(e) => setFilter((f) => ({ ...f, requireEmail: e.target.checked }))}
                  />
                  Requires email
                </label>
                <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                  <input
                    type="checkbox"
                    checked={filter.excludeOptOut ?? true}
                    onChange={(e) => setFilter((f) => ({ ...f, excludeOptOut: e.target.checked }))}
                  />
                  Exclude opted-out
                </label>
              </div>
            </div>

            {ownerNames.length > 0 && (
              <div className="mt-3">
                <span className="text-xs font-medium text-slate-600">Contact owner</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {ownerNames.map((name) => {
                    const selected = (filter.ownerNames ?? []).includes(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() =>
                          setFilter((f) => ({ ...f, ownerNames: toggleInArray(f.ownerNames, name) }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected
                            ? "border-sky-500 bg-sky-50 text-sky-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {stages.length > 0 && (
              <div className="mt-3">
                <span className="text-xs font-medium text-slate-600">Deal stage (only when &quot;Has a deal&quot; is anything other than &quot;without a deal&quot;)</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {stages.map((stage) => {
                    const selected = (filter.dealStageIds ?? []).includes(stage.id);
                    return (
                      <button
                        key={stage.id}
                        type="button"
                        onClick={() =>
                          setFilter((f) => ({ ...f, dealStageIds: toggleInArray(f.dealStageIds, stage.id) }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {stage.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {sources.length > 0 && (
              <div className="mt-3">
                <span className="text-xs font-medium text-slate-600">Lead source</span>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {sources.map((src) => {
                    const selected = (filter.sources ?? []).includes(src);
                    return (
                      <button
                        key={src}
                        type="button"
                        onClick={() =>
                          setFilter((f) => ({ ...f, sources: toggleInArray(f.sources, src) }))
                        }
                        className={`rounded-full border px-3 py-1 text-xs ${
                          selected
                            ? "border-violet-500 bg-violet-50 text-violet-700"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {src}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Save list */}
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
              <input
                type="text"
                placeholder="Save current filter as a list…"
                value={saveListName}
                onChange={(e) => setSaveListName(e.target.value)}
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={handleSaveList}
                disabled={!saveListName.trim() || savingList}
                className="rounded-md border border-sky-500 bg-sky-50 px-3 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingList ? "Saving…" : "Save list"}
              </button>
            </div>
          </div>

          {/* Campaign & Template */}
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-3">Campaign</h2>

            <div className="mb-3 rounded-md bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <strong className="text-slate-800">From:</strong> Maison Toa &lt;info@maisontoa.ch&gt;
              <span className="ml-1 text-slate-400">(fixed for deliverability)</span>
            </div>

            <label className="block mb-3">
              <span className="text-xs font-medium text-slate-600">Campaign name (internal)</span>
              <input
                type="text"
                value={campaignName}
                onChange={(e) => setCampaignName(e.target.value)}
                placeholder="e.g. April newsletter"
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </label>

            <label className="block mb-3">
              <span className="text-xs font-medium text-slate-600">Template</span>
              <select
                value={templateId}
                onChange={(e) => setTemplateId(e.target.value)}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              >
                <option value="">— pick a template —</option>
                {templates.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name} — {t.subject_template || "no subject"}
                  </option>
                ))}
              </select>
              {templates.length === 0 && (
                <p className="mt-1 text-[11px] text-amber-600">
                  No templates yet. Create one in{" "}
                  <Link href="/workflows/templates" className="underline">Email Templates</Link>.
                </p>
              )}
            </label>

            <label className="block mb-3">
              <span className="text-xs font-medium text-slate-600">
                Subject override{" "}
                <span className="text-slate-400">(optional — leave blank to use template subject)</span>
              </span>
              <input
                type="text"
                value={subjectOverride}
                onChange={(e) => setSubjectOverride(e.target.value)}
                placeholder={selectedTemplate?.subject_template || ""}
                className="mt-1 w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
              <span className="text-[10px] text-slate-400">
                Supports {"{{patient.first_name}}"}, {"{{patient.last_name}}"}, {"{{patient.email}}"}
              </span>
            </label>

            {selectedTemplate && (
              <details className="rounded-md border border-slate-200 bg-slate-50 p-2">
                <summary className="cursor-pointer text-xs font-medium text-slate-700">Preview template HTML</summary>
                <div
                  className="mt-2 max-h-64 overflow-auto rounded bg-white p-2 text-xs"
                  dangerouslySetInnerHTML={{
                    __html:
                      selectedTemplate.html_content ||
                      selectedTemplate.body_template ||
                      "<em>empty</em>",
                  }}
                />
              </details>
            )}

            {/* Test send */}
            <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3">
              <input
                type="email"
                placeholder="test@example.com"
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm"
              />
              <button
                type="button"
                onClick={handleSendTest}
                disabled={testSending || !templateId}
                className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {testSending ? "Sending…" : "Send test"}
              </button>
            </div>

            {/* Send */}
            <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-3">
              <span className="text-xs text-slate-500">
                {previewCount} recipient{previewCount === 1 ? "" : "s"}
              </span>
              <button
                type="button"
                onClick={handleSendCampaign}
                disabled={sending || !templateId || previewCount === 0}
                className="rounded-full border border-sky-600 bg-sky-600 px-5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending campaign…" : `Send to ${previewCount}`}
              </button>
            </div>

            {sendResult && (
              <p className="mt-3 rounded-md bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{sendResult}</p>
            )}
            {sendError && (
              <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs text-red-700">{sendError}</p>
            )}
          </div>
        </section>

        {/* RIGHT: Preview */}
        <aside className="space-y-4">
          <div className="sticky top-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-900 mb-2">Preview</h2>
            <div className="mb-3">
              <p className="text-3xl font-bold text-slate-900">
                {previewLoading ? "…" : previewCount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">matching recipients</p>
            </div>
            {previewError && (
              <p className="mb-2 rounded bg-red-50 px-2 py-1 text-[11px] text-red-700">{previewError}</p>
            )}
            <div className="space-y-1">
              {previewSample.map((p) => (
                <div
                  key={p.id}
                  className="rounded border border-slate-100 bg-slate-50 px-2 py-1.5 text-[11px] text-slate-700"
                >
                  <div className="font-medium">
                    {[p.first_name, p.last_name].filter(Boolean).join(" ") || "—"}
                  </div>
                  <div className="truncate text-slate-500">{p.email}</div>
                </div>
              ))}
              {!previewLoading && previewSample.length === 0 && !previewError && (
                <p className="text-[11px] text-slate-400">No recipients match — adjust filters.</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
