"use client";

import { useState, useEffect, useCallback } from "react";

const TABS = [
  { id: "external-labs", label: "External Labs" },
  { id: "doctor-scheduling", label: "Doctor Scheduling" },
  { id: "medidata", label: "MediData Connection" },
] as const;

type TabId = (typeof TABS)[number]["id"];

interface ExternalLab {
  id: string;
  name: string;
  url: string;
  username: string;
  password: string;
  type: string;
}

const LAB_TYPE_OPTIONS = [
  { value: "medisupport_fr", label: "Medisupport (fr)" },
] as const;

const EMPTY_LAB: Omit<ExternalLab, "id"> = {
  name: "",
  url: "",
  username: "",
  password: "",
  type: "medisupport_fr",
};

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("external-labs");

  return (
    <div className="w-full px-2 py-6">
      <h1 className="text-2xl font-semibold text-slate-800">Settings</h1>
      <p className="mt-1 text-sm text-slate-500">
        Manage your account settings and integrations.
      </p>

      {/* Tab navigation */}
      <div className="mt-6 border-b border-slate-200">
        <nav className="-mb-px flex gap-6" aria-label="Settings tabs">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`whitespace-nowrap border-b-2 px-1 pb-3 text-sm font-medium transition-colors ${
                activeTab === tab.id
                  ? "border-sky-500 text-sky-600"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "external-labs" && <ExternalLabsTab />}
        {activeTab === "doctor-scheduling" && <DoctorSchedulingTab />}
        {activeTab === "medidata" && <MediDataConnectionTab />}
      </div>
    </div>
  );
}

interface DoctorSchedulingSetting {
  id: string;
  provider_id: string;
  time_interval_minutes: number;
  default_duration_minutes: number;
  providers?: { name: string } | null;
}

interface ProviderOption {
  id: string;
  name: string | null;
  full_name?: string | null;
}

const TIME_INTERVAL_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 20, label: "20 minutes" },
  { value: 30, label: "30 minutes" },
];

const DEFAULT_DURATION_OPTIONS = [
  { value: 5, label: "5 minutes" },
  { value: 10, label: "10 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 20, label: "20 minutes" },
  { value: 25, label: "25 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
];

function DoctorSchedulingTab() {
  const [settings, setSettings] = useState<DoctorSchedulingSetting[]>([]);
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [formProviderId, setFormProviderId] = useState("");
  const [formInterval, setFormInterval] = useState(15);
  const [formDuration, setFormDuration] = useState(15);
  const [formError, setFormError] = useState<string | null>(null);

  const selectedSetting = settings.find((s) => s.id === selectedId) ?? null;

  useEffect(() => {
    async function load() {
      try {
        const [settingsRes, providersRes] = await Promise.all([
          fetch("/api/settings/doctor-scheduling"),
          fetch("/api/users/list"),
        ]);
        if (settingsRes.ok) {
          const data = await settingsRes.json();
          setSettings(data.settings || []);
        }
        if (providersRes.ok) {
          const data = await providersRes.json();
          setProviders(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load doctor scheduling settings:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function handleSelect(setting: DoctorSchedulingSetting) {
    setSelectedId(setting.id);
    setFormProviderId(setting.provider_id);
    setFormInterval(setting.time_interval_minutes);
    setFormDuration(setting.default_duration_minutes);
    setFormError(null);
  }

  function handleAddNew() {
    setSelectedId("__new__");
    setFormProviderId("");
    setFormInterval(5);
    setFormDuration(20);
    setFormError(null);
  }

  async function handleSave() {
    if (!formProviderId) {
      setFormError("Please select a doctor.");
      return;
    }

    setFormError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/doctor-scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: formProviderId,
          time_interval_minutes: formInterval,
          default_duration_minutes: formDuration,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setFormError(err.error || "Failed to save.");
        return;
      }
      const data = await res.json();
      const saved = data.setting as DoctorSchedulingSetting;
      setSettings((prev) => {
        const existing = prev.findIndex((s) => s.provider_id === saved.provider_id);
        if (existing >= 0) {
          const updated = [...prev];
          updated[existing] = saved;
          return updated;
        }
        return [...prev, saved];
      });
      setSelectedId(saved.id);
    } catch (err) {
      setFormError("Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || selectedId === "__new__") return;
    setSaving(true);
    try {
      await fetch(`/api/settings/doctor-scheduling?id=${selectedId}`, { method: "DELETE" });
      setSettings((prev) => prev.filter((s) => s.id !== selectedId));
      setSelectedId(null);
      setFormProviderId("");
      setFormInterval(15);
      setFormDuration(15);
    } catch (err) {
      console.error("Failed to delete:", err);
    } finally {
      setSaving(false);
    }
  }

  const usedProviderIds = new Set(settings.map((s) => s.provider_id));
  const availableProviders = providers.filter(
    (p) => !usedProviderIds.has(p.id) || p.id === selectedSetting?.provider_id
  );

  function getProviderName(providerId: string): string {
    const provider = providers.find((p) => p.id === providerId);
    return provider?.full_name || provider?.name || "Unknown";
  }

  return (
    <div className="flex gap-6 min-h-[420px]">
      {/* Left panel – settings list */}
      <div className="w-80 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Doctor Scheduling
          </h2>
          <button
            type="button"
            onClick={handleAddNew}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-sky-500 hover:bg-sky-50 transition-colors"
            title="Add doctor scheduling setting"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 grid grid-cols-3 gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Doctor</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Interval</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Duration</span>
        </div>

        <div className="max-h-[340px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              Loading…
            </div>
          )}
          {!loading && settings.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              No custom scheduling settings. All doctors use 15-minute intervals.
            </div>
          )}
          {settings.map((setting) => (
            <div
              key={setting.id}
              className={`grid grid-cols-3 gap-2 border-b border-slate-100/60 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                selectedId === setting.id
                  ? "bg-sky-50/60 text-sky-700"
                  : "text-slate-700 hover:bg-slate-50/80"
              }`}
              onClick={() => handleSelect(setting)}
            >
              <span className="truncate text-xs">
                {(setting.providers as any)?.name || getProviderName(setting.provider_id)}
              </span>
              <span className="text-xs">{setting.time_interval_minutes} min</span>
              <span className="text-xs">{setting.default_duration_minutes} min</span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel – form */}
      <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Select a setting or add a new one. Doctors without a custom setting use the default 15-minute intervals.
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {selectedId === "__new__" ? "Add Doctor Scheduling Setting" : "Edit Doctor Scheduling Setting"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                Configure custom time slot intervals and default appointment duration for this doctor.
              </p>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Doctor
                </label>
                <select
                  value={formProviderId}
                  onChange={(e) => setFormProviderId(e.target.value)}
                  disabled={selectedId !== "__new__" && !!selectedSetting}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">Select doctor…</option>
                  {(selectedId === "__new__" ? availableProviders : providers).map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p as any).full_name || p.name || "Unnamed"}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Time Slot Interval
                  </label>
                  <select
                    value={formInterval}
                    onChange={(e) => setFormInterval(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"
                  >
                    {TIME_INTERVAL_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Appointments can start every {formInterval} minutes (e.g. 9:00, 9:{formInterval.toString().padStart(2, "0")}…)
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Default Duration
                  </label>
                  <select
                    value={formDuration}
                    onChange={(e) => setFormDuration(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"
                  >
                    {DEFAULT_DURATION_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-slate-400">
                    Pre-selected duration when this doctor is chosen.
                  </p>
                </div>
              </div>

              {formError && <p className="text-[11px] text-red-500">{formError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200/80 px-6 py-3">
              <button
                type="button"
                onClick={() => { setSelectedId(null); setFormError(null); }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              {selectedId !== "__new__" && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-lg border border-red-200 bg-white px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors disabled:opacity-60"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExternalLabsTab() {
  const [labs, setLabs] = useState<ExternalLab[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<Omit<ExternalLab, "id">>(EMPTY_LAB);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof Omit<ExternalLab, "id">, string>>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const selectedLab = labs.find((l) => l.id === selectedId) ?? null;

  useEffect(() => {
    async function fetchLabs() {
      try {
        const res = await fetch("/api/settings/external-labs");
        if (res.ok) {
          const data = await res.json();
          setLabs(data.labs || []);
        }
      } catch (err) {
        console.error("Failed to load external labs:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchLabs();
  }, []);

  const persistLabs = useCallback(async (updatedLabs: ExternalLab[]) => {
    try {
      await fetch("/api/settings/external-labs", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labs: updatedLabs }),
      });
    } catch (err) {
      console.error("Failed to persist external labs:", err);
    }
  }, []);

  function handleAdd() {
    const id = crypto.randomUUID();
    const newLab: ExternalLab = { id, ...EMPTY_LAB };
    const updated = [...labs, newLab];
    setLabs(updated);
    setSelectedId(id);
    setForm(EMPTY_LAB);
    setErrors({});
  }

  function handleSelect(lab: ExternalLab) {
    setSelectedId(lab.id);
    setForm({ name: lab.name, url: lab.url, username: lab.username, password: lab.password, type: lab.type || "medisupport_fr" });
    setErrors({});
    setMenuOpenId(null);
  }

  async function handleSave() {
    if (!selectedId) return;

    const newErrors: Partial<Record<keyof Omit<ExternalLab, "id">, string>> = {};
    if (!form.name.trim()) newErrors.name = "Name is required.";
    if (!form.url.trim()) newErrors.url = "URL is required.";
    if (!form.username.trim()) newErrors.username = "User name is required.";
    if (!form.password.trim()) newErrors.password = "Password is required.";

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setSaving(true);
    const updated = labs.map((l) => (l.id === selectedId ? { ...l, ...form } : l));
    setLabs(updated);
    await persistLabs(updated);
    setSaving(false);
  }

  function handleCancel() {
    if (!selectedLab) return;
    setErrors({});
    setForm({
      name: selectedLab.name,
      url: selectedLab.url,
      username: selectedLab.username,
      password: selectedLab.password,
      type: selectedLab.type || "medisupport_fr",
    });
  }

  async function handleDelete(id: string) {
    const updated = labs.filter((l) => l.id !== id);
    setLabs(updated);
    if (selectedId === id) {
      setSelectedId(null);
      setForm(EMPTY_LAB);
    }
    setMenuOpenId(null);
    await persistLabs(updated);
  }

  return (
    <div className="flex gap-6 min-h-[420px]">
      {/* Left panel – lab list */}
      <div className="w-80 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            External Laboratories
          </h2>
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-sky-500 hover:bg-sky-50 transition-colors"
            title="Add laboratory"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Column header */}
        <div className="border-b border-slate-100 px-4 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Name</span>
        </div>

        {/* Lab list */}
        <div className="max-h-[340px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              Loading…
            </div>
          )}
          {!loading && labs.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              No laboratories added yet.
            </div>
          )}
          {labs.map((lab) => (
            <div
              key={lab.id}
              className={`group relative flex items-center justify-between border-b border-slate-100/60 px-4 py-2.5 text-sm cursor-pointer transition-colors ${
                selectedId === lab.id
                  ? "bg-sky-50/60 text-sky-700"
                  : "text-slate-700 hover:bg-slate-50/80"
              }`}
              onClick={() => handleSelect(lab)}
            >
              <span className="truncate text-sm">
                {lab.name || "Untitled"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel – form */}
      <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Select a laboratory or add a new one to configure.
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">
                Configure the External Laboratory Settings
              </h2>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              {/* External Laboratory (name display) */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  External Laboratory
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
                  {form.name || "Untitled"}
                </div>
              </div>

              {/* Type dropdown */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  Type
                </label>
                <select
                  value={form.type}
                  onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"
                >
                  {LAB_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>

              {/* Name + URL row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Name
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((prev) => ({ ...prev, name: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.name ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder="Laboratory name"
                  />
                  {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    URL
                  </label>
                  <input
                    type="text"
                    value={form.url}
                    onChange={(e) => { setForm((f) => ({ ...f, url: e.target.value })); setErrors((prev) => ({ ...prev, url: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.url ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder="https://"
                  />
                  {errors.url && <p className="mt-1 text-[11px] text-red-500">{errors.url}</p>}
                </div>
              </div>

              {/* Username + Password row */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    User Name
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => { setForm((f) => ({ ...f, username: e.target.value })); setErrors((prev) => ({ ...prev, username: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.username ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder="Username"
                  />
                  {errors.username && <p className="mt-1 text-[11px] text-red-500">{errors.username}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    Password
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setErrors((prev) => ({ ...prev, password: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.password ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder="••••••••"
                  />
                  {errors.password && <p className="mt-1 text-[11px] text-red-500">{errors.password}</p>}
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-200/80 px-6 py-3">
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => selectedId && handleDelete(selectedId)}
                className="rounded-lg border border-red-200 bg-white px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors"
              >
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MediData Connection Tab
// ---------------------------------------------------------------------------

interface MediDataConfig {
  senderGln: string;
  clientId: string;
  proxyUrl: string;
  connected: boolean;
  isTestMode: boolean;
}

function MediDataConnectionTab() {
  const [config, setConfig] = useState<MediDataConfig | null>(null);
  const [mdLoading, setMdLoading] = useState(true);
  const [mdSaving, setMdSaving] = useState(false);
  const [mdSenderGln, setMdSenderGln] = useState("");
  const [mdClientId, setMdClientId] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    async function loadMdConfig() {
      try {
        const res = await fetch("/api/settings/medidata");
        if (res.ok) {
          const data = await res.json();
          setConfig(data);
          setMdSenderGln(data.senderGln || "");
          setMdClientId(data.clientId || "");
        }
      } catch (err) {
        console.error("Failed to load MediData settings:", err);
      } finally {
        setMdLoading(false);
      }
    }
    loadMdConfig();
  }, []);

  async function handleMdSave() {
    setMdSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch("/api/settings/medidata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderGln: mdSenderGln, clientId: mdClientId }),
      });
      const data = await res.json();
      if (res.ok) {
        setSaveMessage(data.message || "Settings saved successfully.");
      } else {
        setSaveMessage(`Error: ${data.error}`);
      }
    } catch (err) {
      setSaveMessage("Failed to save settings.");
    } finally {
      setMdSaving(false);
    }
  }

  if (mdLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-slate-400">
        Loading MediData configuration…
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Connection Status */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">Connection Status</h3>
            <p className="mt-0.5 text-xs text-slate-500">MediData ELA API integration</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                config?.connected ? "bg-emerald-500 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className={`text-xs font-medium ${config?.connected ? "text-emerald-700" : "text-red-600"}`}>
              {config?.connected ? "Connected" : "Not Connected"}
            </span>
          </div>
        </div>
        {config?.isTestMode ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-xs font-medium text-amber-700">Test Mode — Using MediData ACC environment</span>
          </div>
        ) : config?.connected ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-emerald-700">Production Mode — Connected to MediData</span>
          </div>
        ) : null}
      </div>

      {/* Credentials */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">MediData Credentials</h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Sender GLN <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={mdSenderGln}
            onChange={(e) => setMdSenderGln(e.target.value)}
            placeholder="e.g., 7601003000115"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            13-digit GLN registered with MediData for your clinic. Used as the transport &quot;from&quot; in all invoice transmissions.
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            MediData Client ID <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={mdClientId}
            onChange={(e) => setMdClientId(e.target.value)}
            placeholder="e.g., 1000030720_1200011781"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            Client ID provided by MediData for API authentication (configured on Railway proxy).
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            Intermediate GLN (Clearing House)
          </label>
          <input
            type="text"
            value="7601001304307"
            disabled
            className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-500"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            MediData clearing house GLN. This is fixed and cannot be changed.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="flex items-center justify-between">
        <div>
          {saveMessage && (
            <p className={`text-xs ${saveMessage.startsWith("Error") ? "text-red-600" : "text-emerald-600"}`}>
              {saveMessage}
            </p>
          )}
        </div>
        <button
          onClick={handleMdSave}
          disabled={mdSaving}
          className="rounded-lg bg-sky-500 px-5 py-2 text-xs font-medium text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
        >
          {mdSaving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}
