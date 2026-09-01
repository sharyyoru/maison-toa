"use client";

import { useEffect, useMemo, useState } from "react";

type TargetType = "user" | "billing_entity";
type Option = { type: TargetType; id: string; label: string };
type Configuration = { id: string; target_type: TargetType; target_id: string; target_label: string; hex_color: string };
const EMPTY_FORM = { targetKey: "", hexColor: "#000000" };
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30";

export default function SystemConfigurationTab() {
  const [items, setItems] = useState<Configuration[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labels = useMemo(() => new Map(options.map((option) => [`${option.type}:${option.id}`, option.label])), [options]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings/colored-lines");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load colored lines");
        setItems(data.configurations || []);
        setOptions(data.options || []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load colored lines");
      } finally { setLoading(false); }
    })();
  }, []);

  function select(item: Configuration) {
    setSelectedId(item.id);
    setForm({ targetKey: `${item.target_type}:${item.target_id}`, hexColor: item.hex_color });
    setError(null);
  }

  async function save() {
    const [targetType, targetId] = form.targetKey.split(":") as [TargetType, string];
    if (!targetId) return setError("Select a doctor or billing entity.");
    if (!HEX_COLOR.test(form.hexColor)) return setError("Enter a color in #RRGGBB format.");
    setSaving(true); setError(null);
    try {
      const response = await fetch("/api/settings/colored-lines", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: selectedId === "__new__" ? undefined : selectedId, target_type: targetType, target_id: targetId, hex_color: form.hexColor }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save colored line");
      const saved = { ...data.configuration, target_label: labels.get(form.targetKey) || "Unavailable target" } as Configuration;
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved]);
      setSelectedId(saved.id); setForm((current) => ({ ...current, hexColor: saved.hex_color }));
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Failed to save colored line"); }
    finally { setSaving(false); }
  }

  async function remove() {
    if (!selectedId || selectedId === "__new__") return;
    setSaving(true); setError(null);
    try {
      const response = await fetch(`/api/settings/colored-lines?id=${selectedId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete colored line");
      setItems((current) => current.filter((item) => item.id !== selectedId));
      setSelectedId(null); setForm(EMPTY_FORM);
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Failed to delete colored line"); }
    finally { setSaving(false); }
  }

  return <div>
    <div className="mb-5 border-b border-slate-200"><button type="button" className="border-b-2 border-sky-500 px-1 pb-3 text-sm font-medium text-sky-600">Colored Lines</button></div>
    <div className="flex min-h-[480px] gap-6">
      <aside className="w-96 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Colored Lines</h2><p className="mt-1 text-[11px] text-slate-400">Manage colors by doctor or billing entity.</p></div>
          <button type="button" onClick={() => { setSelectedId("__new__"); setForm(EMPTY_FORM); setError(null); }} className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600">+ Add</button>
        </div>
        <div className="max-h-[410px] overflow-y-auto">
          {loading && <p className="px-4 py-8 text-center text-xs text-slate-400">Loading…</p>}
          {!loading && items.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">No colored lines configured.</p>}
          {items.map((item) => <button key={item.id} type="button" onClick={() => select(item)} className={`flex w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selectedId === item.id ? "bg-sky-50" : ""}`}>
            <span className="h-7 w-7 shrink-0 rounded-md border border-slate-200" style={{ backgroundColor: item.hex_color }} />
            <span className="min-w-0"><span className="block truncate text-sm font-medium text-slate-800">{item.target_label}</span><span className="text-[11px] text-slate-400">{item.target_type === "user" ? "Doctor / User" : "Billing Entity"} · {item.hex_color}</span></span>
          </button>)}
        </div>
      </aside>
      <section className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        {!selectedId ? <div className="flex h-full items-center justify-center text-sm text-slate-400">Select a configuration or add a new one.</div> : <div>
          <div className="border-b border-slate-200/80 px-6 py-4"><h2 className="text-sm font-semibold text-slate-800">{selectedId === "__new__" ? "Add Colored Line" : "Edit Colored Line"}</h2></div>
          <div className="space-y-5 px-6 py-5">
            <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Doctor / Billing Entity</label>
              <select value={form.targetKey} onChange={(event) => setForm((current) => ({ ...current, targetKey: event.target.value }))} className={inputClass}>
                <option value="">Select doctor or billing entity</option>
                <optgroup label="Doctors / Users">{options.filter((option) => option.type === "user").map((option) => <option key={`user:${option.id}`} value={`user:${option.id}`}>{option.label}</option>)}</optgroup>
                <optgroup label="Billing Entities">{options.filter((option) => option.type === "billing_entity").map((option) => <option key={`billing_entity:${option.id}`} value={`billing_entity:${option.id}`}>{option.label}</option>)}</optgroup>
              </select>
            </div>
            <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Hex Color Code</label><div className="flex gap-3">
              <input value={form.hexColor} onChange={(event) => setForm((current) => ({ ...current, hexColor: event.target.value }))} placeholder="#1D4ED8" maxLength={7} className={`${inputClass} font-mono uppercase`} />
              <input type="color" value={HEX_COLOR.test(form.hexColor) ? form.hexColor : "#000000"} onChange={(event) => setForm((current) => ({ ...current, hexColor: event.target.value.toUpperCase() }))} className="h-10 w-14 cursor-pointer rounded-lg border border-slate-200 bg-white p-1" aria-label="Choose color" />
            </div><p className="mt-1 text-[10px] text-slate-400">Use #RRGGBB, for example #1D4ED8.</p></div>
            {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
          </div>
          <div className="flex justify-between border-t border-slate-200/80 px-6 py-4"><div>{selectedId !== "__new__" && <button type="button" onClick={remove} disabled={saving} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button>}</div><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">{saving ? "Saving…" : "Save"}</button></div>
        </div>}
      </section>
    </div>
  </div>;
}
