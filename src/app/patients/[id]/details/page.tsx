import Link from "next/link";
import CollapseSidebarOnMount from "@/components/CollapseSidebarOnMount";
import PatientDetailsWizard from "./PatientDetailsWizard";

export default async function PatientDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <div className="space-y-6">
      <CollapseSidebarOnMount />
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            Patient details
          </h1>
          <p className="text-sm text-slate-500">
            Add secondary details and insurance information for this patient.
          </p>
        </div>
        <Link
          href="/patients"
          className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to all contacts
        </Link>
      </div>

      <PatientDetailsWizard patientId={id} />
    </div>
  );
}
