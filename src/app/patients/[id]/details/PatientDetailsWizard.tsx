"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type PatientRecord = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  gender: string | null;
  dob: string | null;
  marital_status: string | null;
  nationality: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  profession: string | null;
  current_employer: string | null;
  source: string | null;
};

type InsuranceRecord = {
  id: string;
  patient_id: string;
  provider_name: string | null;
  card_number: string | null;
  insurance_type: string | null;
  insurer_id: string | null;
  gln: string | null;
  avs_number: string | null;
  policy_number: string | null;
  law_type: string | null;
  billing_type: string | null;
  case_number: string | null;
  accident_date: string | null;
  is_primary: boolean | null;
  created_at: string;
};

type SwissInsurer = {
  id: string;
  name: string;
  gln: string;
};

export default function PatientDetailsWizard({
  patientId,
  initialStep = 2,
  mode = "page",
  onClose,
}: {
  patientId: string;
  initialStep?: 1 | 2;
  mode?: "page" | "modal";
  onClose?: () => void;
}) {
  const router = useRouter();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [step, setStep] = useState<1 | 2 | 3>(initialStep);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [insurances, setInsurances] = useState<InsuranceRecord[]>([]);
  const [swissInsurers, setSwissInsurers] = useState<SwissInsurer[]>([]);
  const [showAddInsurance, setShowAddInsurance] = useState(false);
  const [savingInsurance, setSavingInsurance] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const isEditMode = mode === "modal";
  const totalSteps = isEditMode ? 3 : 2;

  useEffect(() => {
    let isMounted = true;

    async function loadPatient() {
      setLoading(true);
      const { data, error } = await supabaseClient
        .from("patients")
        .select(
          "id, first_name, last_name, email, phone, gender, dob, marital_status, nationality, street_address, postal_code, town, profession, current_employer, source",
        )
        .eq("id", patientId)
        .single();

      if (!isMounted) return;

      if (error || !data) {
        setError(error?.message ?? "Patient not found.");
        setLoading(false);
        return;
      }

      setPatient(data as PatientRecord);
      setLoading(false);
    }

    loadPatient();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  useEffect(() => {
    if (!isEditMode) return;

    async function loadInsurances() {
      const { data } = await supabaseClient
        .from("patient_insurances")
        .select("*")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false });
      if (data) setInsurances(data as InsuranceRecord[]);
    }

    async function loadSwissInsurers() {
      const { data } = await supabaseClient
        .from("swiss_insurers")
        .select("id, name, gln")
        .eq("is_active", true)
        .order("name");
      if (data) setSwissInsurers(data as SwissInsurer[]);
    }

    loadInsurances();
    loadSwissInsurers();
  }, [patientId, isEditMode]);

  async function handlePrimaryDetailsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;

    const formData = new FormData(event.currentTarget);

    const firstName = (formData.get("first_name") as string | null)?.trim();
    const lastName = (formData.get("last_name") as string | null)?.trim();
    const emailRaw = (formData.get("email") as string | null)?.trim() || null;
    const phone = (formData.get("phone") as string | null)?.trim() || null;
    if (!firstName || !lastName || !emailRaw || !phone) {
      setError("First name, last name, email, and phone are required.");
      return;
    }

    const email = emailRaw.toLowerCase();

    const updatePayload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
    };

    setSaving(true);
    setError(null);

    const { data: existing, error: existingError } = await supabaseClient
      .from("patients")
      .select("id")
      .ilike("email", email)
      .neq("id", patient.id)
      .limit(1)
      .maybeSingle();

    if (!existingError && existing) {
      setError("Another patient with this email already exists.");
      setSaving(false);
      return;
    }

    const { error } = await supabaseClient
      .from("patients")
      .update(updatePayload)
      .eq("id", patient.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setPatient((prev) =>
      prev
        ? {
            ...prev,
            first_name: firstName,
            last_name: lastName,
            email,
            phone,
          }
        : prev,
    );

    setSaving(false);
    setStep(2);
    setError(null);
  }

  async function handleSecondaryDetailsSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    if (!patient) return;

    const formData = new FormData(event.currentTarget);

    const gender =
      (formData.get("gender") as string | null)?.trim().toLowerCase() || null;
    const sourceRaw =
      (formData.get("source") as string | null)?.trim().toLowerCase() || null;
    const maritalStatus =
      (formData.get("marital_status") as string | null)?.trim() || null;
    const nationality =
      (formData.get("nationality") as string | null)?.trim() || "";
    const profession =
      (formData.get("profession") as string | null)?.trim() || "";
    const currentEmployer =
      (formData.get("current_employer") as string | null)?.trim() || "";

    // Address fields
    const streetAddress =
      (formData.get("street_address") as string | null)?.trim() || null;
    const postalCode =
      (formData.get("postal_code") as string | null)?.trim() || null;
    const town =
      (formData.get("town") as string | null)?.trim() || null;

    if (
      !nationality ||
      !profession ||
      !currentEmployer
    ) {
      setError("Please fill in all required fields.");
      return;
    }

    setSaving(true);
    setError(null);

    const updatePayload: Record<string, unknown> = {
      nationality,
      profession,
      current_employer: currentEmployer,
      street_address: streetAddress,
      postal_code: postalCode,
      town: town,
    };

    if (gender) {
      updatePayload.gender = gender;
    }

    if (sourceRaw) {
      updatePayload.source = sourceRaw;
    }

    if (maritalStatus) {
      updatePayload.marital_status = maritalStatus;
    }

    const { error } = await supabaseClient
      .from("patients")
      .update(updatePayload)
      .eq("id", patient.id);

    if (error) {
      setError(error.message);
      setSaving(false);
      return;
    }

    setSaving(false);

    if (isEditMode) {
      setStep(3);
      setError(null);
    } else if (onClose) {
      onClose();
    } else {
      router.push("/patients");
    }
  }

  async function handleAddInsurance(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!patient) return;

    const formData = new FormData(event.currentTarget);
    const providerName = (formData.get("provider_name") as string | null)?.trim() || null;
    const cardNumber = (formData.get("card_number") as string | null)?.trim() || null;
    const insuranceType = (formData.get("insurance_type") as string | null)?.trim() || null;
    const policyNumber = (formData.get("policy_number") as string | null)?.trim() || null;
    const lawType = (formData.get("law_type") as string | null)?.trim() || null;
    const billingType = (formData.get("billing_type") as string | null)?.trim() || null;
    const avsNumber = (formData.get("avs_number") as string | null)?.trim() || null;
    const caseNumber = (formData.get("case_number") as string | null)?.trim() || null;
    const accidentDate = (formData.get("accident_date") as string | null)?.trim() || null;
    const insurerId = (formData.get("insurer_id") as string | null)?.trim() || null;
    const isPrimary = formData.get("is_primary") === "on";

    if (!providerName) {
      setError("Insurance provider name is required.");
      return;
    }

    setSavingInsurance(true);
    setError(null);

    const payload: Record<string, unknown> = {
      patient_id: patient.id,
      provider_name: providerName,
      card_number: cardNumber,
      insurance_type: insuranceType,
      policy_number: policyNumber,
      law_type: lawType || null,
      billing_type: billingType || null,
      avs_number: avsNumber,
      case_number: caseNumber,
      accident_date: accidentDate || null,
      insurer_id: insurerId || null,
      is_primary: isPrimary,
    };

    const { data, error } = await supabaseClient
      .from("patient_insurances")
      .insert(payload)
      .select("*")
      .single();

    if (error) {
      setError(error.message);
      setSavingInsurance(false);
      return;
    }

    if (data) {
      setInsurances((prev) => [data as InsuranceRecord, ...prev]);
    }

    setSavingInsurance(false);
    setShowAddInsurance(false);
  }

  async function handleDeleteInsurance(id: string) {
    setDeletingId(id);
    const { error } = await supabaseClient
      .from("patient_insurances")
      .delete()
      .eq("id", id);

    if (error) {
      setError(error.message);
    } else {
      setInsurances((prev) => prev.filter((ins) => ins.id !== id));
    }
    setDeletingId(null);
  }

  if (loading) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white/80 p-4 text-sm text-slate-600 shadow-sm">
        Loading patient details...
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 shadow-sm">
        {error || "Patient not found."}
      </div>
    );
  }

  let stepTitle = "";
  let stepDescription = "";

  if (step === 1) {
    stepTitle = "Contact details";
    stepDescription = "Edit primary contact information for this patient.";
  } else if (step === 2) {
    stepTitle = "Secondary details";
    stepDescription =
      "Complete the patient profile with background details.";
  } else {
    stepTitle = "Insurance details";
    stepDescription = "Manage insurance information for this patient.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
            Step {step} of {totalSteps}
          </p>
          <h2 className="text-base font-semibold text-slate-900">{stepTitle}</h2>
          <p className="text-xs text-slate-500">{stepDescription}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            if (mode === "modal" && onClose) {
              onClose();
            } else {
              router.push("/patients");
            }
          }}
          className="text-xs font-medium text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
        >
          {mode === "modal" ? "Close" : "Skip for now"}
        </button>
      </div>

      <div key={step} className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm font-medium text-slate-900">
              {patient.first_name} {patient.last_name}
            </div>
            <div className="text-xs text-slate-500">
              {patient.email || "No email"} • {patient.phone || "No phone"}
            </div>
          </div>
        </div>

        {error ? (
          <p className="mb-3 text-xs text-red-600">{error}</p>
        ) : null}

        {step === 1 ? (
          <form onSubmit={handlePrimaryDetailsSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="first_name"
                  className="block text-xs font-medium text-slate-700"
                >
                  First name <span className="text-red-500">*</span>
                </label>
                <input
                  id="first_name"
                  name="first_name"
                  type="text"
                  defaultValue={patient.first_name}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="last_name"
                  className="block text-xs font-medium text-slate-700"
                >
                  Last name <span className="text-red-500">*</span>
                </label>
                <input
                  id="last_name"
                  name="last_name"
                  type="text"
                  defaultValue={patient.last_name}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="email"
                  className="block text-xs font-medium text-slate-700"
                >
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  defaultValue={patient.email ?? ""}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="phone"
                  className="block text-xs font-medium text-slate-700"
                >
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={patient.phone ?? ""}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)] backdrop-blur hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : "Next: Secondary details"}
              </button>
            </div>
          </form>
        ) : step === 2 ? (
          <form onSubmit={handleSecondaryDetailsSubmit} className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <label
                  htmlFor="gender"
                  className="block text-xs font-medium text-slate-700"
                >
                  Gender
                </label>
                <select
                  id="gender"
                  name="gender"
                  defaultValue={patient.gender ?? ""}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Select</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="source"
                  className="block text-xs font-medium text-slate-700"
                >
                  Patient source
                </label>
                <select
                  id="source"
                  name="source"
                  defaultValue={patient.source ?? "manual"}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="manual">Manual</option>
                  <option value="event">Event</option>
                  <option value="meta">Meta</option>
                  <option value="google">Google</option>
                </select>
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
              <div className="space-y-1">
                <label
                  htmlFor="marital_status"
                  className="block text-xs font-medium text-slate-700"
                >
                  Marital status
                </label>
                <select
                  id="marital_status"
                  name="marital_status"
                  defaultValue={patient.marital_status ?? ""}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Select</option>
                  <option value="single">Single</option>
                  <option value="married">Married</option>
                  <option value="divorced">Divorced</option>
                  <option value="widowed">Widowed</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="nationality"
                  className="block text-xs font-medium text-slate-700"
                >
                  Nationality <span className="text-red-500">*</span>
                </label>
                <input
                  id="nationality"
                  name="nationality"
                  type="text"
                  defaultValue={patient.nationality ?? ""}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium text-slate-700 border-b border-slate-200 pb-1">
                Address Information
              </div>
              <div className="space-y-1">
                <label
                  htmlFor="street_address"
                  className="block text-xs font-medium text-slate-700"
                >
                  Street address
                </label>
                <input
                  id="street_address"
                  name="street_address"
                  type="text"
                  defaultValue={patient.street_address ?? ""}
                  className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  placeholder="123 Main Street"
                />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="postal_code"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Postal code
                  </label>
                  <input
                    id="postal_code"
                    name="postal_code"
                    type="text"
                    defaultValue={patient.postal_code ?? ""}
                    className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="1208"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="town"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Town/City
                  </label>
                  <input
                    id="town"
                    name="town"
                    type="text"
                    defaultValue={patient.town ?? ""}
                    className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="Genève"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <div className="text-xs font-medium text-slate-700 border-b border-slate-200 pb-1">
                Professional Information
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1">
                  <label
                    htmlFor="profession"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Profession <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="profession"
                    name="profession"
                    type="text"
                    defaultValue={patient.profession ?? ""}
                    className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <label
                    htmlFor="current_employer"
                    className="block text-xs font-medium text-slate-700"
                  >
                    Current employer <span className="text-red-500">*</span>
                  </label>
                  <input
                    id="current_employer"
                    name="current_employer"
                    type="text"
                    defaultValue={patient.current_employer ?? ""}
                    className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)] backdrop-blur hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? "Saving..." : isEditMode ? "Next: Insurance" : "Finish"}
              </button>
            </div>
          </form>
        ) : (
          <div className="space-y-4">
            {insurances.length === 0 && !showAddInsurance ? (
              <p className="text-xs text-slate-500">No insurance records found for this patient.</p>
            ) : null}

            {insurances.map((ins) => (
              <div
                key={ins.id}
                className="rounded-lg border border-slate-200 bg-slate-50/60 p-3 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-slate-900">
                        {ins.provider_name || "Unknown provider"}
                      </span>
                      {ins.is_primary ? (
                        <span className="rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-medium text-sky-700">
                          Primary
                        </span>
                      ) : null}
                      {ins.law_type ? (
                        <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          {ins.law_type}
                        </span>
                      ) : null}
                    </div>
                    <div className="grid grid-cols-2 gap-x-6 gap-y-0.5 text-slate-600">
                      {ins.policy_number ? <span>Policy: {ins.policy_number}</span> : null}
                      {ins.card_number ? <span>Card: {ins.card_number}</span> : null}
                      {ins.insurance_type ? <span>Type: {ins.insurance_type}</span> : null}
                      {ins.billing_type ? <span>Billing: {ins.billing_type === "TG" ? "Tiers Garant" : "Tiers Payant"}</span> : null}
                      {ins.avs_number ? <span>AVS: {ins.avs_number}</span> : null}
                      {ins.case_number ? <span>Case: {ins.case_number}</span> : null}
                      {ins.accident_date ? <span>Accident: {ins.accident_date}</span> : null}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleDeleteInsurance(ins.id)}
                    disabled={deletingId === ins.id}
                    className="shrink-0 rounded-md px-2 py-1 text-[10px] font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                  >
                    {deletingId === ins.id ? "..." : "Remove"}
                  </button>
                </div>
              </div>
            ))}

            {showAddInsurance ? (
              <form
                onSubmit={handleAddInsurance}
                className="space-y-3 rounded-lg border border-sky-200 bg-sky-50/40 p-3"
              >
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ins_provider_name" className="block text-xs font-medium text-slate-700">
                      Provider name <span className="text-red-500">*</span>
                    </label>
                    {swissInsurers.length > 0 ? (
                      <select
                        id="ins_insurer_id"
                        name="insurer_id"
                        onChange={(e) => {
                          const selected = swissInsurers.find((s) => s.id === e.target.value);
                          const nameInput = document.getElementById("ins_provider_name") as HTMLInputElement | null;
                          if (nameInput && selected) nameInput.value = selected.name;
                        }}
                        className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      >
                        <option value="">Select insurer (optional)</option>
                        {swissInsurers.map((ins) => (
                          <option key={ins.id} value={ins.id}>
                            {ins.name} ({ins.gln})
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <input
                      id="ins_provider_name"
                      name="provider_name"
                      type="text"
                      placeholder="Insurance provider name"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ins_policy_number" className="block text-xs font-medium text-slate-700">
                      Policy number
                    </label>
                    <input
                      id="ins_policy_number"
                      name="policy_number"
                      type="text"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-1">
                    <label htmlFor="ins_card_number" className="block text-xs font-medium text-slate-700">
                      Card number
                    </label>
                    <input
                      id="ins_card_number"
                      name="card_number"
                      type="text"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ins_insurance_type" className="block text-xs font-medium text-slate-700">
                      Insurance type
                    </label>
                    <select
                      id="ins_insurance_type"
                      name="insurance_type"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">Select</option>
                      <option value="basic">Basic</option>
                      <option value="supplementary">Supplementary</option>
                      <option value="private">Private</option>
                      <option value="semi-private">Semi-private</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ins_law_type" className="block text-xs font-medium text-slate-700">
                      Law type
                    </label>
                    <select
                      id="ins_law_type"
                      name="law_type"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">Select</option>
                      <option value="KVG">KVG</option>
                      <option value="UVG">UVG</option>
                      <option value="IVG">IVG</option>
                      <option value="MVG">MVG</option>
                      <option value="VVG">VVG</option>
                    </select>
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ins_billing_type" className="block text-xs font-medium text-slate-700">
                      Billing type
                    </label>
                    <select
                      id="ins_billing_type"
                      name="billing_type"
                      defaultValue="TG"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="TG">Tiers Garant (TG)</option>
                      <option value="TP">Tiers Payant (TP)</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ins_avs_number" className="block text-xs font-medium text-slate-700">
                      AVS number
                    </label>
                    <input
                      id="ins_avs_number"
                      name="avs_number"
                      type="text"
                      placeholder="756.XXXX.XXXX.XX"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1">
                    <label htmlFor="ins_case_number" className="block text-xs font-medium text-slate-700">
                      Case number
                    </label>
                    <input
                      id="ins_case_number"
                      name="case_number"
                      type="text"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label htmlFor="ins_accident_date" className="block text-xs font-medium text-slate-700">
                      Accident date
                    </label>
                    <input
                      id="ins_accident_date"
                      name="accident_date"
                      type="date"
                      className="block w-full rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-xs text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    id="ins_is_primary"
                    name="is_primary"
                    type="checkbox"
                    className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                  />
                  <label htmlFor="ins_is_primary" className="text-xs text-slate-700">
                    Primary insurance
                  </label>
                </div>

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAddInsurance(false); setError(null); }}
                    className="rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={savingInsurance}
                    className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingInsurance ? "Saving..." : "Add insurance"}
                  </button>
                </div>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddInsurance(true)}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 hover:border-sky-400 hover:text-sky-700"
              >
                <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
                Add insurance
              </button>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (onClose) {
                    onClose();
                  } else {
                    router.push("/patients");
                  }
                }}
                className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-4 py-1.5 text-xs font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)] backdrop-blur hover:bg-sky-700"
              >
                Finish
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

