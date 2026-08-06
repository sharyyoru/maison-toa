"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";

type Definition = { id: string; key: string; label: string; value_type: string; active: boolean };

export default function WorkflowPropertiesPage() {
  const [items, setItems] = useState<Definition[]>([]); const [label, setLabel] = useState(""); const [key, setKey] = useState(""); const [type, setType] = useState("text"); const [error, setError] = useState<string | null>(null);
  const request = useCallback(async (init?: RequestInit) => { const { data } = await supabaseClient.auth.getSession(); return fetch("/api/workflows/v2/properties", { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${data.session?.access_token || ""}`, ...(init?.headers || {}) } }); }, []);
  const load = useCallback(async () => { const response = await request(); if (response.ok) setItems(await response.json()); }, [request]);
  useEffect(() => { void load(); }, [load]);
  async function submit(event: FormEvent) { event.preventDefault(); setError(null); const response = await request({ method: "POST", body: JSON.stringify({ label, key: key || label, value_type: type }) }); const result = await response.json(); if (!response.ok) return setError(result.error); setLabel(""); setKey(""); await load(); }
  async function deactivate(id: string) { await request({ method: "DELETE", body: JSON.stringify({ id }) }); await load(); }
  return <main className="min-h-screen bg-slate-50 p-6"><div className="mx-auto max-w-3xl space-y-6"><div><Link href="/workflows" className="text-sm text-sky-600">← Workflows</Link><h1 className="mt-2 text-2xl font-bold text-slate-900">Patient custom properties</h1><p className="text-sm text-slate-500">Create workflow-controlled fields displayed in the patient CRM panel.</p></div><form onSubmit={submit} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 sm:grid-cols-4"><input required value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" className="rounded border border-slate-200 px-3 py-2 text-sm"/><input value={key} onChange={(e) => setKey(e.target.value)} placeholder="property_key" className="rounded border border-slate-200 px-3 py-2 text-sm"/><select value={type} onChange={(e) => setType(e.target.value)} className="rounded border border-slate-200 px-3 py-2 text-sm"><option value="text">Text</option><option value="number">Number</option><option value="boolean">Yes / No</option><option value="date">Date</option><option value="single_select">Single select</option></select><button className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Add property</button>{error && <p className="text-sm text-red-600 sm:col-span-4">{error}</p>}</form><div className="overflow-hidden rounded-xl border border-slate-200 bg-white">{items.map((item) => <div key={item.id} className="flex items-center justify-between border-b border-slate-100 px-4 py-3 last:border-0"><div><div className="font-medium text-slate-900">{item.label}</div><div className="text-xs text-slate-500">{item.key} · {item.value_type}</div></div>{item.active ? <button onClick={() => deactivate(item.id)} className="text-xs text-red-600">Deactivate</button> : <span className="text-xs text-slate-400">Inactive</span>}</div>)}</div></div></main>;
}
