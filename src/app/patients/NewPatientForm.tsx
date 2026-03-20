"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

export default function NewPatientForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fillSecondaryDetails, setFillSecondaryDetails] = useState(false);
  
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const stored = window.localStorage.getItem("fillSecondaryDetails");
      if (stored === "true") {
        setFillSecondaryDetails(true);
      } else if (stored === "false") {
        setFillSecondaryDetails(false);
      }
    } catch {
      // ignore read errors
    }
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const firstName = (formData.get("first_name") as string | null)?.trim();
    const lastName = (formData.get("last_name") as string | null)?.trim();
    const emailRaw = (formData.get("email") as string | null)?.trim();
    const genderRaw =
      (formData.get("gender") as string | null)?.trim().toLowerCase() || null;
    const countryCode =
      ((formData.get("country_code") as string | null)?.trim() || "+41").replace(
        /\s+/g,
        ""
      );
    const rawPhone = (formData.get("phone") as string | null)?.trim() || "";
    const phone = rawPhone
      ? `${countryCode} ${rawPhone.replace(/^0+/, "")}`.trim()
      : null;

    const dob = (formData.get("dob") as string | null)?.trim() || null;
    const streetAddress = (formData.get("street_address") as string | null)?.trim() || null;
    const postalCode = (formData.get("postal_code") as string | null)?.trim() || null;
    const town = (formData.get("town") as string | null)?.trim() || null;

    const insuranceProvider = (formData.get("insurance_provider") as string | null)?.trim() || null;
    const insuranceCardNumber = (formData.get("insurance_card_number") as string | null)?.trim() || null;
    const insuranceType = (formData.get("insurance_type") as string | null)?.trim() || null;

    const source =
      ((formData.get("source") as string | null)?.trim() || "manual").toLowerCase();

    if (!firstName || !lastName || !emailRaw || !rawPhone) {
      setError("First name, last name, email, and phone are required.");
      return;
    }

    const normalizedEmail = emailRaw.toLowerCase();

    setLoading(true);
    setError(null);

    const { data: existing, error: existingError } = await supabaseClient
      .from("patients")
      .select("id")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (!existingError && existing) {
      setError("A patient with this email already exists.");
      setLoading(false);
      return;
    }

    const { data: authData } = await supabaseClient.auth.getUser();
    const authUser = authData?.user ?? null;

    let createdByUserId: string | null = null;
    let createdBy: string | null = null;

    if (authUser) {
      const meta = (authUser.user_metadata || {}) as Record<string, unknown>;
      const first = (meta["first_name"] as string) || "";
      const last = (meta["last_name"] as string) || "";
      const fullName =
        [first, last].filter(Boolean).join(" ") || authUser.email || null;

      createdByUserId = authUser.id;
      createdBy = fullName;
    }

    const patientPayload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      phone,
      gender: genderRaw,
      source,
      created_by_user_id: createdByUserId,
      created_by: createdBy,
    };
    if (dob) patientPayload.dob = dob;
    if (streetAddress) patientPayload.street_address = streetAddress;
    if (postalCode) patientPayload.postal_code = postalCode;
    if (town) patientPayload.town = town;

    const { data: newPatient, error: insertError } = await supabaseClient
      .from("patients")
      .insert(patientPayload)
      .select("id")
      .single();

    if (insertError || !newPatient) {
      setError(insertError?.message ?? "Failed to create patient.");
      setLoading(false);
      return;
    }

    if (insuranceProvider) {
      const insurancePayload: Record<string, unknown> = {
        patient_id: newPatient.id,
        provider_name: insuranceProvider,
        card_number: insuranceCardNumber || "",
        insurance_type: insuranceType || "basic",
      };
      await supabaseClient.from("patient_insurances").insert(insurancePayload);
    }

    setLoading(false);
    form.reset();
    if (fillSecondaryDetails) {
      router.push(`/patients/${newPatient.id}/details`);
    } else {
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur"
    >
      <div className="space-y-1">
        <label
          htmlFor="first_name"
          className="block text-sm font-medium text-slate-700"
        >
          First name
        </label>
        <input
          id="first_name"
          name="first_name"
          type="text"
          required
          className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="space-y-1">
        <label
          htmlFor="last_name"
          className="block text-sm font-medium text-slate-700"
        >
          Last name
        </label>
        <input
          id="last_name"
          name="last_name"
          type="text"
          required
          className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="space-y-1">
        <label
          htmlFor="dob"
          className="block text-sm font-medium text-slate-700"
        >
          Date of birth
        </label>
        <input
          id="dob"
          name="dob"
          type="date"
          className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="space-y-1">
        <label
          htmlFor="email"
          className="block text-sm font-medium text-slate-700"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          Phone
        </label>
        <div className="flex gap-2">
          <select
            id="country_code"
            name="country_code"
            defaultValue="+41"
            className="w-28 rounded-lg border border-slate-200 bg-white/90 px-2 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="+41">🇨🇭 +41</option>
            <option value="+33">🇫🇷 +33</option>
            <option value="+971">🇦🇪 +971</option>
            <option value="+44">🇬🇧 +44</option>
            <option value="+1">🇺🇸 +1</option>
          </select>
          <input
            id="phone"
            name="phone"
            type="tel"
            placeholder="79 123 45 67"
            required
            className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          Postal address
        </label>
        <input
          id="street_address"
          name="street_address"
          type="text"
          placeholder="Street address"
          className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="flex gap-2">
          <input
            id="postal_code"
            name="postal_code"
            type="text"
            placeholder="Postal code"
            className="block w-1/3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <input
            id="town"
            name="town"
            type="text"
            placeholder="City / Town"
            className="block w-2/3 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium text-slate-700">
          Insurance
        </label>
        <input
          id="insurance_provider"
          name="insurance_provider"
          type="text"
          placeholder="Insurance provider"
          className="block w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
        />
        <div className="flex gap-2">
          <input
            id="insurance_card_number"
            name="insurance_card_number"
            type="text"
            placeholder="Card number"
            className="block w-1/2 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
          <select
            id="insurance_type"
            name="insurance_type"
            defaultValue="basic"
            className="block w-1/2 rounded-lg border border-slate-200 bg-white/90 px-3 py-2 text-sm text-slate-900 shadow-[0_4px_14px_rgba(15,23,42,0.08)] focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="basic">Basic</option>
            <option value="semi_private">Semi-private</option>
            <option value="private">Private</option>
          </select>
        </div>
      </div>
            <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs shadow-[0_4px_14px_rgba(15,23,42,0.06)]">
        <div>
          <p className="font-medium text-slate-700">Fill Secondary Details</p>
          <p className="text-[11px] text-slate-500">
            When on, you'll be guided to address and insurance steps.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={fillSecondaryDetails}
          onClick={() => {
            setFillSecondaryDetails((prev) => {
              const next = !prev;
              try {
                if (typeof window !== "undefined") {
                  window.localStorage.setItem(
                    "fillSecondaryDetails",
                    next ? "true" : "false",
                  );
                }
              } catch {
                // ignore write errors
              }
              return next;
            });
          }}
          className={
            (fillSecondaryDetails
              ? "bg-sky-500 border-sky-500"
              : "bg-slate-200 border-slate-300") +
            " relative inline-flex h-6 w-11 items-center rounded-full border transition-colors"
          }
        >
          <span
            className={
              (fillSecondaryDetails ? "translate-x-5" : "translate-x-1") +
              " inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
            }
          />
        </button>
      </div>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-4 py-1.5 text-sm font-medium text-white shadow-[0_10px_25px_rgba(15,23,42,0.22)] backdrop-blur hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Saving..." : "Add patient"}
      </button>
    </form>
  );
}
