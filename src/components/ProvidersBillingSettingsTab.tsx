"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type ProviderRole = "billing_entity" | "doctor" | "nurse" | "technician";

type LinkedUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  designation: string | null;
};

type ProviderRecord = {
  id: string;
  name: string | null;
  role: ProviderRole;
  specialty: string | null;
  qual_dignities: string[] | null;
  email: string | null;
  phone: string | null;
  gln: string | null;
  zsr: string | null;
  salutation: string | null;
  title: string | null;
  street: string | null;
  street_no: string | null;
  zip_code: string | null;
  city: string | null;
  canton: string | null;
  vatuid: string | null;
  iban: string | null;
  created_at?: string | null;
  linked_user: LinkedUser | null;
};

type PlatformUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  designation: string | null;
  provider_id: string | null;
};

type ProviderForm = {
  name: string;
  role: ProviderRole;
  specialty: string;
  qual_dignities: string;
  email: string;
  phone: string;
  gln: string;
  zsr: string;
  salutation: string;
  title: string;
  street: string;
  street_no: string;
  zip_code: string;
  city: string;
  canton: string;
  vatuid: string;
  iban: string;
  linked_user_id: string;
};

const EMPTY_FORM: ProviderForm = {
  name: "",
  role: "doctor",
  specialty: "",
  qual_dignities: "",
  email: "",
  phone: "",
  gln: "",
  zsr: "",
  salutation: "",
  title: "",
  street: "",
  street_no: "",
  zip_code: "",
  city: "",
  canton: "",
  vatuid: "",
  iban: "",
  linked_user_id: "",
};

const ROLE_OPTIONS: Array<{ value: ProviderRole; label: string }> = [
  { value: "doctor", label: "Doctor" },
  { value: "nurse", label: "Nurse" },
  { value: "technician", label: "Technician" },
  { value: "billing_entity", label: "Billing Entity" },
];

function mapProviderToForm(provider: ProviderRecord): ProviderForm {
  return {
    name: provider.name || "",
    role: provider.role,
    specialty: provider.specialty || "",
    qual_dignities:
      provider.qual_dignities && provider.qual_dignities.length > 0
        ? provider.qual_dignities.join(", ")
        : "",
    email: provider.email || "",
    phone: provider.phone || "",
    gln: provider.gln || "",
    zsr: provider.zsr || "",
    salutation: provider.salutation || "",
    title: provider.title || "",
    street: provider.street || "",
    street_no: provider.street_no || "",
    zip_code: provider.zip_code || "",
    city: provider.city || "",
    canton: provider.canton || "",
    vatuid: provider.vatuid || "",
    iban: provider.iban || "",
    linked_user_id: provider.linked_user?.id || "",
  };
}

function DignityTagInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const tags = value
    ? value
        .split(/[\s,]+/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  function addTag(raw: string) {
    const code = raw.trim().toUpperCase();
    if (!code) return;
    if (!tags.includes(code)) {
      onChange([...tags, code].join(", "));
    }
    setInput("");
  }

  function removeTag(code: string) {
    onChange(tags.filter((t) => t !== code).join(", "));
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addTag(input);
    } else if (e.key === "Backspace" && input === "" && tags.length > 0) {
      removeTag(tags[tags.length - 1]);
    }
  }

  return (
    <div>
      <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400">
        Specialty Codes (FMH Dignity)
      </label>
      <div
        onClick={() => inputRef.current?.focus()}
        className="flex min-h-[38px] w-full cursor-text flex-wrap gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 outline-none focus-within:border-sky-400 focus-within:ring-1 focus-within:ring-sky-400/30"
      >
        {tags.map((tag) => (
          <span
            key={tag}
            className="flex items-center gap-1 rounded-md bg-sky-100 px-2 py-0.5 font-mono text-xs font-semibold text-sky-800"
          >
            {tag}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                removeTag(tag);
              }}
              className="ml-0.5 leading-none text-sky-500 hover:text-sky-700"
            >
              ×
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => {
            if (input.trim()) addTag(input);
          }}
          placeholder={tags.length === 0 ? "Type a code and press Enter (e.g. 2000)" : ""}
          className="min-w-[140px] flex-1 bg-transparent font-mono text-sm text-slate-800 outline-none placeholder:text-slate-300"
        />
      </div>
      <p className="mt-1 text-[10px] text-slate-400">
        Required — Swiss FMH qualitative dignity codes for Sumex/TARDOC. Press{" "}
        <kbd className="rounded border border-slate-200 px-1 font-sans">Enter</kbd> or{" "}
        <kbd className="rounded border border-slate-200 px-1 font-sans">,</kbd> to add each code.
        Common codes: <code className="font-mono">2000</code> (General),{" "}
        <code className="font-mono">1301</code> (Plastic surgery).
      </p>
    </div>
  );
}

