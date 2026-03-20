"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import PatientDetailsTabs from "./PatientDetailsTabs";
import PatientCrmPreferencesCard from "./PatientCrmPreferencesCard";
import PatientActivityCard from "./PatientActivityCard";

type CrmSubTab = "activity" | "notes" | "emails" | "whatsapp" | "tasks" | "deals";

const CRM_SUB_TABS: { id: CrmSubTab; label: string; icon: React.ReactNode }[] = [
  {
    id: "activity",
    label: "Activity",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: "notes",
    label: "Notes",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
  },
  {
    id: "emails",
    label: "Emails",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
  },
  {
    id: "whatsapp",
    label: "Whatsapp",
    icon: (
      <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
      </svg>
    ),
  },
  {
    id: "tasks",
    label: "Tasks",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
      </svg>
    ),
  },
  {
    id: "deals",
    label: "Deals",
    icon: (
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
];

export default function PatientCrmSection({
  patient,
  insurance,
  patientId,
  createdAt,
  createdBy,
  patientEmail,
  patientPhone,
  patientName,
  contactOwnerName,
}: {
  patient: any;
  insurance: any[];
  patientId: string;
  createdAt: string | null;
  createdBy: string | null;
  patientEmail: string | null;
  patientPhone: string | null;
  patientName: string;
  contactOwnerName: string | null;
}) {
  const [showDetailsCards, setShowDetailsCards] = useState(false);
  const searchParams = useSearchParams();
  const router = useRouter();
  
  // Read initial tab from URL params
  const urlSubTab = searchParams?.get("crm_sub") as CrmSubTab | null;
  const [activeSubTab, setActiveSubTab] = useState<CrmSubTab>(
    urlSubTab && ["activity", "notes", "emails", "whatsapp", "tasks", "deals"].includes(urlSubTab)
      ? urlSubTab
      : "activity"
  );

  // Sync with URL param changes
  useEffect(() => {
    const paramTab = searchParams?.get("crm_sub") as CrmSubTab | null;
    if (paramTab && ["activity", "notes", "emails", "whatsapp", "tasks", "deals"].includes(paramTab)) {
      setActiveSubTab(paramTab);
    }
  }, [searchParams]);

  // Handle tab change - update both state and URL
  const handleTabChange = (tab: CrmSubTab) => {
    setActiveSubTab(tab);
    const params = new URLSearchParams(searchParams?.toString() || "");
    params.set("m_tab", "crm");
    params.set("crm_sub", tab);
    router.push(`/patients/${patientId}?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="space-y-6">
      {/* CRM Sub-navigation */}
      <div className="rounded-xl border border-slate-200/80 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.06)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Sub-tabs */}
          <div className="flex flex-wrap items-center gap-1">
            {CRM_SUB_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => handleTabChange(tab.id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${
                  activeSubTab === tab.id
                    ? "bg-gradient-to-r from-emerald-500 to-teal-500 text-white shadow-md shadow-emerald-200"
                    : "bg-slate-50 text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>

          {/* Toggle Patient Details Button */}
          <button
            type="button"
            onClick={() => setShowDetailsCards(!showDetailsCards)}
            className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all ${
              showDetailsCards
                ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900"
            }`}
          >
            <svg
              className={`h-4 w-4 transition-transform ${showDetailsCards ? "rotate-180" : ""}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
            {showDetailsCards ? "Hide Patient Details" : "Show Patient Details"}
          </button>
        </div>
      </div>

      {/* Collapsible Patient Details Cards */}
      <div
        className={`grid gap-6 md:grid-cols-2 items-stretch transition-all duration-300 ease-in-out overflow-hidden ${
          showDetailsCards ? "max-h-[1000px] opacity-100" : "max-h-0 opacity-0"
        }`}
      >
        <PatientDetailsTabs patient={patient} insurance={insurance} />
        <PatientCrmPreferencesCard patient={patient} />
      </div>

      {/* Activity Card - Always visible */}
      <PatientActivityCard
        patientId={patientId}
        createdAt={createdAt}
        createdBy={createdBy}
        patientEmail={patientEmail}
        patientPhone={patientPhone}
        patientName={patientName}
        contactOwnerName={contactOwnerName}
        controlledTab={activeSubTab}
        onTabChange={handleTabChange}
        hideTabNavigation={true}
      />
    </div>
  );
}
