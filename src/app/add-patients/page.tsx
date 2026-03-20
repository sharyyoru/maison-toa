import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import NewPatientForm from "../patients/NewPatientForm";

export const dynamic = "force-dynamic";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  created_at: string | null;
};

async function getPatients(): Promise<Patient[]> {
  const { data, error } = await supabaseClient
    .from("patients")
    .select("id, first_name, last_name, email, phone, created_at")
    .order("created_at", { ascending: false })
    .limit(10);

  if (error || !data) {
    return [];
  }

  return data as Patient[];
}

export default async function AddPatientsPage() {
  const patients = await getPatients();

  return (
    <div className="space-y-6">
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Add patient</h1>
          <p className="text-sm text-slate-500">
            Create a new patient record. Optionally fill secondary details and insurance.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <NewPatientForm />
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-medium text-slate-800">
            Recent patients
          </h2>
          {patients.length === 0 ? (
            <p className="text-sm text-slate-500">
              No patients yet. Add your first patient using the form.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="py-2 pr-4">Name</th>
                    <th className="py-2 pr-4">Email</th>
                    <th className="py-2 pr-4">Phone</th>
                    <th className="py-2 pr-4">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {patients.map((patient) => (
                    <tr key={patient.id} className="hover:bg-slate-50">
                      <td className="py-2 pr-4">
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/patients/${patient.id}`}
                            aria-label={`View details for ${patient.first_name} ${patient.last_name}`}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-sky-200/70 bg-sky-50 text-sky-600 shadow-sm hover:bg-sky-100 hover:text-sky-700"
                          >
                            <svg
                              className="h-3.5 w-3.5"
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="1.8"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12Z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </Link>
                          <Link
                            href={`/patients/${patient.id}`}
                            className="font-medium text-sky-700 hover:text-sky-800 hover:underline"
                          >
                            {patient.first_name} {patient.last_name}
                          </Link>
                        </div>
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {patient.email || "—"}
                      </td>
                      <td className="py-2 pr-4 text-slate-600">
                        {patient.phone || "—"}
                      </td>
                      <td className="py-2 pr-4 text-xs text-slate-500">
                        {patient.created_at
                          ? new Date(patient.created_at).toLocaleDateString()
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
