"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";

const TABS = [
  { id: "external-labs", label: "External Labs" },
  { id: "doctor-scheduling", label: "Doctor Scheduling" },
  { id: "calendar-defaults", label: "Calendar Defaults" },
  { id: "blocked-dates", label: "Blocked Dates" },
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
    "calendar-defaults": t("tabs.calendarDefaults"),
    "blocked-dates": t("tabs.blockedDates"),
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
        {activeTab === "calendar-defaults" && <CalendarDefaultsTab />}
        {activeTab === "blocked-dates" && <BlockedDatesTab />}
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

function CalendarDefaultsTab() {
  // Each entry: { providerId: string (providers table), name: string }
  const [staffList, setStaffList] = useState<{ providerId: string; name: string }[]>([]);
  const [defaultIds, setDefaultIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3000);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    async function load() {
      try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        const token = session?.access_token;
        const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

        const [defaultsRes, usersRes] = await Promise.all([
          fetch("/api/settings/calendar-defaults", { headers: authHeaders }),
          fetch("/api/users/list"),
        ]);

        if (defaultsRes.ok) {
          const data = await defaultsRes.json();
          setDefaultIds((data.defaults || []).map((d: any) => d.provider_id as string));
        }
        if (usersRes.ok) {
          const data: any[] = await usersRes.json();
          // Only show users that have a linked provider_id (i.e. they appear on the calendar)
          const mapped = (Array.isArray(data) ? data : [])
            .filter((u) => u.provider_id)
            .map((u) => ({
              providerId: u.provider_id as string,
              name: (u.full_name || u.email || "Unnamed") as string,
            }));
          setStaffList(mapped);
        }
      } catch (err) {
        console.error("Failed to load calendar defaults:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  function toggleProvider(id: string) {
    setDefaultIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: { session } } = await supabaseClient.auth.getSession();
      const token = session?.access_token;
      const res = await fetch("/api/settings/calendar-defaults", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ provider_ids: defaultIds }),
      });
      if (res.ok) {
        setToast({ type: "success", message: "Calendar defaults saved." });
      } else {
        const err = await res.json().catch(() => ({}));
        setToast({ type: "error", message: err.error || "Failed to save." });
      }
    } catch {
      setToast({ type: "error", message: "Failed to save." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="max-w-xl rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
      {/* Toast — portalled to body to escape overflow:hidden ancestors */}
      {toast && typeof document !== "undefined" && createPortal(
        <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
          toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
        }`}>
          {toast.message}
        </div>,
        document.body
      )}

      <div className="border-b border-slate-200/80 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-800">Default Calendars</h2>
        <p className="mt-1 text-xs text-slate-500">
          Choose which calendars open by default for your account. If none are selected, your own calendar opens by default.
        </p>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <p className="text-xs text-slate-400">Loading…</p>
        ) : staffList.length === 0 ? (
          <p className="text-xs text-slate-400">No staff members found.</p>
        ) : (
          <div className="space-y-1">
            {staffList.map((s) => (
              <label
                key={s.providerId}
                className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={defaultIds.includes(s.providerId)}
                  onChange={() => toggleProvider(s.providerId)}
                  className="h-4 w-4 rounded border-slate-300 accent-sky-500"
                />
                <span className="text-sm text-slate-700">{s.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between border-t border-slate-200/80 px-6 py-3">
        <span className="text-xs text-slate-400">
          {defaultIds.length === 0
            ? "No defaults set — your own calendar opens by default."
            : `${defaultIds.length} calendar${defaultIds.length !== 1 ? "s" : ""} selected.`}
        </span>
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || loading}
          className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-600 transition-colors disabled:opacity-60"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

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
  name_en: string | null;
  description: string;
  description_en: string | null;
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
  name_en: string | null;
  description: string;
  description_en: string | null;
  duration_minutes: number;
  order_index: number;
  enabled: boolean;
  prepayment_required: boolean;
  linked_service_id: string | null;
}

interface ServiceOption {
  id: string;
  name: string;
  base_price: number | null;
  category_name: string | null;
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

function ServicePicker({
  services,
  value,
  onChange,
}: {
  services: ServiceOption[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const selected = services.find((s) => s.id === value) ?? null;
  const filtered = query.trim()
    ? services.filter((s) =>
        s.name.toLowerCase().includes(query.toLowerCase()) ||
        (s.category_name ?? "").toLowerCase().includes(query.toLowerCase())
      )
    : services;

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-center gap-3 flex-wrap">
      <span className="text-xs text-slate-500">Linked service:</span>
      <div ref={ref} className="relative">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs border border-slate-200 rounded-lg bg-white hover:border-amber-300 focus:ring-1 focus:ring-amber-400 outline-none w-72 text-left"
        >
          {selected ? (
            <div className="flex-1 min-w-0">
              <div className="truncate font-medium text-slate-800">{selected.name}</div>
              {selected.category_name && (
                <div className="text-[10px] text-sky-600 mt-0.5">{selected.category_name}</div>
              )}
            </div>
          ) : (
            <span className="text-slate-400 flex-1">— select service —</span>
          )}
          <svg className="w-3.5 h-3.5 text-slate-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {open && (
          <div className="absolute z-50 mt-1 w-96 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            <div className="p-2 border-b border-slate-100">
              <input
                autoFocus
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search services..."
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:ring-1 focus:ring-amber-400 outline-none"
              />
            </div>
            <div className="max-h-64 overflow-y-auto">
              {value && (
                <button
                  type="button"
                  onClick={() => { onChange(null); setOpen(false); setQuery(""); }}
                  className="w-full px-3 py-2 text-left text-xs text-red-500 hover:bg-red-50 border-b border-slate-100"
                >
                  ✕ Clear selection
                </button>
              )}
              {filtered.length === 0 ? (
                <div className="px-3 py-4 text-xs text-slate-400 text-center">No services found</div>
              ) : (
                filtered.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => { onChange(s.id); setOpen(false); setQuery(""); }}
                    className={`w-full px-3 py-2.5 text-left hover:bg-amber-50 flex items-center gap-3 ${s.id === value ? "bg-amber-50" : ""}`}
                  >
                    {s.id === value && (
                      <svg className="w-3 h-3 text-amber-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    )}
                    {s.id !== value && <div className="w-3 shrink-0" />}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-slate-800 truncate">{s.name}</div>
                      {s.category_name && (
                        <div className="text-[10px] text-sky-600 mt-0.5">{s.category_name}</div>
                      )}
                    </div>
                    {s.base_price != null && (
                      <div className="shrink-0 text-right">
                        <div className="text-xs font-semibold text-slate-700">CHF {s.base_price}</div>
                        <div className="text-[10px] text-amber-600">50% = {(s.base_price * 0.5).toFixed(2)}</div>
                      </div>
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {selected?.base_price != null && (
        <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200 rounded-lg">
          <svg className="w-3.5 h-3.5 text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-xs text-amber-700">
            Full: <strong>CHF {selected.base_price}</strong> · Deposit: <strong>CHF {(selected.base_price * 0.5).toFixed(2)}</strong>
          </span>
        </div>
      )}
    </div>
  );
}

function BookingCategoriesTab() {
  const t = useTranslations("settingsPage.booking");
  const tc = useTranslations("settingsPage.common");
  const [categories, setCategories] = useState<BookingCategory[]>([]);
  const [treatments, setTreatments] = useState<BookingTreatment[]>([]);
  const [doctors, setDoctors] = useState<BookingDoctor[]>([]);
  const [services, setServices] = useState<ServiceOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<"new" | "existing">("new");
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<string | null>(null);
  const [view, setView] = useState<"categories" | "treatments" | "doctors" | "doctor-assignments" | "category-doctor-assignments" | "machines">("categories");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [catRes, treatRes, docRes, servRes] = await Promise.all([
        fetch("/api/settings/booking-categories"),
        fetch("/api/settings/booking-treatments"),
        fetch("/api/settings/booking-doctors"),
        fetch("/api/services?active=true"),
      ]);
      const catData = await catRes.json();
      const treatData = await treatRes.json();
      const docData = await docRes.json();
      const servData = await servRes.json();
      setCategories(catData.categories || []);
      setTreatments(treatData.treatments || []);
      setDoctors(docData.doctors || []);
      setServices(servData.services || []);
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
      name_en: "",
      description: "",
      description_en: "",
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
      name_en: "",
      description: "",
      description_en: "",
      duration_minutes: 30,
      order_index: treatments.filter((t) => t.category_id === categoryId).length,
      enabled: true,
      prepayment_required: false,
      linked_service_id: null,
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
        <button
          onClick={() => { setView("machines"); setSelectedCategoryId(null); setSelectedTreatmentId(null); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
            view === "machines" ? "bg-sky-500 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
          }`}
        >
          Machines
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
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("nameDefault")}</label>
                        <input
                          type="text"
                          value={cat.name}
                          onChange={(e) => updateCategory(cat.id, "name", e.target.value)}
                          className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("nameEnglish")}</label>
                        <input
                          type="text"
                          value={cat.name_en || ""}
                          onChange={(e) => updateCategory(cat.id, "name_en", e.target.value)}
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
                      <div className="md:col-span-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("descriptionEnglish")}</label>
                          <input
                            type="text"
                            value={cat.description_en || ""}
                            onChange={(e) => updateCategory(cat.id, "description_en", e.target.value)}
                            className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                          />
                        </div>
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
                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("treatmentName")}</label>
                            <input
                              type="text"
                              value={treat.name}
                              onChange={(e) => updateTreatment(treat.id, "name", e.target.value)}
                              className="w-full px-2.5 py-1.5 text-sm border border-slate-200 rounded-lg focus:ring-1 focus:ring-sky-400 outline-none"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("treatmentNameEnglish")}</label>
                            <input
                              type="text"
                              value={treat.name_en || ""}
                              onChange={(e) => updateTreatment(treat.id, "name_en", e.target.value)}
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
                          <div className="md:col-span-4">
                            <label className="block text-[10px] font-medium text-slate-500 mb-1">{t("descriptionEnglish")}</label>
                            <input
                              type="text"
                              value={treat.description_en || ""}
                              onChange={(e) => updateTreatment(treat.id, "description_en", e.target.value)}
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
                          <div className="md:col-span-12 flex justify-end gap-2">
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
                        {/* Prepayment row */}
                        <div className="mt-3 flex flex-wrap items-center gap-4">
                          <label className="flex items-center gap-2 text-xs text-slate-600">
                            <input
                              type="checkbox"
                              checked={treat.prepayment_required ?? false}
                              onChange={(e) => updateTreatment(treat.id, "prepayment_required", e.target.checked)}
                              className="w-3.5 h-3.5 text-amber-500 rounded"
                            />
                            <span className="font-medium text-amber-700">50% deposit required</span>
                          </label>
                          {treat.prepayment_required && (
                            <ServicePicker
                              services={services}
                              value={treat.linked_service_id ?? null}
                              onChange={(id) => updateTreatment(treat.id, "linked_service_id", id)}
                            />
                          )}
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
      ) : view === "machines" ? (
        <MachinesView services={services} />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Machines View
// ---------------------------------------------------------------------------

interface Machine {
  id: string;
  name: string;
  max_concurrent: number;
  is_active: boolean;
}

interface ServiceMachineMapping {
  id: string;
  service_id: string;
  machine_id: string;
}

function MachinesView({ services }: { services: { id: string; name: string; category_name: string | null }[] }) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [mappings, setMappings] = useState<ServiceMachineMapping[]>([]);
  const [bookingTreatments, setBookingTreatments] = useState<{ id: string; name: string; machine_id: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editMax, setEditMax] = useState(1);
  const [newName, setNewName] = useState("");
  const [newMax, setNewMax] = useState(1);
  const [saving, setSaving] = useState(false);
  const [serviceSearch, setServiceSearch] = useState("");

  const supabase = supabaseClient;

  async function loadData() {
    setLoading(true);
    const [{ data: m }, { data: sm }, { data: bt }] = await Promise.all([
      supabase.from("machines").select("*").order("name"),
      supabase.from("service_machines").select("*"),
      supabase.from("booking_treatments").select("id, name, machine_id").eq("enabled", true).order("name"),
    ]);
    setMachines(m || []);
    setMappings(sm || []);
    setBookingTreatments(bt || []);
    setLoading(false);
  }

  useEffect(() => { loadData(); }, []);

  async function handleAdd() {
    if (!newName.trim()) return;
    setSaving(true);
    await supabase.from("machines").insert({ name: newName.trim(), max_concurrent: newMax });
    setNewName("");
    setNewMax(1);
    await loadData();
    setSaving(false);
  }

  async function handleSaveEdit(id: string) {
    setSaving(true);
    await supabase.from("machines").update({ name: editName, max_concurrent: editMax }).eq("id", id);
    setEditingId(null);
    await loadData();
    setSaving(false);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this machine? Service mappings will also be removed.")) return;
    await supabase.from("machines").delete().eq("id", id);
    await loadData();
  }

  async function handleToggleService(machineId: string, serviceId: string) {
    const existing = mappings.find((m) => m.machine_id === machineId && m.service_id === serviceId);
    if (existing) {
      await supabase.from("service_machines").delete().eq("id", existing.id);
      setMappings((prev) => prev.filter((m) => m.id !== existing.id));
    } else {
      const { data } = await supabase.from("service_machines").insert({ machine_id: machineId, service_id: serviceId }).select().single();
      if (data) setMappings((prev) => [...prev, data]);
    }
  }

  async function handleToggleBookingTreatment(machineId: string, treatmentId: string) {
    const bt = bookingTreatments.find((t) => t.id === treatmentId);
    if (!bt) return;
    const newMachineId = bt.machine_id === machineId ? null : machineId;
    await supabase.from("booking_treatments").update({ machine_id: newMachineId }).eq("id", treatmentId);
    setBookingTreatments((prev) => prev.map((t) => t.id === treatmentId ? { ...t, machine_id: newMachineId } : t));
  }

  const filteredServices = services.filter((s) =>
    s.name.toLowerCase().includes(serviceSearch.toLowerCase())
  );

  if (loading) return <div className="text-sm text-slate-500">Loading machines...</div>;

  return (
    <div className="space-y-4">
      {/* Add new machine */}
      <div className="flex items-end gap-2">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Machine Name</label>
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. HIFU" className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Max Concurrent</label>
          <input type="number" min={1} value={newMax} onChange={(e) => setNewMax(Number(e.target.value))} className="w-16 rounded-lg border border-slate-200 px-2 py-1.5 text-sm" />
        </div>
        <button onClick={handleAdd} disabled={saving || !newName.trim()} className="rounded-lg bg-sky-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-600 disabled:opacity-50">
          Add
        </button>
      </div>

      {/* Machine list */}
      <div className="space-y-3">
        {machines.map((machine) => {
          const linkedServices = mappings.filter((m) => m.machine_id === machine.id);
          const isEditing = editingId === machine.id;

          return (
            <div key={machine.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                {isEditing ? (
                  <div className="flex items-center gap-2">
                    <input value={editName} onChange={(e) => setEditName(e.target.value)} className="rounded border border-slate-200 px-2 py-1 text-sm font-semibold" />
                    <input type="number" min={1} value={editMax} onChange={(e) => setEditMax(Number(e.target.value))} className="w-14 rounded border border-slate-200 px-2 py-1 text-sm" />
                    <button onClick={() => handleSaveEdit(machine.id)} className="text-xs text-sky-600 font-medium">Save</button>
                    <button onClick={() => setEditingId(null)} className="text-xs text-slate-400">Cancel</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h3 className="font-semibold text-sm text-slate-900">{machine.name}</h3>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">max {machine.max_concurrent}</span>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  {!isEditing && (
                    <button onClick={() => { setEditingId(machine.id); setEditName(machine.name); setEditMax(machine.max_concurrent); }} className="text-xs text-slate-500 hover:text-sky-600">Edit</button>
                  )}
                  <button onClick={() => handleDelete(machine.id)} className="text-xs text-red-400 hover:text-red-600">Delete</button>
                </div>
              </div>

              {/* Linked services - grouped by category */}
              <div className="mt-2">
                <p className="text-[10px] font-medium text-slate-500 mb-1">{linkedServices.length} service(s) linked</p>
                {(() => {
                  const grouped: Record<string, { id: string; service_id: string; name: string }[]> = {};
                  linkedServices.forEach((ls) => {
                    const svc = services.find((s) => s.id === ls.service_id);
                    const cat = svc?.category_name || "Uncategorized";
                    if (!grouped[cat]) grouped[cat] = [];
                    grouped[cat].push({ id: ls.id, service_id: ls.service_id, name: svc?.name || "Unknown" });
                  });
                  const catColors = ["bg-sky-100 text-sky-800", "bg-violet-100 text-violet-800", "bg-emerald-100 text-emerald-800", "bg-amber-100 text-amber-800", "bg-rose-100 text-rose-800", "bg-teal-100 text-teal-800"];
                  return Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([cat, svcs], idx) => (
                    <div key={cat} className="mb-2">
                      <div className={`inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold mb-1 ${catColors[idx % catColors.length]}`}>{cat} ({svcs.length})</div>
                      <div className="ml-2 space-y-0.5">
                        {svcs.map((s) => (
                          <div key={s.id} className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-600">{s.name}</span>
                            <button onClick={() => handleToggleService(machine.id, s.service_id)} className="text-red-400 hover:text-red-600 text-sm leading-none px-1">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
                {/* Linked booking treatments */}
                {(() => {
                  const linkedBt = bookingTreatments.filter((bt) => bt.machine_id === machine.id);
                  if (linkedBt.length === 0) return null;
                  return (
                    <div className="mb-2">
                      <div className="inline-block rounded-md px-2 py-0.5 text-[10px] font-semibold mb-1 bg-violet-100 text-violet-800">Booking Treatments ({linkedBt.length})</div>
                      <div className="ml-2 space-y-0.5">
                        {linkedBt.map((bt) => (
                          <div key={bt.id} className="flex items-center justify-between">
                            <span className="text-[10px] text-slate-600">{bt.name}</span>
                            <button onClick={() => handleToggleBookingTreatment(machine.id, bt.id)} className="text-red-400 hover:text-red-600 text-sm leading-none px-1">×</button>
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
                {/* Add service - grouped by category */}
                <details className="text-xs mt-2">
                  <summary className="cursor-pointer text-sky-600 hover:text-sky-700 font-medium">+ Assign services</summary>
                  <div className="mt-2 space-y-1">
                    <input value={serviceSearch} onChange={(e) => setServiceSearch(e.target.value)} placeholder="Search services..." className="w-full rounded border border-slate-200 px-2 py-1 text-xs" />
                    <div className="max-h-52 overflow-y-auto">
                      {(() => {
                        const catGroups: Record<string, typeof filteredServices> = {};
                        filteredServices.forEach((svc) => {
                          const cat = svc.category_name || "Uncategorized";
                          if (!catGroups[cat]) catGroups[cat] = [];
                          catGroups[cat].push(svc);
                        });
                        return Object.entries(catGroups).sort(([a], [b]) => a.localeCompare(b)).map(([cat, svcs]) => (
                          <details key={cat} className="mb-1">
                            <summary className="cursor-pointer text-[10px] font-semibold text-slate-600 hover:text-slate-800 py-0.5">{cat}</summary>
                            <div className="ml-3 space-y-0.5">
                              {svcs.map((svc) => {
                                const isLinked = linkedServices.some((ls) => ls.service_id === svc.id);
                                return (
                                  <label key={svc.id} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                                    <input type="checkbox" checked={isLinked} onChange={() => handleToggleService(machine.id, svc.id)} className="h-3 w-3 rounded border-slate-300" />
                                    <span className={`text-[10px] ${isLinked ? "text-sky-700 font-medium" : "text-slate-600"}`}>{svc.name}</span>
                                  </label>
                                );
                              })}
                            </div>
                          </details>
                        ));
                      })()}
                    </div>
                  </div>
                </details>
                {/* Booking treatments linked to this machine */}
                <details className="text-xs mt-2">
                  <summary className="cursor-pointer text-violet-600 hover:text-violet-700 font-medium">+ Assign booking treatments (public page)</summary>
                  <div className="mt-2 max-h-40 overflow-y-auto space-y-0.5">
                    {bookingTreatments.map((bt) => (
                      <label key={bt.id} className="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-50 rounded cursor-pointer">
                        <input type="checkbox" checked={bt.machine_id === machine.id} onChange={() => handleToggleBookingTreatment(machine.id, bt.id)} className="h-3 w-3 rounded border-slate-300" />
                        <span className={`text-[10px] ${bt.machine_id === machine.id ? "text-violet-700 font-medium" : "text-slate-600"}`}>{bt.name}</span>
                      </label>
                    ))}
                  </div>
                </details>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

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

// ---------------------------------------------------------------------------
// Blocked Dates Tab
// ---------------------------------------------------------------------------

interface BlockedDate {
  id: string;
  blocked_date: string;
  reason: string | null;
  created_at: string;
}

function BlockedDatesTab() {
  const t = useTranslations("settingsPage");
  const [blockedDates, setBlockedDates] = useState<BlockedDate[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newDate, setNewDate] = useState("");
  const [newReason, setNewReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadBlockedDates() {
      try {
        const res = await fetch("/api/settings/blocked-dates");
        if (res.ok) {
          const data = await res.json();
          setBlockedDates(data.blockedDates || []);
        }
      } catch (err) {
        console.error("Failed to load blocked dates:", err);
      } finally {
        setLoading(false);
      }
    }
    loadBlockedDates();
  }, []);

  async function handleAddDate() {
    if (!newDate) {
      setError("Please select a date to block.");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const res = await fetch("/api/settings/blocked-dates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          blocked_date: newDate,
          reason: newReason || null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Failed to add blocked date.");
        return;
      }

      const data = await res.json();
      setBlockedDates((prev) => [...prev, data.blockedDate].sort((a, b) =>
        a.blocked_date.localeCompare(b.blocked_date)
      ));
      setNewDate("");
      setNewReason("");
    } catch (err) {
      setError("Failed to add blocked date.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteDate(id: string) {
    setSaving(true);
    try {
      await fetch(`/api/settings/blocked-dates?id=${id}`, { method: "DELETE" });
      setBlockedDates((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      console.error("Failed to delete blocked date:", err);
    } finally {
      setSaving(false);
    }
  }

  function formatDate(dateStr: string): string {
    const date = new Date(dateStr + "T12:00:00");
    return date.toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  }

  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="max-w-3xl space-y-6">
      {/* Add new blocked date */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-slate-800">{t("blockedDates.blockTitle")}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {t("blockedDates.blockDescription")}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              {t("blockedDates.dateLabel")} <span className="text-red-400">*</span>
            </label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              min={today}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-slate-600">
              {t("blockedDates.reasonLabel")}
            </label>
            <input
              type="text"
              value={newReason}
              onChange={(e) => setNewReason(e.target.value)}
              placeholder={t("blockedDates.reasonPlaceholder")}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>
        </div>

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex justify-end">
          <button
            onClick={handleAddDate}
            disabled={saving || !newDate}
            className="rounded-lg bg-sky-500 px-4 py-2 text-xs font-medium text-white hover:bg-sky-600 transition-colors disabled:opacity-50"
          >
            {saving ? t("blockedDates.adding") : t("blockedDates.addButton")}
          </button>
        </div>
      </div>

      {/* List of blocked dates */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="border-b border-slate-200 px-5 py-3">
          <h3 className="text-sm font-semibold text-slate-800">{t("blockedDates.listTitle")}</h3>
        </div>

        {loading ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">
            {t("blockedDates.loading")}
          </div>
        ) : blockedDates.length === 0 ? (
          <div className="px-5 py-8 text-center text-xs text-slate-400">
            {t("blockedDates.noDates")}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {blockedDates.map((bd) => (
              <div key={bd.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="text-sm font-medium text-slate-800">
                    {formatDate(bd.blocked_date)}
                  </div>
                  {bd.reason && (
                    <div className="text-xs text-slate-500 mt-0.5">{bd.reason}</div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteDate(bd.id)}
                  disabled={saving}
                  className="px-3 py-1 text-xs font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                >
                  {t("blockedDates.remove")}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
