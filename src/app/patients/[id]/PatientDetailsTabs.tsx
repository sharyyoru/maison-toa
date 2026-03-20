"use client";

import { useState } from "react";

type TabKey = "primary" | "address" | "insurance";

export default function PatientDetailsTabs({
  patient,
  insurance,
}: {
  // Supabase row shapes; kept loose here for simplicity
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  patient: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insurance: any[];
}) {
  const [activeTab, setActiveTab] = useState<TabKey>("primary");

  // Defensive: ensure insurance is always an array
  const safeInsurance = Array.isArray(insurance) ? insurance : [];

  const fullName = `${patient.first_name ?? ""} ${patient.last_name ?? ""}`.trim();

  function handleCopy(value?: string | null) {
    const text = (value ?? "").toString().trim();
    if (!text || typeof navigator === "undefined" || !navigator.clipboard) return;
    navigator.clipboard.writeText(text).catch(() => {
      // ignore clipboard errors
    });
  }

  return (
    <div className="w-full h-full">
      <div className="flex h-full flex-col rounded-xl border border-slate-200/80 bg-white/90 px-4 pb-4 pt-5 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)] backdrop-blur">
        <div className="mb-4 flex justify-center">
          <div className="inline-flex min-w-[260px] justify-center rounded-full border border-slate-200/80 bg-white/80 px-1.5 py-0.5 text-xs shadow-sm backdrop-blur">
            {(
              [
                { key: "primary" as TabKey, label: "Primary details" },
                { key: "address" as TabKey, label: "Address & background" },
                { key: "insurance" as TabKey, label: "Insurance" },
              ]
            ).map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={
                  "rounded-full px-4 py-1 text-[11px] font-medium transition-colors " +
                  (activeTab === tab.key
                    ? "bg-emerald-500 text-white shadow-sm"
                    : "bg-transparent text-slate-700 hover:bg-slate-100/80")
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === "primary" ? (
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Full name:
              </dt>
              <dd className="flex items-center gap-2 text-[11px] font-medium text-slate-900">
                <span>{fullName || "—"}</span>
                {fullName ? (
                  <button
                    type="button"
                    onClick={() => handleCopy(fullName)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    aria-label="Copy full name"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <rect x="4" y="4" width="9" height="9" rx="1.5" />
                      <path d="M8 8h5.5A1.5 1.5 0 0 1 15 9.5V15" />
                    </svg>
                  </button>
                ) : null}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Email:
              </dt>
              <dd className="flex items-center gap-2 text-[11px] font-medium text-slate-900">
                <span>{patient.email ?? "—"}</span>
                {patient.email ? (
                  <button
                    type="button"
                    onClick={() => handleCopy(patient.email)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    aria-label="Copy email"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <rect x="4" y="4" width="9" height="9" rx="1.5" />
                      <path d="M8 8h5.5A1.5 1.5 0 0 1 15 9.5V15" />
                    </svg>
                  </button>
                ) : null}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Phone:
              </dt>
              <dd className="flex items-center gap-2 text-[11px] font-medium text-slate-900">
                <span>{patient.phone ?? "—"}</span>
                {patient.phone ? (
                  <button
                    type="button"
                    onClick={() => handleCopy(patient.phone)}
                    className="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100"
                    aria-label="Copy phone"
                  >
                    <svg
                      className="h-3 w-3"
                      viewBox="0 0 20 20"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.6"
                    >
                      <rect x="4" y="4" width="9" height="9" rx="1.5" />
                      <path d="M8 8h5.5A1.5 1.5 0 0 1 15 9.5V15" />
                    </svg>
                  </button>
                ) : null}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Source:
              </dt>
              <dd className="text-[11px] font-medium capitalize text-slate-900">
                {patient.source ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Date of birth:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.dob ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Marital status:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.marital_status ?? "—"}
              </dd>
            </div>
          </dl>
        ) : null}

        {activeTab === "address" ? (
          <dl className="divide-y divide-slate-100 text-sm">
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Nationality:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.nationality ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Street address:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.street_address ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Postal code:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.postal_code ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Town:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.town ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Profession:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.profession ?? "—"}
              </dd>
            </div>
            <div className="flex items-start gap-2 py-2 first:pt-0 last:pb-0">
              <dt className="min-w-[120px] text-[11px] font-medium text-slate-500">
                Current employer:
              </dt>
              <dd className="text-[11px] font-medium text-slate-900">
                {patient.current_employer ?? "—"}
              </dd>
            </div>
          </dl>
        ) : null}

        {activeTab === "insurance" ? (
          <div className="space-y-3">
            {safeInsurance.length === 0 ? (
              <p className="text-sm text-slate-500">
                No insurance information on file.
              </p>
            ) : (
              <div className="space-y-3">
                {safeInsurance.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-slate-50/80 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-slate-900">
                        {item.provider_name}
                      </p>
                      <p className="text-xs text-slate-500">
                        Card {item.card_number}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p className="font-semibold uppercase tracking-wide text-slate-700">
                        {item.insurance_type.replace("_", "-").toUpperCase()}
                      </p>
                      {item.created_at ? (
                        <p>
                          Added {new Date(item.created_at).toLocaleDateString()}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
