"use client";

import { useEffect, useMemo, useState } from "react";

type TargetType = "user" | "billing_entity";
type Option = { type: TargetType; id: string; label: string };
type Configuration = { id: string; target_type: TargetType; target_id: string; target_label: string; hex_color: string };
const EMPTY_FORM = { targetKey: "", hexColor: "#000000" };
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30";

export default function SystemConfigurationTab() {
  const [section, setSection] = useState<"colored-lines" | "exceptional-availability">("colored-lines");
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
    <div className="mb-5 flex gap-6 border-b border-slate-200">
      <button type="button" onClick={() => setSection("colored-lines")} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "colored-lines" ? "border-sky-500 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>Colored Lines</button>
      <button type="button" onClick={() => setSection("exceptional-availability")} className={`border-b-2 px-1 pb-3 text-sm font-medium ${section === "exceptional-availability" ? "border-sky-500 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700"}`}>Exceptional Online Availability</button>
    </div>
    {section === "exceptional-availability" ? <ExceptionalAvailabilityPanel /> : <>
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
    </div></>}
  </div>;
}

type DoctorOption = { id: string; name: string; slug: string };
type TreatmentOption = { id: string; name: string; category_id: string };
type ExceptionalConfiguration = {
  id: string;
  booking_doctor_id: string;
  exception_date: string;
  start_time: string;
  end_time: string;
  treatment_ids: string[];
  label: string | null;
  enabled: boolean;
  booking_doctors?: { name?: string; slug?: string } | null;
};

const EMPTY_EXCEPTION_FORM = {
  doctorId: "",
  date: "",
  startTime: "14:00",
  endTime: "17:00",
  treatmentIds: [] as string[],
  label: "",
  enabled: true,
};

