import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import CollapseSidebarOnMount from "@/components/CollapseSidebarOnMount";

import EditPatientDetailsButton from "./EditPatientDetailsButton";
import PatientModeToggle from "./PatientModeToggle";
import PatientDetailsTabs from "./PatientDetailsTabs";
import PatientCrmPreferencesCard from "./PatientCrmPreferencesCard";
import PatientActivityCard from "./PatientActivityCard";
import CrisalixPlayerModal from "./CrisalixPlayerModal";
import MedicalConsultationsCard from "./MedicalConsultationsCard";
import PatientDocumentsTab from "./PatientDocumentsTab";
import PatientModeInitializer from "./PatientModeInitializer";
import PatientEditingPresence from "./PatientEditingPresence";
import InvoicePaymentMethodFilter from "./InvoicePaymentMethodFilter";
import PatientIntakeDataCard from "./PatientIntakeDataCard";
import PatientRendezvousTab from "./PatientRendezvousTab";
import PatientCrmSection from "./PatientCrmSection";
import CrmTabDropdown from "./CrmTabDropdown";
import MedicationCard from "./MedicationCard";
import AgeBadge from "./AgeBadge";
import PatientCockpitDetails from "./PatientCockpitDetails";
import PatientPageClientWrapper from "./PatientPageClientWrapper";
import PatientFormsTab from "./PatientFormsTab";
import PatientTabRegistrar from "./PatientTabRegistrar";

export const dynamic = "force-dynamic";

