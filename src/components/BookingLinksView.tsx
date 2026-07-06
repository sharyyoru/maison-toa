"use client";

import { useState, useEffect, useCallback, useMemo } from "react";


interface BookingCategory {
  id: string;
  name: string;
  name_en: string | null;
  patient_type: "new" | "existing";
  slug: string;
  enabled: boolean;
  skip_treatment: boolean;
}

interface BookingTreatment {
  id: string;
  category_id: string;
  name: string;
  name_en: string | null;
  enabled: boolean;
  prepayment_required: boolean;
}

interface BookingDoctor {
  id: string;
  name: string;
  slug: string;
  enabled: boolean;
}

interface BookingLink {
  id: string;
  name: string;
  patient_type: "new" | "existing";
  category_id: string | null;
  treatment_id: string | null;
  doctor_id: string | null;
  category_slug: string | null;
  doctor_slug: string | null;
  long_url: string;
  short_code: string;
  group_name: string | null;
  created_at: string;
  booking_categories?: { name: string } | null;
  booking_treatments?: { name: string } | null;
  booking_doctors?: { name: string } | null;
}

interface Props {
  categories: BookingCategory[];
  treatments: BookingTreatment[];
  doctors: BookingDoctor[];
}

export default function BookingLinksView({ categories, treatments, doctors }: Props) {
  const [links, setLinks] = useState<BookingLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(true);

  const [patientType, setPatientType] = useState<"new" | "existing">("new");
  const [categoryId, setCategoryId] = useState<string | "">("");
  const [treatmentId, setTreatmentId] = useState<string | "">("");
  const [doctorId, setDoctorId] = useState<string | "">("");
  const [linkName, setLinkName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [saving, setSaving] = useState(false);

  const appUrl = typeof window !== "undefined"
    ? window.location.origin
    : (process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app");

  const filteredCategories = useMemo(
    () => categories.filter((c) => c.patient_type === patientType && c.enabled),
    [categories, patientType]
  );

  const filteredTreatments = useMemo(
    () => treatments.filter((t) => t.category_id === categoryId && t.enabled),
    [treatments, categoryId]
  );

  const filteredDoctors = useMemo(() => {
    if (!categoryId) return [];
    return doctors.filter((d) => d.enabled);
  }, [doctors, categoryId]);

  const previewLongUrl = useMemo(() => {
    const category = categories.find((c) => c.id === categoryId);
    const doctor = doctors.find((d) => d.id === doctorId);
    let path = patientType === "new" ? "/book-appointment/new-patient" : "/book-appointment/existing-patient";
    if (category) {
      path += `/${category.slug}`;
      if (treatmentId) {
        path += `/${treatmentId}`;
        if (doctor) {
          path += `/${doctor.slug}`;
        }
      }
    }
    return `${appUrl}${path}`;
  }, [appUrl, patientType, categoryId, treatmentId, doctorId, categories, doctors]);

  const fetchLinks = useCallback(async () => {
    setLoadingLinks(true);
    try {
      const res = await fetch("/api/settings/booking-links");
      const data = await res.json();
      setLinks(data.links || []);
    } catch (err) {
      console.error("Failed to fetch booking links:", err);
    } finally {
      setLoadingLinks(false);
    }
  }, []);

  useEffect(() => {
    fetchLinks();
  }, [fetchLinks]);

  useEffect(() => {
    setCategoryId("");
    setTreatmentId("");
    setDoctorId("");
  }, [patientType]);

  useEffect(() => {
    setTreatmentId("");
    setDoctorId("");
  }, [categoryId]);

  useEffect(() => {
    setDoctorId("");
  }, [treatmentId]);

  async function handleSave() {
    if (!linkName.trim()) {
      alert("Please enter a link name");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/settings/booking-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patient_type: patientType,
          category_id: categoryId || undefined,
          treatment_id: treatmentId || undefined,
          doctor_id: doctorId || undefined,
          name: linkName.trim(),
          group_name: groupName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to save link");
      }
      setLinks((prev) => [data.link, ...prev]);
      setLinkName("");
      setGroupName("");
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this link?")) return;
    try {
      const res = await fetch(`/api/settings/booking-links?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch (err) {
      console.error("Failed to delete link:", err);
      alert("Failed to delete link");
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).then(() => alert("Copied!")).catch(() => alert("Failed to copy"));
  }

  const groupedLinks = useMemo(() => {
    const map = new Map<string, BookingLink[]>();
    links.forEach((link) => {
      const key = link.group_name || (link.patient_type === "new" ? "New Patients" : "Existing Patients");
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(link);
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [links]);

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-1">Create booking link</h3>
        <p className="text-sm text-slate-500 mb-4">
          Pre-select any step of the booking flow and generate a shareable link.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Patient type</label>
            <select
              value={patientType}
              onChange={(e) => setPatientType(e.target.value as "new" | "existing")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="new">New patient</option>
              <option value="existing">Existing patient</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Any category</option>
              {filteredCategories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Treatment</label>
            <select
              value={treatmentId}
              onChange={(e) => setTreatmentId(e.target.value)}
              disabled={!categoryId || filteredTreatments.length === 0}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Any treatment</option>
              {filteredTreatments.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Doctor</label>
            <select
              value={doctorId}
              onChange={(e) => setDoctorId(e.target.value)}
              disabled={!treatmentId || filteredDoctors.length === 0}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-100"
            >
              <option value="">Any doctor</option>
              {filteredDoctors.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Link name</label>
            <input
              type="text"
              value={linkName}
              onChange={(e) => setLinkName(e.target.value)}
              placeholder="e.g. Summer campaign - Botox"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Group (optional)</label>
            <input
              type="text"
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              placeholder="e.g. Campaigns, Doctors, Social media"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="mt-4 rounded-lg bg-slate-50 p-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase">Long URL</p>
            <p className="text-sm text-slate-700 break-all">{previewLongUrl}</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => copyToClipboard(previewLongUrl)}
              className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              Copy long URL
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !linkName.trim()}
              className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save & generate short link"}
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6">
        <h3 className="text-lg font-semibold text-slate-900 mb-4">Saved links</h3>
        {loadingLinks ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-slate-500">No saved links yet.</p>
        ) : (
          <div className="space-y-6">
            {groupedLinks.map(([group, groupLinks]) => (
              <div key={group}>
                <h4 className="text-sm font-semibold text-slate-700 mb-2">{group}</h4>
                <div className="space-y-2">
                  {groupLinks.map((link) => (
                    <div
                      key={link.id}
                      className="flex flex-col md:flex-row md:items-center justify-between gap-3 rounded-lg border border-slate-200 p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900">{link.name}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {link.booking_categories?.name || "Any category"} →{" "}
                          {link.booking_treatments?.name || "Any treatment"} →{" "}
                          {link.booking_doctors?.name || "Any doctor"}
                        </p>
                        <p className="text-xs text-slate-400 truncate mt-1">{link.long_url}</p>
                        <p className="text-xs text-slate-400 truncate">
                          Short: {appUrl}/b/{link.short_code}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => copyToClipboard(link.long_url)}
                          className="px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          Copy long
                        </button>
                        <button
                          onClick={() => copyToClipboard(`${appUrl}/b/${link.short_code}`)}
                          className="px-3 py-1.5 bg-slate-900 text-white rounded-lg text-xs font-medium hover:bg-slate-800"
                        >
                          Copy short
                        </button>
                        <button
                          onClick={() => handleDelete(link.id)}
                          className="px-3 py-1.5 text-rose-600 hover:bg-rose-50 rounded-lg text-xs font-medium"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
