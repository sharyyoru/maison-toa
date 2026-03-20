"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { formatSwissDateTime } from "@/lib/swissTimezone";

type CancelledAppointmentRow = {
  id: string;
  patient_id: string;
  start_time: string;
  end_time: string | null;
  reason: string | null;
  location: string | null;
  patient: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export default function CancelledAppointmentsPage() {
  const [rows, setRows] = useState<CancelledAppointmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [priorityMode, setPriorityMode] = useState<"crm" | "medical">("crm");

  useEffect(() => {
    let isMounted = true;

    async function loadCancelled() {
      try {
        setLoading(true);
        setError(null);

        try {
          const { data: authData } = await supabaseClient.auth.getUser();
          if (isMounted && authData?.user) {
            const meta = (authData.user.user_metadata || {}) as Record<string, unknown>;
            const rawPriority = (meta["priority_mode"] as string) || "";
            const next: "crm" | "medical" =
              rawPriority === "medical" ? "medical" : "crm";
            setPriorityMode(next);
          }
        } catch {
        }

        const { data, error } = await supabaseClient
          .from("appointments")
          .select(
            "id, patient_id, start_time, end_time, reason, location, patient:patients(id, first_name, last_name)",
          )
          .eq("status", "cancelled")
          .order("start_time", { ascending: false });

        if (!isMounted) return;

        if (error || !data) {
          setError(error?.message ?? "Failed to load cancelled appointments.");
          setRows([]);
        } else {
          setRows(data as unknown as CancelledAppointmentRow[]);
        }

        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError("Failed to load cancelled appointments.");
        setRows([]);
        setLoading(false);
      }
    }

    void loadCancelled();

    return () => {
      isMounted = false;
    };
  }, []);

  function buildPatientHref(id: string) {
    if (priorityMode === "medical") {
      return `/patients/${id}?mode=medical`;
    }
    return `/patients/${id}`;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Cancelled appointments</h1>
          <p className="text-xs text-slate-500">
            Log of appointments that were cancelled from the calendar.
          </p>
        </div>
        <Link
          href="/appointments"
          className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
        >
          Back to calendar
        </Link>
      </div>

      <div className="rounded-2xl border border-slate-200/80 bg-white/95 p-4 text-xs shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
        {loading ? (
          <p className="text-[11px] text-slate-500">Loading cancelled appointments...</p>
        ) : error ? (
          <p className="text-[11px] text-red-600">{error}</p>
        ) : rows.length === 0 ? (
          <p className="text-[11px] text-slate-500">No cancelled appointments found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-[11px]">
              <thead className="border-b text-[10px] uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-3 font-medium">Patient</th>
                  <th className="py-2 pr-3 font-medium">Original time</th>
                  <th className="py-2 pr-3 font-medium">Service / reason</th>
                  <th className="py-2 pr-3 font-medium">Location</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => {
                  const p = row.patient;
                  const name = p
                    ? `${p.first_name ?? ""} ${p.last_name ?? ""}`.trim() ||
                      "Unknown patient"
                    : "Unknown patient";
                  const startLabel = formatSwissDateTime(row.start_time);

                  return (
                    <tr key={row.id} className="hover:bg-slate-50/70">
                      <td className="py-2 pr-3 align-top text-sky-700">
                        <Link href={buildPatientHref(row.patient_id)} className="hover:underline">
                          {name}
                        </Link>
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">{startLabel}</td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {row.reason || "—"}
                      </td>
                      <td className="py-2 pr-3 align-top text-slate-700">
                        {row.location || "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
