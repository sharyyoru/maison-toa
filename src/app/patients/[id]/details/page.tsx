import Link from "next/link";
import { getTranslations } from "next-intl/server";
import CollapseSidebarOnMount from "@/components/CollapseSidebarOnMount";
import PatientDetailsWizard from "./PatientDetailsWizard";

export default async function PatientDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tPatient = await getTranslations("patient");

  return (
    <div className="space-y-6">
      <CollapseSidebarOnMount />
      <div className="flex items-baseline justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {tPatient("details.title")}
          </h1>
          <p className="text-sm text-slate-500">
            {tPatient("details.subtitle")}
          </p>
        </div>
        <Link
          href="/patients"
          className="inline-flex items-center rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          {tPatient("details.backToContacts")}
        </Link>
      </div>

      <PatientDetailsWizard patientId={id} />
    </div>
  );
}