export default function ProvidersBillingSettingsTab() {
  const [providers, setProviders] = useState<ProviderRecord[]>([]);
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [form, setForm] = useState<ProviderForm>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  const [filterRole, setFilterRole] = useState<ProviderRole | "all">("all");

  const selectedProvider = providers.find((provider) => provider.id === selectedId) ?? null;

  useEffect(() => {
    async function load() {
      try {
        const [providersRes, usersRes] = await Promise.all([
          fetch("/api/settings/providers"),
          fetch("/api/users/list"),
        ]);

        if (providersRes.ok) {
          const data = await providersRes.json();
          setProviders(Array.isArray(data.providers) ? data.providers : []);
        }

        if (usersRes.ok) {
          const data = await usersRes.json();
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (error) {
        console.error("Failed to load providers settings:", error);
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, []);

  const filteredProviders = useMemo(() => {
    return providers.filter((provider) => filterRole === "all" || provider.role === filterRole);
  }, [providers, filterRole]);

  const availableUsers = useMemo(() => {
    return users.filter((user) => !user.provider_id || user.provider_id === selectedProvider?.id);
  }, [users, selectedProvider?.id]);

  function handleSelect(provider: ProviderRecord) {
    setSelectedId(provider.id);
    setForm(mapProviderToForm(provider));
    setFormError(null);
  }

  function handleAdd(role: ProviderRole) {
    setSelectedId("__new__");
    setForm({ ...EMPTY_FORM, role });
    setFormError(null);
  }

  function updateForm<K extends keyof ProviderForm>(key: K, value: ProviderForm[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave() {
    if (!form.name.trim()) {
      setFormError("Name is required.");
      return;
    }

    if (!form.qual_dignities.trim()) {
      setFormError(
        "Specialty Codes (FMH Dignity) are required. Enter at least one code (e.g. 2000).",
      );
      return;
    }

    if ((form.role === "doctor" || form.role === "billing_entity") && !form.gln.trim()) {
      setFormError("GLN is required for doctors and billing entities.");
      return;
    }

    if (form.role === "billing_entity" && !form.iban.trim()) {
      setFormError("IBAN is required for billing entities.");
      return;
    }

    setSaving(true);
    setFormError(null);

    try {
      const res = await fetch("/api/settings/providers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: selectedId && selectedId !== "__new__" ? selectedId : undefined,
          ...form,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to save provider.");
        return;
      }

      const saved = data.provider as ProviderRecord;
      setProviders((prev) => {
        const existingIndex = prev.findIndex((item) => item.id === saved.id);
        if (existingIndex >= 0) {
          const next = [...prev];
          next[existingIndex] = saved;
          return next.sort((a, b) =>
            `${a.role}-${a.name || ""}`.localeCompare(`${b.role}-${b.name || ""}`),
          );
        }
        return [...prev, saved].sort((a, b) =>
          `${a.role}-${a.name || ""}`.localeCompare(`${b.role}-${b.name || ""}`),
        );
      });
      setUsers((prev) =>
        prev.map((user) => ({
          ...user,
          provider_id:
            user.id === saved.linked_user?.id
              ? saved.id
              : user.provider_id === saved.id
                ? null
                : user.provider_id,
        })),
      );
      setSelectedId(saved.id);
      setForm(mapProviderToForm(saved));
    } catch {
      setFormError("Failed to save provider.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedProvider || selectedId === "__new__") return;

    setSaving(true);
    setFormError(null);
    try {
      const res = await fetch(`/api/settings/providers?id=${selectedProvider.id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (!res.ok) {
        setFormError(data.error || "Failed to delete provider.");
        return;
      }

      setProviders((prev) => prev.filter((provider) => provider.id !== selectedProvider.id));
      setUsers((prev) =>
        prev.map((user) =>
          user.provider_id === selectedProvider.id ? { ...user, provider_id: null } : user,
        ),
      );
      setSelectedId(null);
      setForm(EMPTY_FORM);
    } catch {
      setFormError("Failed to delete provider.");
    } finally {
      setSaving(false);
    }
  }

  const roleHelpText =
    form.role === "billing_entity"
      ? "Billing entities are clinics or companies used as the biller on invoices."
      : "Medical staff records are used for scheduling, invoices, and provider metadata.";

  const inputCls =
    "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400/30";
  const labelCls = "mb-1.5 block text-[11px] font-medium uppercase tracking-wide text-slate-400";

  return (
    <div className="flex min-h-[520px] gap-6">
      {/* Sidebar */}
      <div className="w-96 shrink-0 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200/80 px-4 py-3">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Providers &amp; Billing
            </h2>
            <p className="mt-1 text-[11px] text-slate-400">
              Manage staff providers and billing entities.
            </p>
          </div>
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => handleAdd("doctor")}
              className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-50"
            >
              + Staff
            </button>
            <button
              type="button"
              onClick={() => handleAdd("billing_entity")}
              className="rounded-lg bg-sky-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-600"
            >
              + Billing
            </button>
          </div>
        </div>

        <div className="border-b border-slate-100 px-4 py-3">
          <select
            value={filterRole}
            onChange={(e) => setFilterRole(e.target.value as ProviderRole | "all")}
            className={inputCls}
          >
            <option value="all">All roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role.value} value={role.value}>
                {role.label}
              </option>
            ))}
          </select>
        </div>

        <div className="max-h-[430px] overflow-y-auto">
          {loading && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">Loading…</div>
          )}
          {!loading && filteredProviders.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-400">
              No providers found for this filter.
            </div>
          )}
          {filteredProviders.map((provider) => (
            <div
              key={provider.id}
              onClick={() => handleSelect(provider)}
              className={`cursor-pointer border-b border-slate-100/60 px-4 py-3 transition-colors ${
                selectedId === provider.id ? "bg-sky-50/60" : "hover:bg-slate-50/80"
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {provider.name || "Unnamed"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {ROLE_OPTIONS.find((role) => role.value === provider.role)?.label}
                    {provider.linked_user?.full_name
                      ? ` · ${provider.linked_user.full_name}`
                      : ""}
                  </p>
                </div>
                <div className="shrink-0 text-[10px] text-slate-400">
                  {provider.gln || "No GLN"}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail panel */}
      <div className="flex-1 rounded-2xl border border-slate-200/80 bg-white/80 shadow-sm">
        {!selectedId ? (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            Select a provider or create a new staff provider / billing entity.
          </div>
        ) : (
          <div className="flex h-full flex-col">
            <div className="border-b border-slate-200/80 px-6 py-4">
              <h2 className="text-sm font-semibold text-slate-800">
                {selectedId === "__new__"
                  ? "Add Provider or Billing Entity"
                  : "Edit Provider or Billing Entity"}
              </h2>
              <p className="mt-1 text-xs text-slate-500">{roleHelpText}</p>
            </div>

            <div className="flex-1 space-y-5 px-6 py-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Role</label>
                  <select
                    value={form.role}
                    onChange={(e) => updateForm("role", e.target.value as ProviderRole)}
                    className={inputCls}
                  >
                    {ROLE_OPTIONS.map((role) => (
                      <option key={role.value} value={role.value}>
                        {role.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Linked User</label>
                  <select
                    value={form.linked_user_id}
                    onChange={(e) => updateForm("linked_user_id", e.target.value)}
                    className={inputCls}
                  >
                    <option value="">No linked user</option>
                    {availableUsers.map((user) => (
                      <option key={user.id} value={user.id}>
                        {user.full_name || user.email || user.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Name</label>
                  <input
                    value={form.name}
                    onChange={(e) => updateForm("name", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Specialty</label>
                  <input
                    value={form.specialty}
                    onChange={(e) => updateForm("specialty", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <DignityTagInput
                value={form.qual_dignities}
                onChange={(v) => updateForm("qual_dignities", v)}
              />

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelCls}>Salutation</label>
                  <input
                    value={form.salutation}
                    onChange={(e) => updateForm("salutation", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Title</label>
                  <input
                    value={form.title}
                    onChange={(e) => updateForm("title", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Canton</label>
                  <input
                    value={form.canton}
                    onChange={(e) => updateForm("canton", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>Email</label>
                  <input
                    value={form.email}
                    onChange={(e) => updateForm("email", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Phone</label>
                  <input
                    value={form.phone}
                    onChange={(e) => updateForm("phone", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                <div>
                  <label className={labelCls}>GLN</label>
                  <input
                    value={form.gln}
                    onChange={(e) => updateForm("gln", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>ZSR</label>
                  <input
                    value={form.zsr}
                    onChange={(e) => updateForm("zsr", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>IBAN</label>
                  <input
                    value={form.iban}
                    onChange={(e) => updateForm("iban", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="md:col-span-2">
                  <label className={labelCls}>Street</label>
                  <input
                    value={form.street}
                    onChange={(e) => updateForm("street", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>Street No</label>
                  <input
                    value={form.street_no}
                    onChange={(e) => updateForm("street_no", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>ZIP Code</label>
                  <input
                    value={form.zip_code}
                    onChange={(e) => updateForm("zip_code", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <div>
                  <label className={labelCls}>City</label>
                  <input
                    value={form.city}
                    onChange={(e) => updateForm("city", e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className={labelCls}>VAT UID</label>
                  <input
                    value={form.vatuid}
                    onChange={(e) => updateForm("vatuid", e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>

              {formError && <p className="text-[11px] text-red-500">{formError}</p>}
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-slate-200/80 px-6 py-3">
              <button
                type="button"
                onClick={() => {
                  setSelectedId(null);
                  setFormError(null);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-lg border border-slate-200 bg-white px-4 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              {selectedId !== "__new__" && selectedProvider && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="rounded-lg border border-red-200 bg-white px-4 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  Delete
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-sky-500 px-4 py-1.5 text-xs font-medium text-white hover:bg-sky-600 disabled:opacity-60"
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
