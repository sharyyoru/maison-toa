"use client";

import { useState, useEffect } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type PatientData = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  contact_owner_name: string | null;
  created_at: string;
  updated_at: string;
};

type MergeSelection = {
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  date_of_birth: string | null;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  country: string | null;
  contact_owner_name: string | null;
};

type PatientMergeModalProps = {
  patientIds: string[];
  onClose: () => void;
  onSuccess: () => void;
};

export default function PatientMergeModal({
  patientIds,
  onClose,
  onSuccess,
}: PatientMergeModalProps) {
  const [patients, setPatients] = useState<PatientData[]>([]);
  const [loading, setLoading] = useState(true);
  const [merging, setMerging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primaryPatientId, setPrimaryPatientId] = useState<string>("");
  const [mergeSelection, setMergeSelection] = useState<MergeSelection>({
    first_name: "",
    last_name: "",
    email: null,
    phone: null,
    date_of_birth: null,
    address: null,
    city: null,
    postal_code: null,
    country: null,
    contact_owner_name: null,
  });

  useEffect(() => {
    async function loadPatients() {
      try {
        const { data, error: fetchError } = await supabaseClient
          .from("patients")
          .select("*")
          .in("id", patientIds);

        if (fetchError) throw fetchError;
        if (!data || data.length === 0) throw new Error("No patients found");

        setPatients(data as PatientData[]);
        
        // Set the most recently updated patient as primary by default
        const sorted = [...data].sort((a, b) => 
          new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
        );
        const primary = sorted[0];
        setPrimaryPatientId(primary.id);
        
        // Initialize merge selection with primary patient's data
        setMergeSelection({
          first_name: primary.first_name,
          last_name: primary.last_name,
          email: primary.email,
          phone: primary.phone,
          date_of_birth: primary.date_of_birth,
          address: primary.address,
          city: primary.city,
          postal_code: primary.postal_code,
          country: primary.country,
          contact_owner_name: primary.contact_owner_name,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load patients");
      } finally {
        setLoading(false);
      }
    }

    loadPatients();
  }, [patientIds]);

  // Update merge selection when primary patient changes
  useEffect(() => {
    if (!primaryPatientId || patients.length === 0) return;
    
    const primary = patients.find(p => p.id === primaryPatientId);
    if (!primary) return;

    setMergeSelection({
      first_name: primary.first_name,
      last_name: primary.last_name,
      email: primary.email,
      phone: primary.phone,
      date_of_birth: primary.date_of_birth,
      address: primary.address,
      city: primary.city,
      postal_code: primary.postal_code,
      country: primary.country,
      contact_owner_name: primary.contact_owner_name,
    });
  }, [primaryPatientId, patients]);

  async function handleMerge() {
    if (!primaryPatientId) {
      setError("Please select a primary patient");
      return;
    }

    setMerging(true);
    setError(null);

    try {
      const response = await fetch("/api/patients/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryPatientId,
          patientIdsToMerge: patientIds.filter(id => id !== primaryPatientId),
          mergedData: mergeSelection,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to merge patients");
      }

      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge patients");
    } finally {
      setMerging(false);
    }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="rounded-xl bg-white p-8 shadow-xl">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            <p className="text-sm text-slate-600">Loading patient data...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-5xl max-h-[90vh] flex flex-col rounded-xl bg-white shadow-2xl">
        <div className="border-b border-slate-200 px-6 py-3 shrink-0">
          <h2 className="text-base font-semibold text-slate-900">Merge Patients</h2>
          <p className="text-xs text-slate-500">
            Select which data to keep from each patient. All records will be merged into the primary patient.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          {/* Primary Patient Selection */}
          <div className="rounded-lg border-2 border-sky-200 bg-sky-50/50 p-3">
            <label className="block text-xs font-semibold text-slate-900 mb-2">
              Step 1: Select Primary Patient
            </label>
            <p className="text-xs text-slate-600 mb-3">
              Choose which patient record to keep. All data from other patients will be merged into this one.
            </p>
            <div className="space-y-1.5">
              {patients.map((patient) => (
                <label
                  key={patient.id}
                  className={`flex items-start gap-2.5 rounded-lg border-2 p-2.5 cursor-pointer transition-all ${
                    primaryPatientId === patient.id
                      ? "border-sky-500 bg-sky-100"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <input
                    type="radio"
                    name="primaryPatient"
                    value={patient.id}
                    checked={primaryPatientId === patient.id}
                    onChange={(e) => setPrimaryPatientId(e.target.value)}
                    className="mt-0.5 h-3.5 w-3.5 text-sky-600 focus:ring-sky-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">
                        {patient.first_name} {patient.last_name}
                      </span>
                      {primaryPatientId === patient.id && (
                        <span className="rounded-full bg-sky-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
                          Primary
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-600">
                      {patient.email || "No email"} • {patient.phone || "No phone"}
                    </div>
                    <div className="mt-0.5 text-[10px] text-slate-500">
                      Updated: {new Date(patient.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Data Selection Grid */}
          <div>
            <div className="mb-2">
              <h3 className="text-xs font-semibold text-slate-900">Step 2: Choose Field Values</h3>
              <p className="text-[11px] text-slate-600 mt-0.5">
                Click on any value to select it for the merged patient. By default, the primary patient's values are selected.
              </p>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full text-xs">
                <thead className="border-b border-slate-200 bg-slate-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700">Field</th>
                    {patients.map((patient) => (
                      <th key={patient.id} className="px-3 py-2 text-left text-[11px] font-semibold text-slate-700">
                        {patient.first_name} {patient.last_name}
                        {patient.id === primaryPatientId && (
                          <span className="ml-1.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] text-sky-700">Primary</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
              <tbody className="divide-y divide-slate-100">
                {[
                  { key: "first_name", label: "First Name" },
                  { key: "last_name", label: "Last Name" },
                  { key: "email", label: "Email" },
                  { key: "phone", label: "Phone" },
                  { key: "date_of_birth", label: "Date of Birth" },
                  { key: "address", label: "Address" },
                  { key: "city", label: "City" },
                  { key: "postal_code", label: "Postal Code" },
                  { key: "country", label: "Country" },
                  { key: "contact_owner_name", label: "Contact Owner" },
                ].map((field) => (
                  <tr key={field.key} className="hover:bg-slate-50">
                    <td className="px-3 py-2 text-[11px] font-medium text-slate-700">{field.label}</td>
                    {patients.map((patient) => {
                      const value = patient[field.key as keyof PatientData];
                      const isSelected = mergeSelection[field.key as keyof MergeSelection] === value;
                      
                      return (
                        <td key={patient.id} className="px-3 py-2">
                          <button
                            onClick={() => setMergeSelection(prev => ({
                              ...prev,
                              [field.key]: value,
                            }))}
                            className={`w-full rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                              isSelected
                                ? "border-sky-500 bg-sky-50 text-sky-900 font-medium"
                                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            {value || <span className="text-slate-400">—</span>}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>

          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <p className="text-xs text-amber-800">
              <strong>Warning:</strong> This will merge all appointments, documents, consultations, deals, invoices, and other data into the primary patient. Files will be copied to the primary patient's folder. Other patient records will be permanently deleted. This cannot be undone.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-6 py-3 shrink-0">
          <button
            onClick={onClose}
            disabled={merging}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={merging || !primaryPatientId}
            className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {merging ? "Merging..." : "Merge Patients"}
          </button>
        </div>
      </div>
    </div>
  );
}