interface PatientDetailsProps {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

type MedicalTab =
  | "cockpit"
  | "notes"
  | "prescription"
  | "invoice"
  | "file"
  | "photo"
  | "3d"
  | "patient_information"
  | "documents"
  | "rendezvous"
  | "forms"
  | "crm"
  | "form_photos"
  | "medication";

async function getPatientWithDetails(id: string) {
  const { data: patient, error } = await supabaseAdmin
    .from("patients")
    .select(
      "id, first_name, last_name, email, phone, gender, dob, marital_status, nationality, street_address, postal_code, town, country, profession, current_employer, source, notes, avatar_url, language_preference, clinic_preference, lifecycle_stage, contact_owner_name, contact_owner_email, created_by, created_at, updated_at",
    )
    .eq("id", id)
    .single();

  if (error || !patient) {
    return { patient: null, insurance: [] } as const;
  }

  const { data: insurance } = await supabaseAdmin
    .from("patient_insurances")
    .select("id, provider_name, card_number, insurance_type, created_at")
    .eq("patient_id", id)
    .order("created_at", { ascending: false });

  return { patient, insurance: insurance ?? [] } as const;
}

type InvoiceStatus = "OPEN" | "PAID" | "CANCELLED" | "OVERPAID" | "PARTIAL_LOSS" | "PARTIAL_PAID";

type InvoiceSummary = {
  totalAmount: number;
  totalComplimentary: number;
  totalPaid: number;
  totalUnpaid: number;
  totalCancelled: number;
  totalOverpaid: number;
  totalPartialLoss: number;
  totalPartialPaid: number;
  countByStatus: Record<InvoiceStatus, number>;
};

async function getInvoiceSummary(
  patientId: string,
  paymentMethodFilter: string | null = null,
): Promise<InvoiceSummary> {
  const emptyResult: InvoiceSummary = {
    totalAmount: 0,
    totalComplimentary: 0,
    totalPaid: 0,
    totalUnpaid: 0,
    totalCancelled: 0,
    totalOverpaid: 0,
    totalPartialLoss: 0,
    totalPartialPaid: 0,
    countByStatus: {
      OPEN: 0,
      PAID: 0,
      CANCELLED: 0,
      OVERPAID: 0,
      PARTIAL_LOSS: 0,
      PARTIAL_PAID: 0,
    },
  };

  try {
    const { data, error } = await supabaseAdmin
      .from("invoices")
      .select(
        "total_amount, paid_amount, status, is_complimentary, is_archived, payment_method",
      )
      .eq("patient_id", patientId);

    if (error || !data) {
      return emptyResult;
    }

    let totalAmountNonComplimentary = 0;
    let totalComplimentary = 0;
    let totalPaid = 0;
    let totalUnpaid = 0;
    let totalCancelled = 0;
    let totalOverpaid = 0;
    let totalPartialLoss = 0;
    let totalPartialPaid = 0;
    const countByStatus: Record<InvoiceStatus, number> = {
      OPEN: 0,
      PAID: 0,
      CANCELLED: 0,
      OVERPAID: 0,
      PARTIAL_LOSS: 0,
      PARTIAL_PAID: 0,
    };

    for (const row of data as any[]) {
      if (row.is_archived) continue;

      const paymentMethod = row.payment_method as string | null | undefined;
      if (paymentMethodFilter && paymentMethod !== paymentMethodFilter) {
        continue;
      }

      const amount = Number(row.total_amount) || 0;
      if (amount <= 0) continue;

      if (row.is_complimentary) {
        totalComplimentary += amount;
        continue;
      }

      const status: InvoiceStatus = row.status || "OPEN";
      const paidAmount = Number(row.paid_amount) || 0;

      countByStatus[status] = (countByStatus[status] || 0) + 1;

      switch (status) {
        case "PAID":
          totalAmountNonComplimentary += amount;
          totalPaid += amount;
          break;
        case "PARTIAL_PAID":
          totalAmountNonComplimentary += amount;
          totalPartialPaid += paidAmount;
          totalUnpaid += amount - paidAmount;
          break;
        case "PARTIAL_LOSS":
          totalAmountNonComplimentary += amount;
          // Partial loss = original total - what was actually received (after fees/commissions)
          totalPaid += paidAmount;
          totalPartialLoss += amount - paidAmount;
          break;
        case "OVERPAID":
          totalAmountNonComplimentary += amount;
          totalPaid += paidAmount;
          totalOverpaid += paidAmount - amount;
          break;
        case "CANCELLED":
          totalCancelled += amount;
          break;
        case "OPEN":
        default:
          totalAmountNonComplimentary += amount;
          totalUnpaid += amount;
          break;
      }
    }

    return {
      totalAmount: Math.max(0, totalAmountNonComplimentary),
      totalComplimentary: Math.max(0, totalComplimentary),
      totalPaid: Math.max(0, totalPaid),
      totalUnpaid: Math.max(0, totalUnpaid),
      totalCancelled: Math.max(0, totalCancelled),
      totalOverpaid: Math.max(0, totalOverpaid),
      totalPartialLoss: Math.max(0, totalPartialLoss),
      totalPartialPaid: Math.max(0, totalPartialPaid),
      countByStatus,
    };
  } catch {
    return emptyResult;
  }
}

export default async function PatientPage({
  params,
  searchParams,
}: PatientDetailsProps) {
  const { id } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;

  const { patient, insurance } = await getPatientWithDetails(id);

  if (!patient) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 text-sm text-red-700 shadow-sm">
        Patient not found.
      </div>
    );
  }

  const rawDob = (patient as any).dob as string | null | undefined;
  let age: number | null = null;
  if (rawDob) {
    const dobDate = new Date(rawDob);
    if (!Number.isNaN(dobDate.getTime())) {
      const today = new Date();
      let years = today.getFullYear() - dobDate.getFullYear();
      const m = today.getMonth() - dobDate.getMonth();
      if (m < 0 || (m === 0 && today.getDate() < dobDate.getDate())) {
        years -= 1;
      }
      age = years;
    }
  }

  const genderRaw = (patient as any).gender as string | null | undefined;
  const gender = genderRaw ? genderRaw.toLowerCase() : null;

  // Always use medical mode - CRM is now a tab
  const mode: "medical" = "medical";

  const rawPaymentMethodFilter = (() => {
    const value = resolvedSearchParams?.payment_method;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
    return undefined;
  })();

  const paymentMethodFilter =
    rawPaymentMethodFilter === "Cash" ||
      rawPaymentMethodFilter === "Online Payment" ||
      rawPaymentMethodFilter === "Bank transfer" ||
      rawPaymentMethodFilter === "Insurance"
      ? rawPaymentMethodFilter
      : null;

  const invoiceSummary = await getInvoiceSummary(id, paymentMethodFilter);

  const crPlayerIdRaw = (() => {
    const value = resolvedSearchParams?.cr_player_id;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
    return undefined;
  })();

  const crTypeRawParam = (() => {
    const value = resolvedSearchParams?.cr_type;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
    return undefined;
  })();

  let crType: "breast" | "face" | "body" | null = null;
  if (crTypeRawParam === "breast" || crTypeRawParam === "face" || crTypeRawParam === "body") {
    crType = crTypeRawParam;
  }

  const show3d =
    resolvedSearchParams?.show3d === "1" && !!crPlayerIdRaw && crType !== null;

  const rawMedicalTab = (() => {
    const value = resolvedSearchParams?.m_tab;
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return value[0];
    return undefined;
  })();

  const medicalTab: MedicalTab =
    rawMedicalTab === "cockpit" ||
      rawMedicalTab === "notes" ||
      rawMedicalTab === "invoice" ||
      rawMedicalTab === "file" ||
      rawMedicalTab === "photo" ||
      rawMedicalTab === "3d" ||
      rawMedicalTab === "patient_information" ||
      rawMedicalTab === "documents" ||
      rawMedicalTab === "rendezvous" ||
      rawMedicalTab === "forms" ||
      rawMedicalTab === "crm" ||
      rawMedicalTab === "form_photos" ||
      rawMedicalTab === "medication"
      ? (rawMedicalTab as MedicalTab)
      : "cockpit";

  let genderClasses = "bg-slate-50 text-slate-700 border-slate-200";
  if (gender === "male") {
    genderClasses = "bg-sky-50 text-sky-700 border-sky-200";
  } else if (gender === "female") {
    genderClasses = "bg-pink-50 text-pink-700 border-pink-200";
  }

  return (
    <div className="space-y-6">
      <CollapseSidebarOnMount />
      <PatientModeInitializer patientId={patient.id} />
      <PatientTabRegistrar
        patientId={patient.id}
        firstName={patient.first_name ?? ""}
        lastName={patient.last_name ?? ""}
        avatarUrl={(patient as any).avatar_url ?? null}
      />
      <CrisalixPlayerModal
        patientId={patient.id}
        open={mode === "medical" && show3d}
        playerId={crPlayerIdRaw ?? null}
        reconstructionType={crType}
      />
      <div className="relative">
        <div className="flex items-baseline justify-between gap-3 relative z-10">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-slate-900">
                {patient.first_name} {patient.last_name}
              </h1>
              <PatientEditingPresence patientId={patient.id} />
            </div>
            <div className="mt-1 flex items-center gap-3 text-xs">
              {genderRaw ? (
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${genderClasses}`}
                >
                  {(gender === "male" || gender === "female")
                    ? gender.charAt(0).toUpperCase() + gender.slice(1)
                    : genderRaw}
                </span>
              ) : null}
              <AgeBadge patientId={patient.id} dob={rawDob || null} age={age} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/patients/${patient.id}?m_tab=crm&composeEmail=1`}
              className="inline-flex items-center gap-1 rounded-full border border-slate-300/80 bg-gradient-to-b from-slate-50/90 via-slate-100/90 to-slate-200/90 px-3 py-1.5 text-xs font-medium text-slate-800 shadow-[0_4px_12px_rgba(15,23,42,0.18)] backdrop-blur hover:from-slate-100 hover:to-slate-300"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                <svg
                  className="h-3.5 w-3.5 text-slate-700"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path d="M3 17L17 10L3 3L5.2 9.2L11 10L5.2 10.8L3 17Z" />
                </svg>
              </span>
              <span>Send an email</span>
            </Link>
            <EditPatientDetailsButton patientId={patient.id} />
            <Link
              href="/patients"
              className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                <svg
                  className="h-3.5 w-3.5 text-slate-600"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
                  <path d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
                </svg>
              </span>
              <span>All Contacts</span>
            </Link>
          </div>
        </div>
        <div className="pointer-events-none absolute -top-6 right-0 h-40 w-40 overflow-hidden">
          <div className="medical-glow h-full w-full" />
        </div>
      </div>

      <PatientPageClientWrapper patientId={patient.id} medicalTab={medicalTab}>
        {medicalTab === "cockpit" ? (
          <>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Consultations for:
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {patient.first_name} {patient.last_name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <InvoicePaymentMethodFilter
                    patientId={patient.id}
                    value={paymentMethodFilter}
                  />
                  <div className="flex items-center gap-2">
                    <div className="inline-flex items-center rounded-full bg-slate-100 px-0.5 py-0.5 text-[11px] font-semibold text-slate-700">
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-[11px] font-semibold text-white">
                        Financial
                      </span>
                      <span className="ml-1 rounded-full bg-sky-500 px-3 py-1 text-[11px] font-semibold text-white">
                        Medical
                      </span>
                    </div>
                    <Link
                      href={`/patients/${patient.id}/3d`}
                      className="inline-flex items-center gap-1 rounded-full border border-sky-200/80 bg-sky-500 px-3 py-1 text-[11px] font-semibold text-white shadow-[0_6px_16px_rgba(37,99,235,0.35)] hover:bg-sky-600"
                    >
                      <span>3D</span>
                      <span className="inline-flex h-3.5 w-3.5 items-center justify-center">
                        <svg
                          className="h-3.5 w-3.5"
                          viewBox="0 0 20 20"
                          fill="none"
                          xmlns="http://www.w3.org/2000/svg"
                        >
                          <path
                            d="M4 7.5L10 4.5L16 7.5V12.5L10 15.5L4 12.5V7.5Z"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M10 4.5V10.5"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                          <path
                            d="M4 7.5L10 10.5L16 7.5"
                            stroke="currentColor"
                            strokeWidth="1.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      </span>
                    </Link>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">
                    Total Amount
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {invoiceSummary.totalAmount.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-3">
                  <p className="text-[11px] font-medium text-emerald-600">
                    Total Paid
                  </p>
                  <p className="mt-1 text-base font-semibold text-emerald-700">
                    {invoiceSummary.totalPaid.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-3">
                  <p className="text-[11px] font-medium text-amber-600">
                    Total Open
                  </p>
                  <p className="mt-1 text-base font-semibold text-amber-700">
                    {invoiceSummary.totalUnpaid.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">
                    Total Complimentary
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {invoiceSummary.totalComplimentary.toFixed(2)} CHF
                  </p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-blue-100 bg-blue-50/80 p-3">
                  <p className="text-[11px] font-medium text-blue-600">
                    Overpaid
                  </p>
                  <p className="mt-1 text-base font-semibold text-blue-700">
                    {invoiceSummary.totalOverpaid.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-slate-100/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">
                    Cancelled
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-600">
                    {invoiceSummary.totalCancelled.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50/80 p-3">
                  <p className="text-[11px] font-medium text-red-600">
                    Partial Loss
                  </p>
                  <p className="mt-1 text-base font-semibold text-red-700">
                    {invoiceSummary.totalPartialLoss.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-cyan-100 bg-cyan-50/80 p-3">
                  <p className="text-[11px] font-medium text-cyan-600">
                    Partial Paid
                  </p>
                  <p className="mt-1 text-base font-semibold text-cyan-700">
                    {invoiceSummary.totalPartialPaid.toFixed(2)} CHF
                  </p>
                </div>
              </div>
            </div>

            <PatientCockpitDetails
              patient={{
                id: patient.id,
                email: (patient as any).email ?? null,
                phone: (patient as any).phone ?? null,
                marital_status: (patient as any).marital_status ?? null,
                gender: (patient as any).gender ?? null,
                street_address: (patient as any).street_address ?? null,
                postal_code: (patient as any).postal_code ?? null,
                town: (patient as any).town ?? null,
                country: (patient as any).country ?? null,
                emergency_contact_name: (patient as any).emergency_contact_name ?? null,
                emergency_contact_phone: (patient as any).emergency_contact_phone ?? null,
                emergency_contact_relation: (patient as any).emergency_contact_relation ?? null,
              }}
            />

            <MedicalConsultationsCard patientId={patient.id} patientFirstName={patient.first_name} patientLastName={patient.last_name} patientEmail={(patient as any).email ?? null} />
          </>
        ) : null}

        {medicalTab === "notes" ? (
          <MedicalConsultationsCard patientId={patient.id} patientFirstName={patient.first_name} patientLastName={patient.last_name} patientEmail={(patient as any).email ?? null} />
        ) : null}

        {medicalTab === "invoice" ? (
          <>
            <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium text-slate-500">
                    Consultations for:
                  </p>
                  <p className="text-base font-semibold text-slate-900">
                    {patient.first_name} {patient.last_name}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <InvoicePaymentMethodFilter
                    patientId={patient.id}
                    value={paymentMethodFilter}
                  />
                </div>
              </div>

              <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">
                    Total Amount
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {invoiceSummary.totalAmount.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-emerald-600">
                      Total Paid
                    </p>
                    {invoiceSummary.countByStatus.PAID > 0 && (
                      <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-700">
                        {invoiceSummary.countByStatus.PAID}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-base font-semibold text-emerald-700">
                    {invoiceSummary.totalPaid.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-red-100 bg-red-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-red-600">
                      Total Unpaid
                    </p>
                    {invoiceSummary.countByStatus.OPEN > 0 && (
                      <span className="rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">
                        {invoiceSummary.countByStatus.OPEN}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-base font-semibold text-red-700">
                    {invoiceSummary.totalUnpaid.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-amber-100 bg-amber-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-amber-600">
                      Partial Paid
                    </p>
                    {invoiceSummary.countByStatus.PARTIAL_PAID > 0 && (
                      <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">
                        {invoiceSummary.countByStatus.PARTIAL_PAID}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-base font-semibold text-amber-700">
                    {invoiceSummary.totalPartialPaid.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-orange-100 bg-orange-50/80 p-3">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-orange-600">
                      Partial Loss
                    </p>
                    {invoiceSummary.countByStatus.PARTIAL_LOSS > 0 && (
                      <span className="rounded-full bg-orange-100 px-1.5 py-0.5 text-[9px] font-semibold text-orange-700">
                        {invoiceSummary.countByStatus.PARTIAL_LOSS}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-base font-semibold text-orange-700">
                    {invoiceSummary.totalPartialLoss.toFixed(2)} CHF
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50/80 p-3">
                  <p className="text-[11px] font-medium text-slate-500">
                    Complimentary
                  </p>
                  <p className="mt-1 text-base font-semibold text-slate-900">
                    {invoiceSummary.totalComplimentary.toFixed(2)} CHF
                  </p>
                </div>
              </div>
            </div>

            <MedicalConsultationsCard patientId={patient.id} recordTypeFilter="invoice" patientFirstName={patient.first_name} patientLastName={patient.last_name} patientEmail={(patient as any).email ?? null} />
          </>
        ) : null}

        {medicalTab === "3d" ? (
          <MedicalConsultationsCard patientId={patient.id} recordTypeFilter="3d" patientFirstName={patient.first_name} patientLastName={patient.last_name} patientEmail={(patient as any).email ?? null} />
        ) : null}

        {medicalTab === "file" ? (
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <h3 className="text-sm font-semibold text-slate-900">File</h3>
            <p className="mt-2 text-xs text-slate-500">
              The patient file and related clinical information will appear here.
            </p>
          </div>
        ) : null}

        {medicalTab === "photo" ? (
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <h3 className="text-sm font-semibold text-slate-900">Photo</h3>
            <p className="mt-2 text-xs text-slate-500">
              Clinical photos for this patient will appear here.
            </p>
          </div>
        ) : null}

        {medicalTab === "patient_information" ? (
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <PatientIntakeDataCard patientId={patient.id} />
          </div>
        ) : null}

        {medicalTab === "documents" ? (
          <PatientDocumentsTab patientId={patient.id} patientName={`${patient.first_name} ${patient.last_name}`} />
        ) : null}

        {medicalTab === "rendezvous" ? (
          <PatientRendezvousTab patientId={patient.id} />
        ) : null}

        {medicalTab === "forms" ? (
          <PatientFormsTab
            patientId={patient.id}
            patientEmail={(patient as any).email ?? null}
            patientName={`${patient.first_name} ${patient.last_name}`}
          />
        ) : null}

        {medicalTab === "crm" ? (
          <PatientCrmSection
            patient={patient}
            insurance={insurance}
            patientId={patient.id}
            createdAt={(patient as any).created_at ?? null}
            createdBy={(patient as any).created_by ?? null}
            patientEmail={(patient as any).email ?? null}
            patientPhone={(patient as any).phone ?? null}
            patientName={`${patient.first_name} ${patient.last_name}`}
            contactOwnerName={(patient as any).contact_owner_name ?? null}
          />
        ) : null}

        {medicalTab === "medication" ? (
          <MedicationCard key={patient.id} patientId={patient.id} />
        ) : null}

        {medicalTab === "form_photos" ? (
          <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
            <h3 className="text-sm font-semibold text-slate-900">Form Photos</h3>
            <p className="mt-2 text-xs text-slate-500">
              Photos submitted from patient forms will appear here.
            </p>
          </div>
        ) : null}
      </PatientPageClientWrapper>
    </div>
  );
}
