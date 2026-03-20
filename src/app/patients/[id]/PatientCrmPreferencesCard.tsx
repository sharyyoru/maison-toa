"use client";

import { useEffect, useState, ChangeEvent } from "react";
import Image from "next/image";
import { supabaseClient } from "@/lib/supabaseClient";

type PatientRecord = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  avatar_url: string | null;
  language_preference: string | null;
  clinic_preference: string | null;
  lifecycle_stage: string | null;
  contact_owner_name: string | null;
  contact_owner_email: string | null;
};

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type ServiceOption = {
  id: string;
  name: string;
};

const LANGUAGE_OPTIONS = [
  "English",
  "French",
  "German",
  "Italian",
  "Arabic",
  "Other",
];

const CLINIC_OPTIONS = [
  "Rhône",
  "Champel",
  "Gstaad",
  "Montreux",
];

const LIFECYCLE_OPTIONS = [
  "Request for information",
  "New lead",
  "Contacted",
  "Qualified",
  "Active patient",
  "Inactive",
];

export default function PatientCrmPreferencesCard({
  patient,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patient: any;
}) {
  const basePatient = patient as PatientRecord;

  const [avatarUrl, setAvatarUrl] = useState<string | null>(
    basePatient.avatar_url ?? null,
  );
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);
  const [avatarSuccess, setAvatarSuccess] = useState<string | null>(null);

  const [language, setLanguage] = useState<string>(
    basePatient.language_preference ?? "",
  );
  const [clinic, setClinic] = useState<string>(
    basePatient.clinic_preference ?? "",
  );
  const [lifecycle, setLifecycle] = useState<string>(
    basePatient.lifecycle_stage ?? "",
  );

  const [ownerName, setOwnerName] = useState<string | null>(
    basePatient.contact_owner_name,
  );
  const [ownerEmail, setOwnerEmail] = useState<string | null>(
    basePatient.contact_owner_email,
  );

  const [currentUserName, setCurrentUserName] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);

  const [savingPrefs, setSavingPrefs] = useState(false);
  const [prefsStatus, setPrefsStatus] = useState<string | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);

  const [userOptions, setUserOptions] = useState<PlatformUser[]>([]);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      const { data, error } = await supabaseClient.auth.getUser();
      if (!isMounted) return;
      if (error || !data.user) return;

      const user = data.user;
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const fullName = [first, last].filter(Boolean).join(" ") || user.email || "";

      setCurrentUserName(fullName || null);
      setCurrentUserEmail(user.email ?? null);
    }

    loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      try {
        // First get the Hubspot category
        const { data: categoryData, error: categoryError } = await supabaseClient
          .from("service_categories")
          .select("id")
          .eq("name", "Hubspot")
          .single();

        if (!isMounted) return;

        if (categoryError || !categoryData) {
          setServiceOptions([]);
          return;
        }

        // Then get services from Hubspot category only
        const { data, error } = await supabaseClient
          .from("services")
          .select("id, name")
          .eq("category_id", categoryData.id)
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (error || !data) {
          setServiceOptions([]);
          return;
        }

        setServiceOptions(data as ServiceOption[]);
      } catch {
        if (!isMounted) return;
        setServiceOptions([]);
      }
    }

    loadServices();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadUsers() {
      try {
        const response = await fetch("/api/users/list");
        if (!response.ok) return;
        const json = (await response.json()) as PlatformUser[];
        if (!isMounted) return;
        setUserOptions(json);
      } catch {
        // ignore fetch errors for now
      }
    }

    loadUsers();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleAvatarChange(event: ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];

    try {
      setAvatarUploading(true);
      setAvatarError(null);
      setAvatarSuccess(null);

      const ext = file.name.split(".").pop() || "png";
      const path = `${basePatient.id}/${Date.now()}.${ext}`;

      const { error: uploadError } = await supabaseClient.storage
        .from("patient-avatars")
        .upload(path, file, { upsert: true });

      if (uploadError) {
        setAvatarError(
          uploadError.message ||
            "Failed to upload photo. Ensure a 'patient-avatars' bucket exists in Supabase Storage.",
        );
        return;
      }

      const {
        data: { publicUrl },
      } = supabaseClient.storage.from("patient-avatars").getPublicUrl(path);

      const { error: updateError } = await supabaseClient
        .from("patients")
        .update({ avatar_url: publicUrl })
        .eq("id", basePatient.id);

      if (updateError) {
        setAvatarError(updateError.message);
        return;
      }

      setAvatarUrl(publicUrl);
      setAvatarSuccess("Patient photo updated.");
    } catch {
      setAvatarError("Unexpected error uploading photo.");
    } finally {
      setAvatarUploading(false);
    }
  }

  async function savePreferences(partial: Partial<PatientRecord>) {
    setSavingPrefs(true);
    setPrefsError(null);
    setPrefsStatus(null);

    const { error } = await supabaseClient
      .from("patients")
      .update(partial)
      .eq("id", basePatient.id);

    if (error) {
      setPrefsError(error.message);
      setSavingPrefs(false);
      return;
    }

    setSavingPrefs(false);
    setPrefsStatus("Saved");
    setTimeout(() => setPrefsStatus(null), 2000);
  }

  function handleLanguageChange(value: string) {
    setLanguage(value);
    savePreferences({ language_preference: value || null } as Partial<PatientRecord>);
  }

  function handleClinicChange(value: string) {
    setClinic(value);
    savePreferences({ clinic_preference: value || null } as Partial<PatientRecord>);
  }

  function handleLifecycleChange(value: string) {
    setLifecycle(value);
    savePreferences({ lifecycle_stage: value || null } as Partial<PatientRecord>);
  }

  function handleServiceSearchChange(value: string) {
    setServiceSearch(value);
    setServiceDropdownOpen(value.trim().length > 0);
  }

  function handleServiceSelect(serviceName: string) {
    setLifecycle(serviceName);
    setServiceSearch(serviceName);
    setServiceDropdownOpen(false);
    savePreferences({ lifecycle_stage: serviceName || null } as Partial<PatientRecord>);
  }

  function handleServiceClear() {
    setLifecycle("");
    setServiceSearch("");
    setServiceDropdownOpen(false);
    savePreferences({ lifecycle_stage: null } as Partial<PatientRecord>);
  }

  async function handleAssignToMe() {
    if (!currentUserEmail && !currentUserName) return;

    const nextName = currentUserName ?? null;
    const nextEmail = currentUserEmail ?? null;

    setOwnerName(nextName);
    setOwnerEmail(nextEmail);
    await savePreferences({
      contact_owner_name: nextName,
      contact_owner_email: nextEmail,
    } as Partial<PatientRecord>);
  }

  const ownerDisplay = ownerName || ownerEmail || "Unassigned";

   function handleOwnerChange(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
      setOwnerName(null);
      setOwnerEmail(null);
      savePreferences({
        contact_owner_name: null,
        contact_owner_email: null,
      } as Partial<PatientRecord>);
      return;
    }

    const selected = userOptions.find((u) => (u.email ?? "").trim() === trimmed);
    const nextName = selected?.full_name || trimmed;

    setOwnerName(nextName);
    setOwnerEmail(trimmed);
    savePreferences({
      contact_owner_name: nextName,
      contact_owner_email: trimmed,
    } as Partial<PatientRecord>);
  }

  function handleCopyPatientId(value?: string | null) {
    const text = (value ?? "").toString().trim();
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).catch(() => {
      // ignore clipboard errors
    });
  }

  return (
    <div className="flex h-full flex-col space-y-4 rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="flex flex-col gap-4 text-[11px] sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col items-start gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-50 text-xs font-medium text-slate-600">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={`${basePatient.first_name} ${basePatient.last_name}` || "Patient"}
                  width={56}
                  height={56}
                  className="h-full w-full object-cover"
                />
              ) : (
                <span>{basePatient.first_name?.charAt(0) || "P"}</span>
              )}
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-slate-900">Profile photo</p>
              <label
                className={`inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 ${
                  avatarUploading ? "cursor-not-allowed opacity-60 hover:bg-white" : "cursor-pointer"
                }`}
              >
                <span>{avatarUploading ? "Uploading..." : "Upload"}</span>
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarChange}
                  disabled={avatarUploading}
                />
              </label>
            </div>
          </div>

          <div className="w-full border-t border-slate-100 pt-3">
            <p className="font-medium text-slate-500">Contact owner</p>
            <select
              value={ownerEmail ?? ""}
              onChange={(event) => handleOwnerChange(event.target.value)}
              className="mt-1 block w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Unassigned</option>
              {(Array.isArray(userOptions) ? userOptions : []).map((user) => {
                const display = user.full_name || user.email || "Unnamed user";
                const value = user.email ?? "";
                if (!value) return null;
                return (
                  <option key={user.id} value={value}>
                    {display}
                  </option>
                );
              })}
            </select>
            <p className="mt-0.5 text-[10px] text-slate-400">
              Currently: {ownerDisplay}
            </p>
            {prefsError ? (
              <p className="mt-1 text-[11px] text-red-600">{prefsError}</p>
            ) : null}
            {prefsStatus && !prefsError ? (
              <p className="mt-1 text-[11px] text-emerald-600">{prefsStatus}</p>
            ) : null}
          </div>
        </div>

        <div className="flex-1 space-y-2 sm:max-w-[260px]">
          <div className="space-y-1">
            <p className="font-medium text-slate-500">Language preference:</p>
            <select
              value={language}
              onChange={(event) => handleLanguageChange(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select</option>
              {(Array.isArray(LANGUAGE_OPTIONS) ? LANGUAGE_OPTIONS : []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-slate-500">Clinic preference:</p>
            <select
              value={clinic}
              onChange={(event) => handleClinicChange(event.target.value)}
              className="block w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">Select</option>
              {(Array.isArray(CLINIC_OPTIONS) ? CLINIC_OPTIONS : []).map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <p className="font-medium text-slate-500">Service interest:</p>
            <div className="relative">
              <input
                type="text"
                value={serviceSearch || (lifecycle && lifecycle !== "request for information" ? lifecycle : "")}
                onChange={(event) => handleServiceSearchChange(event.target.value)}
                placeholder={lifecycle && lifecycle !== "request for information" ? lifecycle : "Search for a Service"}
                className="block w-full rounded-lg border border-slate-200 bg-white/90 px-2.5 py-1.5 pr-8 text-[11px] text-slate-900 shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {(serviceSearch || lifecycle) && (
                <button
                  type="button"
                  onClick={handleServiceClear}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  ×
                </button>
              )}
              {serviceDropdownOpen && (() => {
                const query = serviceSearch.trim().toLowerCase();
                const filteredServices = serviceOptions
                  .filter((s) => {
                    const hay = (s.name || "").toLowerCase();
                    return hay.includes(query);
                  })
                  .slice(0, 6);

                if (filteredServices.length === 0) return null;

                return (
                  <div className="absolute top-full left-0 right-0 mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white text-[10px] shadow-lg z-10">
                    {filteredServices.map((service) => (
                      <button
                        key={service.id}
                        type="button"
                        onClick={() => handleServiceSelect(service.name)}
                        className="block w-full cursor-pointer px-2 py-1 text-left text-slate-700 hover:bg-slate-50"
                      >
                        {service.name}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      </div>
      {avatarError ? (
        <p className="text-[11px] text-red-600">{avatarError}</p>
      ) : null}
      {avatarSuccess ? (
        <p className="text-[11px] text-emerald-600">{avatarSuccess}</p>
      ) : null}

      <div className="mt-auto rounded-xl crm-id-strip px-3 py-2 text-[11px] text-white shadow-[0_10px_25px_rgba(16,185,129,0.45)]">
        <div className="flex items-center justify-between gap-2">
          <div className="space-y-0.5">
            <p className="text-[10px] font-medium uppercase tracking-wide opacity-80">
              Patient ID
            </p>
            <p className="font-medium break-all">{basePatient.id}</p>
          </div>
          <button
            type="button"
            onClick={() => handleCopyPatientId(basePatient.id)}
            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-200/80 bg-emerald-500/40 text-white hover:bg-emerald-400/70"
            aria-label="Copy patient ID"
          >
            <svg
              className="h-3.5 w-3.5"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
            >
              <rect x="4" y="4" width="9" height="9" rx="1.5" />
              <path d="M8 8h5.5A1.5 1.5 0 0 1 15 9.5V15" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
