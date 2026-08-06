"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type Channel = "email_marketing" | "social_media";

export default function PatientConsentControls({ patientId }: { patientId: string }) {
  const [values, setValues] = useState<Record<Channel, boolean>>({ email_marketing: false, social_media: false }); const [saving, setSaving] = useState<Channel | null>(null);
  const request = useCallback(async (init?: RequestInit) => { const { data } = await supabaseClient.auth.getSession(); return fetch(`/api/patients/${patientId}/consents`, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}` } }); }, [patientId]);
  useEffect(() => { void request().then(async (response) => { if (!response.ok) return; const entries = await response.json(); setValues((current) => ({ ...current, ...Object.fromEntries(entries.map((entry: { channel: Channel; granted: boolean }) => [entry.channel, entry.granted])) })); }); }, [request]);
  async function change(channel: Channel, granted: boolean) { setSaving(channel); const response = await request({ method: "POST", body: JSON.stringify({ channel, granted }) }); if (response.ok) setValues((current) => ({ ...current, [channel]: granted })); setSaving(null); }
  return <div className="rounded-xl border border-slate-200 bg-white p-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">Communication consent</p><div className="space-y-2">{(["email_marketing", "social_media"] as const).map((channel) => <label key={channel} className="flex items-center justify-between text-xs text-slate-700"><span>{channel === "email_marketing" ? "Email marketing" : "Social media"}</span><input type="checkbox" checked={values[channel]} disabled={saving === channel} onChange={(event) => change(channel, event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600" /></label>)}</div></div>;
}
