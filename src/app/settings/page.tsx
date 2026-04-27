"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";

const TABS = [
  { id: "external-labs", label: "External Labs" },
  { id: "doctor-scheduling", label: "Doctor Scheduling" },
  { id: "medidata", label: "MediData Connection" },
  { id: "booking-categories", label: "Booking Categories" },
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
  const t = useTranslations("settingsPage");
  const [activeTab, setActiveTab] = useState<TabId>("external-labs");

  const tabLabels: Record<TabId, string> = {
    "external-labs": t("tabs.externalLabs"),
    "doctor-scheduling": t("tabs.doctorScheduling"),
    "medidata": t("tabs.medidata"),
    "booking-categories": t("tabs.bookingCategories"),
  };

  return (
    <div className="w-full px-2 py-6">
      <h1 className="text-2xl font-semibold text-slate-800">{t("title")}</h1>
      <p className="mt-1 text-sm text-slate-500">
        {t("subtitle")}
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
              {tabLabels[tab.id]}
            </button>
          ))}
        </nav>
      </div>

      {/* Tab content */}
      <div className="mt-6">
        {activeTab === "external-labs" && <ExternalLabsTab />}
        {activeTab === "doctor-scheduling" && <DoctorSchedulingTab />}
        {activeTab === "medidata" && <MediDataConnectionTab />}
        {activeTab === "booking-categories" && <BookingCategoriesTab />}
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
  const t = useTranslations("settingsPage.scheduling");
  const tc = useTranslations("settingsPage.common");
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
      setFormError(t("errorSelectDoctor"));
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
        setFormError(err.error || t("errorSave"));
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
      setFormError(t("errorSave"));
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
    return provider?.full_name || provider?.name || t("unknown");
  }

  return (
    <div className="flex gap-6 min-h-[420px]">
      {/* Left panel â€“ settings list */}
      <div className="w-80 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("panelTitle")}
          </h2>
          <button
            type="button"
            onClick={handleAddNew}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-sky-500 hover:bg-sky-50 transition-colors"
            title={t("addTitle")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        <div className="border-b border-slate-100 px-4 py-2 grid grid-cols-3 gap-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("doctorCol")}</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("intervalCol")}</span>
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("durationCol")}</span>
        </div>

        <div className="max-h-[340px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              {tc("loading")}
            </div>
          )}
          {!loading && settings.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              {t("noSettings")}
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

      {/* Right panel â€“ form */}
      <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            {t("selectPrompt")}
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {selectedId === "__new__" ? t("addHeading") : t("editHeading")}
              </h2>
              <p className="mt-1 text-xs text-slate-500">
                {t("formDesc")}
              </p>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {t("doctorLabel")}
                </label>
                <select
                  value={formProviderId}
                  onChange={(e) => setFormProviderId(e.target.value)}
                  disabled={selectedId !== "__new__" && !!selectedSetting}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none transition-colors focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30 disabled:bg-slate-50 disabled:text-slate-500"
                >
                  <option value="">{t("selectDoctor")}</option>
                  {(selectedId === "__new__" ? availableProviders : providers).map((p) => (
                    <option key={p.id} value={p.id}>
                      {(p as any).full_name || p.name || t("unnamed")}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {t("timeSlotInterval")}
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
                    {t("intervalHint", { interval: formInterval, padded: formInterval.toString().padStart(2, "0") })}
                  </p>
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {t("defaultDuration")}
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
                    {t("durationHint")}
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
                {tc("cancel")}
              </button>
              {selectedId !== "__new__" && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-lg border border-red-200 bg-white px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  {tc("delete")}
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors disabled:opacity-60"
              >
                {saving ? tc("saving") : tc("save")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ExternalLabsTab() {
  const t = useTranslations("settingsPage.labs");
  const tc = useTranslations("settingsPage.common");
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
    if (!form.name.trim()) newErrors.name = t("nameRequired");
    if (!form.url.trim()) newErrors.url = t("urlRequired");
    if (!form.username.trim()) newErrors.username = t("userNameRequired");
    if (!form.password.trim()) newErrors.password = t("passwordRequired");

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
      {/* Left panel â€“ lab list */}
      <div className="w-80 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            {t("panelTitle")}
          </h2>
          <button
            type="button"
            onClick={handleAdd}
            className="flex h-6 w-6 items-center justify-center rounded-lg text-sky-500 hover:bg-sky-50 transition-colors"
            title={t("addTitle")}
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>

        {/* Column header */}
        <div className="border-b border-slate-100 px-4 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t("nameCol")}</span>
        </div>

        {/* Lab list */}
        <div className="max-h-[340px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              {tc("loading")}
            </div>
          )}
          {!loading && labs.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              {t("noLabs")}
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
                {lab.name || tc("untitled")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Right panel â€“ form */}
      <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            {t("selectPrompt")}
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {t("configureTitle")}
              </h2>
            </div>

            <div className="flex-1 px-6 py-5 space-y-5">
              {/* External Laboratory (name display) */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {t("labLabel")}
                </label>
                <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-slate-700">
                  {form.name || tc("untitled")}
                </div>
              </div>

              {/* Type dropdown */}
              <div>
                <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                  {t("type")}
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
                    {tc("name")}
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setErrors((prev) => ({ ...prev, name: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.name ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder={t("namePlaceholder")}
                  />
                  {errors.name && <p className="mt-1 text-[11px] text-red-500">{errors.name}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {t("url")}
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
                    {t("userName")}
                  </label>
                  <input
                    type="text"
                    value={form.username}
                    onChange={(e) => { setForm((f) => ({ ...f, username: e.target.value })); setErrors((prev) => ({ ...prev, username: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.username ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder={t("usernamePlaceholder")}
                  />
                  {errors.username && <p className="mt-1 text-[11px] text-red-500">{errors.username}</p>}
                </div>
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {t("password")}
                  </label>
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => { setForm((f) => ({ ...f, password: e.target.value })); setErrors((prev) => ({ ...prev, password: undefined })); }}
                    className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-300 outline-none transition-colors ${errors.password ? "border-red-400 focus:border-red-400 focus:ring-1 focus:ring-red-400/30" : "border-slate-200 focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30"}`}
                    placeholder="â€¢â€¢â€¢â€¢â€¢â€¢â€¢â€¢"
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
                {tc("cancel")}
              </button>
              <button
                type="button"
                onClick={() => selectedId && handleDelete(selectedId)}
                className="rounded-lg border border-red-200 bg-white px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 transition-colors"
              >
                {tc("delete")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors"
              >
                {saving ? tc("saving") : tc("save")}
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
  const t = useTranslations("settingsPage.medidata");
  const tc = useTranslations("settingsPage.common");
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
        {t("loadingConfig")}
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Connection Status */}
      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t("connectionStatus")}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{t("apiIntegration")}</p>
          </div>
          <div className="flex items-center gap-2">
            <span
              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                config?.connected ? "bg-emerald-500 animate-pulse" : "bg-red-400"
              }`}
            />
            <span className={`text-xs font-medium ${config?.connected ? "text-emerald-700" : "text-red-600"}`}>
              {config?.connected ? t("connected") : t("notConnected")}
            </span>
          </div>
        </div>
        {config?.isTestMode ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
            <svg className="h-4 w-4 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-xs font-medium text-amber-700">{t("testMode")}</span>
          </div>
        ) : config?.connected ? (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2">
            <svg className="h-4 w-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-xs font-medium text-emerald-700">{t("productionMode")}</span>
          </div>
        ) : null}
      </div>

      {/* Credentials */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <h3 className="text-sm font-semibold text-slate-800">{t("credentials")}</h3>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            {t("senderGln")} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={mdSenderGln}
            onChange={(e) => setMdSenderGln(e.target.value)}
            placeholder="e.g., 7601003000115"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            {t("senderGlnHint")}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            {t("clientId")} <span className="text-red-400">*</span>
          </label>
          <input
            type="text"
            value={mdClientId}
            onChange={(e) => setMdClientId(e.target.value)}
            placeholder="e.g., 1000030720_1200011781"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            {t("clientIdHint")}
          </p>
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-medium text-slate-600">
            {t("intermediateGln")}
          </label>
          <input
            type="text"
            value="7601001304307"
            disabled
            className="w-full rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm font-mono text-slate-500"
          />
          <p className="mt-1 text-[10px] text-slate-400">
            {t("intermediateGlnHint")}
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
          {mdSaving ? tc("saving") : t("saveSettings")}
        </button>
      </div>
    </div>
  );
}



// ---------------------------------------------------------------------------
// Booking Categories & Treatments Tab
// ---------------------------------------------------------------------------

interface BookingCategory {
  id: string;
  name: string;
  description: string;
  patient_type: "new" | "existing";
  order_index: number;
  slug: string;
  enabled: boolean;
  skip_treatment: boolean;
}

interface BookingTreatment {
  id: string;
  category_id: string;
  name: string;
  description: string;
  duration_minutes: number;
  order_index: number;
  enabled: boolean;
}

interface BookingDoctor {
  id: string;
  name: string;
  specialty: string;
  image_url: string;
  description: string;
  slug: string;
  enabled: boolean;
  order_index: number;
}

function BookingCategoriesTab() {
  const t = useTranslations("settingsPage.booking");
  const tc = useTranslations("settingsPage.common");
  const [categories, setCategories] = useState<BookingCategory[]>([]);
  const [treatments, setTreatments] = useState<BookingTreatment[]>([]);
  const [doctors, setDoctors] = useState<BookingDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"new" | "existing">("new");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string | null>(null);
  const [view, setView] = useState<"categories" | "treatments" | "doctors" | "doctor-assignments" | "category-doctor-assignments">("categories");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [catRes, treatRes, docRes] = await Promise.all([
        fetch("/api/settings/booking-categories"),
        fetch("/api/settings/booking-treatments"),
        fetch("/api/settings/booking-doctors"),
      ]);
      const catData = await catRes.json();
      const treatData = await treatRes.json();
      const docData = await docRes.json();
      setCategories(catData.categories || []);
      setTreatments(treatData.treatments || []);
      setDoctors(docData.doctors || []);
    } catch (error) {
      console.error("Failed to fetch data:", error);
    } finally {
      setLoading(false);
    }
  };

  const saveCategories = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/booking-categories", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ categories }),
      });
      alert(t("categoriesSaved"));
    } catch (error) {
      alert(t("categoriesSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const saveTreatments = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/booking-treatments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ treatments }),
      });
      alert(t("treatmentsSaved"));
    } catch (error) {
      alert(t("treatmentsSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const saveDoctors = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/booking-doctors", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ doctors }),
      });
      if (!res.ok) throw new Error();
      alert(t("doctorsSaved"));
    } catch {
      alert(t("doctorsSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const addDoctor = () => {
    const newDoctor: BookingDoctor = {
      id: crypto.randomUUID(),
      name: "",
      specialty: "",
      image_url: "",
      description: "",
      slug: "",
      enabled: true,
      order_index: doctors.length,
    };
    setDoctors([...doctors, newDoctor]);
  };

  const updateDoctor = (id: string, field: keyof BookingDoctor, value: any) => {
    setDoctors(doctors.map((d) => (d.id === id ? { ...d, [field]: value } : d)));
  };

  const deleteDoctor = (id: string) => {
    if (confirm(t("confirmDeleteDoctor"))) {
      setDoctors(doctors.filter((d) => d.id !== id));
    }
  };

  const addCategory = (patientType: "new" | "existing") => {
    const newCategory: BookingCategory = {
      id: crypto.randomUUID(),
      name: "",
      description: "",
      patient_type: patientType,
      order_index: categories.filter((c) => c.patient_type === patientType).length,
      slug: "",
      enabled: true,
      skip_treatment: false,
    };
    setCategories([...categories, newCategory]);
  };

  const updateCategory = (id: string, field: keyof BookingCategory, value: any) => {
    setCategories(categories.map((cat) => (cat.id === id ? { ...cat, [field]: value } : cat)));
  };

  const deleteCategory = (id: string) => {
    if (confirm(t("confirmDeleteCategory"))) {
      setCategories(categories.filter((cat) => cat.id !== id));
      setTreatments(treatments.filter((t) => t.category_id !== id));
    }
  };

  const addTreatment = (categoryId: string) => {
    const newTreatment: BookingTreatment = {
      id: crypto.randomUUID(),
      category_id: categoryId,
      name: "",
      description: "",
      duration_minutes: 30,
      order_index: treatments.filter((t) => t.category_id === categoryId).length,
      enabled: true,
    };
    setTreatments([...treatments, newTreatment]);
  };

  const updateTreatment = (id: string, field: keyof BookingTreatment, value: any) => {
    setTreatments(treatments.map((t) => (t.id === id ? { ...t, [field]: value } : t)));
  };

  const deleteTreatment = (id: string) => {
    if (confirm(t("confirmDeleteTreatment"))) {
      setTreatments(treatments.filter((t) => t.id !== id));
    }
  };

  const filteredCategories = categories
    .filter((cat) => cat.patient_type === activeSubTab)
    .sort((a, b) => a.order_index - b.order_index);

  const selectedCategory = categories.find((c) => c.id === selectedCategoryId);
  const categoryTreatments = treatments
    .filter((t) => t.category_id === selectedCategoryId)
    .sort((a, b) => a.order_index - b.order_index);

  if (loading) {
    return <div className="py-12 text-center text-sm text-slate-400">{tc("loading")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* View Toggle */}
      <div className="flex items-center gap-4">
        <button
          onClick={() => { setView("categories"); setSelectedCategoryId(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "categories" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t("categoriesBtn")}
        </button>
        <button
          onClick={() => { setView("treatments"); setSelectedCategoryId(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "treatments" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t("treatmentsBtn")}
        </button>
        <button
          onClick={() => { setView("doctors"); setSelectedCategoryId(null); setSelectedTreatmentId(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "doctors" || view === "doctor-assignments" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          {t("doctorsBtn")}
        </button>
      </div>

      {/* Sub-tabs for patient type — hidden in Doctors/assignment views */}
      {view !== "doctors" && view !== "doctor-assignments" && view !== "category-doctor-assignments" && (
        <div className="border-b border-slate-200">
          <div className="flex space-x-8">
            <button
              onClick={() => { setActiveSubTab("new"); setSelectedCategoryId(null); }}
              className={`pb-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeSubTab === "new" ? "border-sky-500 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t("firstTimePatients")}
            </button>
            <button
              onClick={() => { setActiveSubTab("existing"); setSelectedCategoryId(null); }}
              className={`pb-3 px-1 border-b-2 text-sm font-medium transition-colors ${
                activeSubTab === "existing" ? "border-sky-500 text-sky-600" : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t("existingPatients")}
            </button>
          </div>
        </div>
      )}

      {view === "categories" ? (
        <>
          {/* Categories List */}
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="p-4 border-b flex justify-between items-center">
              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  {activeSubTab === "new" ? t("firstTimeCategories") : t("existingCategories")}
                </h3>
                <p className="text-xs text-slate-500">{t("categoriesCount", { count: filteredCategories.length })}</p>
              </div>
              <button
                onClick={() => addCategory(activeSubTab)}
                className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600"
              >
                {t("addCategory")}
              </button>
            </div>
            <div className="divide-y divide-slate-100">
              {filteredCategories.length === 0 ? (
                <div className="p-12 text-center text-xs text-slate-400">{t("noCategories")}</div>
              ) : (
                filteredCategories.map((cat) => (
                  <div key={cat.id} className="p-4 hover:bg-slate-50/50">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{tc("name")}</label>
                        <input
                          type="text"
                          value={cat.name}
                          onChange={(e) => updateCategory(cat.id, "name", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("slug")}</label>
                        <input
                          type="text"
                          value={cat.slug}
                          onChange={(e) => updateCategory(cat.id, "slug", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{tc("description")}</label>
                        <input
                          type="text"
                          value={cat.description}
                          onChange={(e) => updateCategory(cat.id, "description", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                    </div>
                    <div className="mt-3 flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={cat.enabled}
                            onChange={(e) => updateCategory(cat.id, "enabled", e.target.checked)}
                            className="w-3.5 h-3.5 text-sky-500 rounded"
                          />
                          {tc("enabled")}
                        </label>
                        <label className="flex items-center gap-2 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={cat.skip_treatment ?? false}
                            onChange={(e) => updateCategory(cat.id, "skip_treatment", e.target.checked)}
                            className="w-3.5 h-3.5 text-sky-500 rounded"
                          />
                          {t("skipTreatment")}
                        </label>
                        <span className="text-xs text-slate-400">
                          {t("treatmentsCount", { count: treatments.filter((tr) => tr.category_id === cat.id).length })}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {cat.skip_treatment && (
                          <button
                            onClick={() => { setSelectedCategoryId(cat.id); setView("category-doctor-assignments"); }}
                            className="px-3 py-1 text-xs text-violet-600 hover:bg-violet-50 rounded-lg"
                          >
                            {t("manageDoctors")}
                          </button>
                        )}
                        <button
                          onClick={() => { setSelectedCategoryId(cat.id); setView("treatments"); }}
                          className="px-3 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded-lg"
                        >
                          {t("manageTreatments")}
                        </button>
                        <button
                          onClick={() => deleteCategory(cat.id)}
                          className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                        >
                          {tc("delete")}
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={saveCategories}
              disabled={saving}
              className="px-5 py-2 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
            >
              {saving ? tc("saving") : t("saveCategories")}
            </button>
          </div>
        </>
      ) : view === "treatments" ? (
        <>
          {/* Treatments View */}
          {!selectedCategoryId ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">{t("selectCategory")}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                {filteredCategories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className="p-4 text-left border border-slate-200 rounded-xl hover:border-sky-300 hover:bg-sky-50/50 transition-colors"
                  >
                    <div className="font-medium text-sm text-slate-800">{cat.name || tc("untitled")}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {t("treatmentsCount", { count: treatments.filter((tr) => tr.category_id === cat.id).length })}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <>
              {/* Selected Category Treatments */}
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setSelectedCategoryId(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <h3 className="text-lg font-semibold text-slate-800">
                  {t("categoryTreatments", { name: selectedCategory?.name || tc("untitled") })}
                </h3>
              </div>

              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="p-4 border-b flex justify-between items-center">
                  <p className="text-xs text-slate-500">{t("treatmentsCount", { count: categoryTreatments.length })}</p>
                  <button
                    onClick={() => addTreatment(selectedCategoryId)}
                    className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600"
                  >
                    {t("addTreatment")}
                  </button>
                </div>
                <div className="divide-y divide-slate-100">
                  {categoryTreatments.length === 0 ? (
                    <div className="p-12 text-center text-xs text-slate-400">{t("noTreatments")}</div>
                  ) : (
                    categoryTreatments.map((treat, idx) => (
                      <div key={treat.id} className="p-4 hover:bg-slate-50/50">
                        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("treatmentName")}</label>
                            <input
                              type="text"
                              value={treat.name}
                              onChange={(e) => updateTreatment(treat.id, "name", e.target.value)}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                            />
                          </div>
                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">{tc("description")}</label>
                            <input
                              type="text"
                              value={treat.description || ""}
                              onChange={(e) => updateTreatment(treat.id, "description", e.target.value)}
                              placeholder={t("optionalDescription")}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("duration")}</label>
                            <input
                              type="number"
                              value={treat.duration_minutes}
                              onChange={(e) => updateTreatment(treat.id, "duration_minutes", parseInt(e.target.value) || 0)}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                            />
                          </div>
                          <div className="md:col-span-1">
                            <label className="flex items-center gap-2 text-xs text-slate-600">
                              <input
                                type="checkbox"
                                checked={treat.enabled}
                                onChange={(e) => updateTreatment(treat.id, "enabled", e.target.checked)}
                                className="w-3.5 h-3.5 text-sky-500 rounded"
                              />
                              {tc("enabled")}
                            </label>
                          </div>
                          <div className="md:col-span-2 flex justify-end gap-2">
                            <button
                              onClick={() => { setSelectedTreatmentId(treat.id); setView("doctor-assignments"); }}
                              className="px-3 py-1 text-xs text-sky-600 hover:bg-sky-50 rounded-lg"
                            >
                              {t("doctorsBtn")}
                            </button>
                            <button
                              onClick={() => deleteTreatment(treat.id)}
                              className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              {tc("delete")}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  onClick={saveTreatments}
                  disabled={saving}
                  className="px-5 py-2 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
                >
                  {saving ? tc("saving") : t("saveTreatments")}
                </button>
              </div>
            </>
          )}
        </>
      ) : view === "doctors" ? (
        <DoctorsView
          doctors={doctors}
          saving={saving}
          onAdd={addDoctor}
          onUpdate={updateDoctor}
          onDelete={deleteDoctor}
          onSave={saveDoctors}
        />
      ) : view === "doctor-assignments" && selectedTreatmentId ? (
        <DoctorAssignmentsView
          mode="treatment"
          entityId={selectedTreatmentId}
          entityName={treatments.find((tr) => tr.id === selectedTreatmentId)?.name || t("treatmentsBtn")}
          doctors={doctors}
          onBack={() => { setView("treatments"); setSelectedTreatmentId(null); }}
        />
      ) : view === "category-doctor-assignments" && selectedCategoryId ? (
        <DoctorAssignmentsView
          mode="category"
          entityId={selectedCategoryId}
          entityName={categories.find((c) => c.id === selectedCategoryId)?.name || t("categoriesBtn")}
          doctors={doctors}
          onBack={() => { setView("categories"); setSelectedCategoryId(null); }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctors View — global doctor pool management
// ---------------------------------------------------------------------------

interface DoctorsViewProps {
  doctors: BookingDoctor[];
  saving: boolean;
  onAdd: () => void;
  onUpdate: (id: string, field: keyof BookingDoctor, value: any) => void;
  onDelete: (id: string) => void;
  onSave: () => void;
}

const DOCTOR_PLACEHOLDER = (
  <svg viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
    <rect width="80" height="80" fill="#e2e8f0"/>
    <circle cx="40" cy="30" r="14" fill="#94a3b8"/>
    <ellipse cx="40" cy="68" rx="24" ry="16" fill="#94a3b8"/>
  </svg>
);

function DoctorsView({ doctors, saving, onAdd, onUpdate, onDelete, onSave }: DoctorsViewProps) {
  const t = useTranslations("settingsPage.booking");
  const tc = useTranslations("settingsPage.common");
  const [uploading, setUploading] = useState<Record<string, boolean>>({});
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleImageUpload = async (doctorId: string, file: File) => {
    setUploading((prev) => ({ ...prev, [doctorId]: true }));
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${doctorId}.${ext}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("doctor-images")
        .upload(path, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        alert(uploadError.message || "Failed to upload image.");
        return;
      }

      const { data: { publicUrl } } = supabaseClient.storage
        .from("doctor-images")
        .getPublicUrl(path);

      onUpdate(doctorId, "image_url", publicUrl);
    } catch (err) {
      console.error("Upload error:", err);
      alert("Unexpected error uploading image.");
    } finally {
      setUploading((prev) => ({ ...prev, [doctorId]: false }));
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-slate-200 bg-white">
        <div className="p-4 border-b flex justify-between items-center">
          <div>
            <h3 className="text-sm font-semibold text-slate-800">{t("bookingDoctors")}</h3>
            <p className="text-xs text-slate-500">{t("doctorsCount", { count: doctors.length })}</p>
          </div>
          <button
            onClick={onAdd}
            className="px-3 py-1.5 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600"
          >
            {t("addDoctor")}
          </button>
        </div>
        <div className="divide-y divide-slate-100">
          {doctors.length === 0 ? (
            <div className="p-12 text-center text-xs text-slate-400">{t("noDoctors")}</div>
          ) : (
            doctors.map((doc) => (
              <div key={doc.id} className="p-4 hover:bg-slate-50/50">
                <div className="flex gap-4 items-start">
                  {/* Photo column */}
                  <div className="flex-shrink-0 flex flex-col items-center gap-1.5">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
                      {doc.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={doc.image_url}
                          alt={doc.name}
                          className="w-full h-full object-cover object-top"
                        />
                      ) : (
                        DOCTOR_PLACEHOLDER
                      )}
                    </div>
                    {/* Hidden file input */}
                    <input
                      ref={(el) => { fileInputRefs.current[doc.id] = el; }}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleImageUpload(doc.id, file);
                        e.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRefs.current[doc.id]?.click()}
                      disabled={uploading[doc.id]}
                      className="text-[10px] text-sky-600 hover:text-sky-700 disabled:text-slate-400 leading-tight text-center"
                    >
                      {uploading[doc.id] ? t("uploading") : doc.image_url ? t("change") : t("upload")}
                    </button>
                  </div>

                  {/* Fields */}
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{tc("name")}</label>
                        <input
                          type="text"
                          value={doc.name}
                          onChange={(e) => onUpdate(doc.id, "name", e.target.value)}
                          placeholder={t("namePlaceholder")}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("specialty")}</label>
                        <input
                          type="text"
                          value={doc.specialty}
                          onChange={(e) => onUpdate(doc.id, "specialty", e.target.value)}
                          placeholder={t("specialtyPlaceholder")}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("slugUrlKey")}</label>
                        <input
                          type="text"
                          value={doc.slug}
                          onChange={(e) => onUpdate(doc.id, "slug", e.target.value)}
                          placeholder={t("slugPlaceholder")}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-medium text-slate-500 mb-1">{tc("description")}</label>
                      <input
                        type="text"
                        value={doc.description}
                        onChange={(e) => onUpdate(doc.id, "description", e.target.value)}
                        placeholder={t("descPlaceholder")}
                        className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                      />
                    </div>
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-1.5 text-xs text-slate-600">
                        <input
                          type="checkbox"
                          checked={doc.enabled}
                          onChange={(e) => onUpdate(doc.id, "enabled", e.target.checked)}
                          className="w-3.5 h-3.5 text-sky-500 rounded"
                        />
                        {tc("enabled")}
                      </label>
                      <button
                        onClick={() => onDelete(doc.id)}
                        className="px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        {tc("delete")}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
        >
          {saving ? tc("saving") : t("saveDoctors")}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Doctor Assignments View — assign doctors to a specific treatment
// ---------------------------------------------------------------------------

interface DoctorAssignmentsViewProps {
  mode: "treatment" | "category";
  entityId: string;
  entityName: string;
  doctors: BookingDoctor[];
  onBack: () => void;
}

function DoctorAssignmentsView({ mode, entityId, entityName, doctors, onBack }: DoctorAssignmentsViewProps) {
  const t = useTranslations("settingsPage.booking");
  const tc = useTranslations("settingsPage.common");
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const param = mode === "treatment" ? `treatment_id=${entityId}` : `category_id=${entityId}`;
    fetch(`/api/settings/booking-doctor-assignments?${param}`)
      .then((r) => r.json())
      .then((data) => {
        setAssignedIds(new Set(data.doctor_ids || []));
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [mode, entityId]);

  const toggle = (doctorId: string) => {
    setAssignedIds((prev) => {
      const next = new Set(prev);
      if (next.has(doctorId)) next.delete(doctorId);
      else next.add(doctorId);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = mode === "treatment"
        ? { treatment_id: entityId, doctor_ids: [...assignedIds] }
        : { category_id: entityId, doctor_ids: [...assignedIds] };
      const res = await fetch("/api/settings/booking-doctor-assignments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error();
      alert(t("assignmentsSaved"));
    } catch {
      alert(t("assignmentsSaveFailed"));
    } finally {
      setSaving(false);
    }
  };

  const label = mode === "category" ? t("category") : t("treatment");

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div>
          <h3 className="text-lg font-semibold text-slate-800">{t("assignDoctorsTitle", { name: entityName })}</h3>
          <p className="text-xs text-slate-500">
            {t("assignDoctorsDesc", { label })}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="p-12 text-center text-xs text-slate-400">{tc("loading")}</div>
        ) : doctors.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-400">
            {t("noDoctorsConfigured")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {doctors.map((doc) => (
              <label key={doc.id} className="flex items-center gap-4 p-4 hover:bg-slate-50/50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignedIds.has(doc.id)}
                  onChange={() => toggle(doc.id)}
                  className="w-4 h-4 text-sky-500 rounded"
                />
                {doc.image_url && (
                  <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 flex-shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={doc.image_url} alt={doc.name} className="w-full h-full object-cover object-top" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-slate-800">{doc.name}</div>
                  <div className="text-xs text-slate-500">{doc.specialty}</div>
                </div>
                {!doc.enabled && (
                  <span className="text-[10px] text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">{t("disabled")}</span>
                )}
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          {assignedIds.size === 0
            ? t("noSelectionHint", { label })
            : t("doctorsSelected", { count: assignedIds.size })}
        </p>
        <button
          onClick={save}
          disabled={saving || loading}
          className="px-5 py-2 bg-sky-500 text-white rounded-lg text-xs font-medium hover:bg-sky-600 disabled:opacity-50"
        >
          {saving ? tc("saving") : t("saveAssignments")}
        </button>
      </div>
    </div>
  );
}