function ExceptionalAvailabilityPanel() {
  const [items, setItems] = useState<ExceptionalConfiguration[]>([]);
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [treatments, setTreatments] = useState<TreatmentOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_EXCEPTION_FORM);
  const [treatmentSearch, setTreatmentSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const treatmentNames = useMemo(
    () => new Map(treatments.map((treatment) => [treatment.id, treatment.name])),
    [treatments],
  );
  const filteredTreatments = useMemo(() => {
    const query = treatmentSearch.trim().toLocaleLowerCase();
    if (!query) return treatments;
    return treatments.filter((treatment) => treatment.name.toLocaleLowerCase().includes(query));
  }, [treatmentSearch, treatments]);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/api/settings/exceptional-availability");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load exceptional availability");
        setItems(data.configurations || []);
        setDoctors(data.doctors || []);
        setTreatments(data.treatments || []);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load exceptional availability");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function select(item: ExceptionalConfiguration) {
    setSelectedId(item.id);
    setForm({
      doctorId: item.booking_doctor_id,
      date: item.exception_date,
      startTime: item.start_time.slice(0, 5),
      endTime: item.end_time.slice(0, 5),
      treatmentIds: item.treatment_ids,
      label: item.label || "",
      enabled: item.enabled,
    });
    setError(null);
  }

  function toggleTreatment(id: string) {
    setForm((current) => ({
      ...current,
      treatmentIds: current.treatmentIds.includes(id)
        ? current.treatmentIds.filter((treatmentId) => treatmentId !== id)
        : [...current.treatmentIds, id],
    }));
  }

  async function duplicate() {
    if (!selectedId || selectedId === "__new__") return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/exceptional-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_doctor_id: form.doctorId,
          exception_date: form.date,
          start_time: form.startTime,
          end_time: form.endTime,
          treatment_ids: form.treatmentIds,
          label: form.label,
          enabled: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to duplicate exceptional availability");
      const doctor = doctors.find((option) => option.id === form.doctorId);
      const duplicated = { ...data.configuration, booking_doctors: doctor ? { name: doctor.name, slug: doctor.slug } : null } as ExceptionalConfiguration;
      setItems((current) => [...current, duplicated].sort((a, b) => `${a.exception_date}${a.start_time}`.localeCompare(`${b.exception_date}${b.start_time}`)));
      setSelectedId(duplicated.id);
      setForm((current) => ({ ...current, treatmentIds: [...current.treatmentIds], enabled: true }));
    } catch (duplicateError) {
      setError(duplicateError instanceof Error ? duplicateError.message : "Failed to duplicate exceptional availability");
    } finally {
      setSaving(false);
    }
  }

  async function save() {
    if (!form.doctorId || !form.date || !form.startTime || !form.endTime) return setError("Doctor, date, and times are required.");
    if (form.startTime >= form.endTime) return setError("End time must be after start time.");
    if (form.treatmentIds.length === 0) return setError("Select at least one allowed treatment.");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/exceptional-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId === "__new__" ? undefined : selectedId,
          booking_doctor_id: form.doctorId,
          exception_date: form.date,
          start_time: form.startTime,
          end_time: form.endTime,
          treatment_ids: form.treatmentIds,
          label: form.label,
          enabled: form.enabled,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to save exceptional availability");
      const doctor = doctors.find((option) => option.id === form.doctorId);
      const saved = { ...data.configuration, booking_doctors: doctor ? { name: doctor.name, slug: doctor.slug } : null } as ExceptionalConfiguration;
      setItems((current) => [...current.filter((item) => item.id !== saved.id), saved].sort((a, b) => `${a.exception_date}${a.start_time}`.localeCompare(`${b.exception_date}${b.start_time}`)));
      setSelectedId(saved.id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save exceptional availability");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedId || selectedId === "__new__") return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/settings/exceptional-availability?id=${selectedId}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to delete exceptional availability");
      setItems((current) => current.filter((item) => item.id !== selectedId));
      setSelectedId(null);
      setForm(EMPTY_EXCEPTION_FORM);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Failed to delete exceptional availability");
    } finally {
      setSaving(false);
    }
  }

  return <div className="flex min-h-[520px] gap-6">
    <aside className="w-96 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
        <div><h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Exceptional availability</h2><p className="mt-1 text-[11px] text-slate-400">Open one-off online slots for selected treatments.</p></div>
        <button type="button" onClick={() => { setSelectedId("__new__"); setForm(EMPTY_EXCEPTION_FORM); setTreatmentSearch(""); setError(null); }} className="rounded-lg bg-sky-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-600">+ Add</button>
      </div>
      <div className="max-h-[450px] overflow-y-auto">
        {loading && <p className="px-4 py-8 text-center text-xs text-slate-400">Loading…</p>}
        {!loading && items.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">No exceptional availability configured.</p>}
        {items.map((item) => <button key={item.id} type="button" onClick={() => select(item)} className={`w-full border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50 ${selectedId === item.id ? "bg-sky-50" : ""}`}>
          <span className="flex items-center justify-between gap-2"><span className="min-w-0 truncate text-sm font-medium text-slate-800">{item.booking_doctors?.name || "Unavailable doctor"}</span><span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.enabled ? "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200" : "bg-slate-100 text-slate-500 ring-1 ring-inset ring-slate-200"}`}>{item.enabled ? "Active" : "Inactive"}</span></span>
          <span className="mt-0.5 block text-xs text-slate-500">{item.exception_date} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)}</span>
          <span className="mt-1 block truncate text-[11px] text-slate-400">{item.treatment_ids.map((id) => treatmentNames.get(id) || "Unavailable treatment").join(", ")}</span>
        </button>)}
      </div>
    </aside>
    <section className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
      {!selectedId ? <div className="flex h-full items-center justify-center px-8 text-center text-sm text-slate-400">Select an exceptional period or add a new one.</div> : <div>
        <div className="flex items-start justify-between gap-6 border-b border-slate-200/80 px-6 py-4"><div><h2 className="text-sm font-semibold text-slate-800">{selectedId === "__new__" ? "Add Exceptional Online Availability" : "Edit Exceptional Online Availability"}</h2><p className="mt-1 text-xs text-slate-500">The selected treatments become bookable during this period even when the doctor is normally unavailable. Every other treatment remains closed.</p></div><label className="flex shrink-0 cursor-pointer items-center gap-2"><span className={`text-xs font-medium ${form.enabled ? "text-emerald-700" : "text-slate-500"}`}>{form.enabled ? "Active" : "Inactive"}</span><span className="relative inline-flex"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm((current) => ({ ...current, enabled: event.target.checked }))} className="peer sr-only" /><span className="h-6 w-11 rounded-full bg-slate-200 transition-colors peer-checked:bg-emerald-500" /><span className="absolute left-1 top-1 h-4 w-4 rounded-full bg-white shadow-sm transition-transform peer-checked:translate-x-5" /></span></label></div>
        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Doctor</label><select value={form.doctorId} onChange={(event) => setForm((current) => ({ ...current, doctorId: event.target.value }))} className={inputClass}><option value="">Select doctor</option>{doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}</select></div>
            <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Date</label><input type="date" value={form.date} onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))} className={inputClass} /></div>
            <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Start time</label><input type="time" step="1800" value={form.startTime} onChange={(event) => setForm((current) => ({ ...current, startTime: event.target.value }))} className={inputClass} /></div>
            <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">End time</label><input type="time" step="1800" value={form.endTime} onChange={(event) => setForm((current) => ({ ...current, endTime: event.target.value }))} className={inputClass} /></div>
          </div>
          <div><label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">Internal label (optional)</label><input value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} placeholder="e.g. Friday afternoon opening" className={inputClass} /></div>
          <div>
            <div className="mb-2 flex items-center justify-between"><label className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Allowed treatments</label><span className="text-[11px] text-slate-400">{form.treatmentIds.length} selected</span></div>
            <div className="relative mb-2">
              <svg aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.35-5.65a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" /></svg>
              <input type="search" value={treatmentSearch} onChange={(event) => setTreatmentSearch(event.target.value)} placeholder="Search treatments…" className={`${inputClass} pl-9`} />
            </div>
            <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 p-2">
              {filteredTreatments.length === 0 ? <p className="px-3 py-6 text-center text-xs text-slate-400">No treatments match “{treatmentSearch}”.</p> : filteredTreatments.map((treatment) => <label key={treatment.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={form.treatmentIds.includes(treatment.id)} onChange={() => toggleTreatment(treatment.id)} className="h-4 w-4 rounded border-slate-300 text-sky-500" /><span className="text-sm text-slate-700">{treatment.name}</span></label>)}
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}
        </div>
        <div className="flex justify-between border-t border-slate-200/80 px-6 py-4"><div className="flex gap-2">{selectedId !== "__new__" && <><button type="button" onClick={remove} disabled={saving} className="rounded-lg border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50">Delete</button><button type="button" onClick={duplicate} disabled={saving} className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Duplicate</button></>}</div><button type="button" onClick={save} disabled={saving} className="rounded-lg bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">{saving ? "Saving…" : selectedId === "__new__" ? "Create" : "Save"}</button></div>
      </div>}
    </section>
  </div>;
}
