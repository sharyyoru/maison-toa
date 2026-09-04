"use client";

import { useEffect, useMemo, useState } from "react";

type DoctorOption = {
  id: string;
  name: string;
  slug: string;
  calendar_provider_id: string | null;
};

type TreatmentOption = { id: string; name: string; category_id: string };

export type ExceptionalAvailabilitySelection = {
  date: string;
  startTime: string;
  endTime: string;
  calendarProviderId: string | null;
};

type Props = {
  selection: ExceptionalAvailabilitySelection;
  onClose: () => void;
  onSaved?: () => void;
};

const inputClass = "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:ring-2 focus:ring-sky-100";

export default function ExceptionalAvailabilityModal({ selection, onClose, onSaved }: Props) {
  const [doctors, setDoctors] = useState<DoctorOption[]>([]);
  const [treatments, setTreatments] = useState<TreatmentOption[]>([]);
  const [doctorId, setDoctorId] = useState("");
  const [treatmentIds, setTreatmentIds] = useState<string[]>([]);
  const [label, setLabel] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/settings/exceptional-availability");
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Failed to load booking options");
        if (!active) return;
        const loadedDoctors = (data.doctors || []) as DoctorOption[];
        setDoctors(loadedDoctors);
        setTreatments((data.treatments || []) as TreatmentOption[]);
        const matchingDoctor = loadedDoctors.find(
          (doctor) => doctor.calendar_provider_id === selection.calendarProviderId,
        );
        setDoctorId(matchingDoctor?.id || "");
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : "Failed to load booking options");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [selection.calendarProviderId]);

  const filteredTreatments = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? treatments.filter((treatment) => treatment.name.toLocaleLowerCase().includes(query))
      : treatments;
  }, [search, treatments]);

  function toggleTreatment(id: string) {
    setTreatmentIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function save() {
    if (!doctorId) return setError("Select the online-booking practitioner for this calendar.");
    if (treatmentIds.length === 0) return setError("Select at least one treatment.");
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/settings/exceptional-availability", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          booking_doctor_id: doctorId,
          exception_date: selection.date,
          start_time: selection.startTime,
          end_time: selection.endTime,
          treatment_ids: treatmentIds,
          label,
          enabled: true,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Failed to create exceptional availability");
      onSaved?.();
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to create exceptional availability");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/45 p-4" onMouseDown={(event) => event.target === event.currentTarget && !saving && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby="exceptional-availability-title" className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="exceptional-availability-title" className="text-base font-semibold text-slate-900">Exceptional online availability</h2>
            <p className="mt-1 text-xs text-slate-500">{selection.date} · {selection.startTime}–{selection.endTime}. Only selected treatments will be bookable.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 disabled:opacity-50">×</button>
        </div>

        <div className="space-y-5 overflow-y-auto px-6 py-5">
          {loading ? <p className="py-10 text-center text-sm text-slate-400">Loading booking options…</p> : (
            <>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Practitioner</label>
                <select value={doctorId} onChange={(event) => setDoctorId(event.target.value)} className={inputClass}>
                  <option value="">Select practitioner</option>
                  {doctors.map((doctor) => <option key={doctor.id} value={doctor.id}>{doctor.name}</option>)}
                </select>
                {!doctorId && selection.calendarProviderId ? <p className="mt-1.5 text-xs text-amber-600">This calendar is not linked to an online-booking practitioner. Please choose one.</p> : null}
              </div>
              <div>
                <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wide text-slate-500">Internal label (optional)</label>
                <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="e.g. Tuesday afternoon opening" className={inputClass} />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Treatments available online</label>
                  <span className="text-xs text-slate-400">{treatmentIds.length} selected</span>
                </div>
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search treatments…" className={`${inputClass} mb-2`} />
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {filteredTreatments.map((treatment) => (
                    <label key={treatment.id} className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50">
                      <input type="checkbox" checked={treatmentIds.includes(treatment.id)} onChange={() => toggleTreatment(treatment.id)} className="h-4 w-4 rounded border-slate-300 text-sky-500" />
                      <span className="text-sm text-slate-700">{treatment.name}</span>
                    </label>
                  ))}
                  {filteredTreatments.length === 0 ? <p className="px-3 py-8 text-center text-xs text-slate-400">No treatments found.</p> : null}
                </div>
              </div>
            </>
          )}
          {error ? <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p> : null}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50">Cancel</button>
          <button type="button" onClick={() => void save()} disabled={loading || saving} className="rounded-full bg-sky-500 px-5 py-2 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">{saving ? "Creating…" : "Create availability"}</button>
        </div>
      </div>
    </div>
  );
}
