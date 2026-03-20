"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { Pencil, X } from "lucide-react";

type PatientData = {
  id: string;
  email: string | null;
  phone: string | null;
  marital_status: string | null;
  gender: string | null;
  street_address: string | null;
  postal_code: string | null;
  town: string | null;
  country: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relation: string | null;
};

type ModalType = "details" | "address" | null;

export default function PatientCockpitDetails({
  patient,
}: {
  patient: PatientData;
}) {
  const router = useRouter();
  const [openModal, setOpenModal] = useState<ModalType>(null);
  const [saving, setSaving] = useState(false);

  // Patient Details form state
  const [email, setEmail] = useState(patient.email ?? "");
  const [phone, setPhone] = useState(patient.phone ?? "");
  const [maritalStatus, setMaritalStatus] = useState(patient.marital_status ?? "");
  const [gender, setGender] = useState(patient.gender ?? "");

  // Patient Address form state
  const [streetAddress, setStreetAddress] = useState(patient.street_address ?? "");
  const [postalCode, setPostalCode] = useState(patient.postal_code ?? "");
  const [town, setTown] = useState(patient.town ?? "");
  const [country, setCountry] = useState(patient.country ?? "");

  function handleOpen(type: ModalType) {
    // Reset form state to current patient values
    if (type === "details") {
      setEmail(patient.email ?? "");
      setPhone(patient.phone ?? "");
      setMaritalStatus(patient.marital_status ?? "");
      setGender(patient.gender ?? "");
    } else if (type === "address") {
      setStreetAddress(patient.street_address ?? "");
      setPostalCode(patient.postal_code ?? "");
      setTown(patient.town ?? "");
      setCountry(patient.country ?? "");
    }
    setOpenModal(type);
  }

  async function handleSave() {
    setSaving(true);
    let updateData: Record<string, string | null> = {};

    if (openModal === "details") {
      updateData = {
        email: email.trim() || null,
        phone: phone.trim() || null,
        marital_status: maritalStatus.trim() || null,
        gender: gender.trim() || null,
      };
    } else if (openModal === "address") {
      updateData = {
        street_address: streetAddress.trim() || null,
        postal_code: postalCode.trim() || null,
        town: town.trim() || null,
        country: country.trim() || null,
      };
    }

    const { error } = await supabaseClient
      .from("patients")
      .update(updateData)
      .eq("id", patient.id);

    setSaving(false);

    if (!error) {
      setOpenModal(null);
      router.refresh();
    }
  }

  const editBtn = (type: ModalType) => (
    <button
      type="button"
      onClick={() => handleOpen(type)}
      className="ml-1.5 inline-flex h-4 w-4 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
      aria-label="Edit"
    >
      <Pencil className="h-2.5 w-2.5" />
    </button>
  );

  return (
    <>
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1 text-[11px]">
            <h3 className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              Patient Details
              {editBtn("details")}
            </h3>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Email:</span>{" "}
              <span className="text-slate-900">{patient.email ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Mobile Number:</span>{" "}
              <span className="text-slate-900">{patient.phone ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Civil Status:</span>{" "}
              <span className="text-slate-900">{patient.marital_status ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Gender:</span>{" "}
              <span className="text-slate-900">{patient.gender ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Patient Number:</span>{" "}
              <span className="text-slate-900">{patient.id}</span>
            </p>
          </div>

          <div className="space-y-1 text-[11px]">
            <h3 className="mb-2 flex items-center text-xs font-semibold uppercase tracking-wide text-slate-500">
              Patient Address
              {editBtn("address")}
            </h3>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Street:</span>{" "}
              <span className="text-slate-900">{patient.street_address ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Zip Code:</span>{" "}
              <span className="text-slate-900">{patient.postal_code ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Town:</span>{" "}
              <span className="text-slate-900">{patient.town ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Country:</span>{" "}
              <span className="text-slate-900">{
                ({ CH:"🇨🇭 Switzerland", DE:"🇩🇪 Germany", FR:"🇫🇷 France", AT:"🇦🇹 Austria", IT:"🇮🇹 Italy", LI:"🇱🇮 Liechtenstein", LU:"🇱🇺 Luxembourg", BE:"🇧🇪 Belgium", NL:"🇳🇱 Netherlands", ES:"🇪🇸 Spain", PT:"🇵🇹 Portugal", GB:"🇬🇧 United Kingdom", US:"🇺🇸 United States" } as Record<string,string>)[patient.country ?? ""] || patient.country || "N/A"
              }</span>
            </p>
          </div>

          <div className="space-y-1 text-[11px]">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Patient Emergency Contact
            </h3>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Name:</span>{" "}
              <span className="text-slate-900">{patient.emergency_contact_name ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Mobile Number:</span>{" "}
              <span className="text-slate-900">{patient.emergency_contact_phone ?? "N/A"}</span>
            </p>
            <p className="text-slate-500">
              <span className="font-semibold text-slate-700">Relation to Patient:</span>{" "}
              <span className="text-slate-900">{patient.emergency_contact_relation ?? "N/A"}</span>
            </p>
          </div>

          <div className="space-y-2 text-[11px]">
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Before and After
            </h3>
            <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] font-medium text-slate-500">
                  View reconstruction
                </p>
                <button
                  type="button"
                  className="inline-flex items-center rounded-full border border-sky-200/80 bg-sky-600 px-3 py-1 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700"
                >
                  View
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modal overlay */}
      {openModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="relative w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-2xl">
            <button
              type="button"
              onClick={() => setOpenModal(null)}
              className="absolute right-3 top-3 inline-flex h-6 w-6 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>

            <h2 className="mb-4 text-sm font-semibold text-slate-900">
              {openModal === "details" && "Edit Patient Details"}
              {openModal === "address" && "Edit Patient Address"}
            </h2>

            <div className="space-y-3">
              {openModal === "details" && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Mobile Number</span>
                    <input
                      type="text"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Civil Status</span>
                    <input
                      type="text"
                      value={maritalStatus}
                      onChange={(e) => setMaritalStatus(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Gender</span>
                    <select
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                </>
              )}

              {openModal === "address" && (
                <>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Street</span>
                    <input
                      type="text"
                      value={streetAddress}
                      onChange={(e) => setStreetAddress(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Zip Code</span>
                    <input
                      type="text"
                      value={postalCode}
                      onChange={(e) => setPostalCode(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Town</span>
                    <input
                      type="text"
                      value={town}
                      onChange={(e) => setTown(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-medium text-slate-600">Country</span>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="mt-1 block w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 outline-none focus:border-sky-400 focus:ring-1 focus:ring-sky-400"
                    >
                      <option value="">Select country</option>
                      <option value="CH">🇨🇭 Switzerland (CH)</option>
                      <option value="DE">🇩🇪 Germany (DE)</option>
                      <option value="FR">🇫🇷 France (FR)</option>
                      <option value="AT">🇦🇹 Austria (AT)</option>
                      <option value="IT">🇮🇹 Italy (IT)</option>
                      <option value="LI">🇱🇮 Liechtenstein (LI)</option>
                      <option value="LU">🇱🇺 Luxembourg (LU)</option>
                      <option value="BE">🇧🇪 Belgium (BE)</option>
                      <option value="NL">🇳🇱 Netherlands (NL)</option>
                      <option value="ES">🇪🇸 Spain (ES)</option>
                      <option value="PT">🇵🇹 Portugal (PT)</option>
                      <option value="GB">🇬🇧 United Kingdom (GB)</option>
                      <option value="US">🇺🇸 United States (US)</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenModal(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg bg-sky-600 px-4 py-2 text-xs font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
