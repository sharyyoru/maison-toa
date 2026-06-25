"use client";

import { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { supabaseClient } from "@/lib/supabaseClient";
import DocumentPreviewTabsWrapper from "./DocumentPreviewTabsWrapper";
import CrmTabDropdown from "./CrmTabDropdown";
import {
  initialPatientRealtimeRevisions,
  PatientRealtimeProvider,
  PatientRealtimeRevisions,
} from "./PatientRealtimeContext";

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

interface PatientPageClientWrapperProps {
  patientId: string;
  medicalTab: MedicalTab;
  children: ReactNode;
}

export default function PatientPageClientWrapper({
  patientId,
  medicalTab,
  children,
}: PatientPageClientWrapperProps) {
  const t = useTranslations("patient.tabs");
  const router = useRouter();
  const [revisions, setRevisions] = useState<PatientRealtimeRevisions>(
    initialPatientRealtimeRevisions,
  );
  const pendingRef = useRef<Partial<Record<keyof PatientRealtimeRevisions, boolean>>>({});
  const debounceRef = useRef<number | null>(null);

  const medicalTabs: { id: MedicalTab; label: string }[] = [
    { id: "cockpit", label: t("cockpit") },
    { id: "notes", label: t("consultations") },
    { id: "invoice", label: t("invoiceTab") },
    { id: "medication", label: t("medication") },
    { id: "3d", label: t("threeD") },
    { id: "patient_information", label: t("patientInformation") },
    { id: "documents", label: t("documents") },
    { id: "rendezvous", label: t("rendezvous") },
    { id: "forms", label: t("forms") },
    { id: "crm", label: t("crm") },
  ];

  useEffect(() => {
    pendingRef.current = {};
    const broadcastChannel =
      typeof BroadcastChannel !== "undefined"
        ? new BroadcastChannel(`patient-realtime-${patientId}`)
        : null;

    function queueRefresh(keys: (keyof PatientRealtimeRevisions)[], force = false) {
      for (const key of keys) pendingRef.current[key] = true;
      if (force && keys.includes("consultationsRevision")) {
        pendingRef.current.forcedConsultationsRevision = true;
      }

      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        const pendingKeys = Object.keys(pendingRef.current) as (keyof PatientRealtimeRevisions)[];
        pendingRef.current = {};
        if (pendingKeys.length === 0) return;

        setRevisions((prev) => {
          const next = { ...prev };
          for (const key of pendingKeys) next[key] += 1;
          return next;
        });

        if (
          pendingKeys.includes("patientRevision") ||
          pendingKeys.includes("billingRevision") ||
          pendingKeys.includes("intakeRevision")
        ) {
          router.refresh();
        }
      }, 500);
    }

    if (broadcastChannel) {
      broadcastChannel.onmessage = (event: MessageEvent) => {
        const data = event.data as {
          type?: string;
          keys?: (keyof PatientRealtimeRevisions)[];
          force?: boolean;
        };
        if (data?.type !== "patient-realtime-refresh" || !Array.isArray(data.keys)) {
          return;
        }

        const validKeys = data.keys.filter((key): key is keyof PatientRealtimeRevisions =>
          key in initialPatientRealtimeRevisions,
        );
        if (validKeys.length > 0) queueRefresh(validKeys, data.force === true);
      };
    }

    async function queueIfInvoiceBelongsToPatient(
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) {
      const row = (payload.new ?? payload.old) as { invoice_id?: string | null };
      if (!row.invoice_id) return;

      const { data } = await supabaseClient
        .from("invoices")
        .select("id")
        .eq("id", row.invoice_id)
        .eq("patient_id", patientId)
        .maybeSingle();

      if (data) queueRefresh(["consultationsRevision", "billingRevision"]);
    }

    async function queueIfTaskBelongsToPatient(
      payload: RealtimePostgresChangesPayload<Record<string, unknown>>,
    ) {
      const row = (payload.new ?? payload.old) as { task_id?: string | null };
      if (!row.task_id) return;

      const { data } = await supabaseClient
        .from("tasks")
        .select("id")
        .eq("id", row.task_id)
        .eq("patient_id", patientId)
        .maybeSingle();

      if (data) queueRefresh(["crmRevision"]);
    }

    const channel = supabaseClient.channel(`patient-realtime-${patientId}`);
    const broadcastRealtimeChannel = supabaseClient.channel(
      `patient-realtime-broadcast-${patientId}`,
    );

    channel
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patients", filter: `id=eq.${patientId}` },
        () => queueRefresh(["patientRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_insurances", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["patientRevision", "intakeRevision", "billingRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "consultations", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["consultationsRevision", "billingRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "invoices", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["consultationsRevision", "billingRevision", "crmRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["rendezvousRevision", "crmRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_notes", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["crmRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "emails", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["crmRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "tasks", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["crmRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "deals", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["crmRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_prescriptions", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["medicationRevision", "consultationsRevision"]),
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "patient_form_submissions", filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["patientRevision"]),
      );

    broadcastRealtimeChannel
      .on(
        "broadcast",
        { event: "patient-realtime-refresh" },
        (payload) => {
          const data = payload.payload as {
            keys?: (keyof PatientRealtimeRevisions)[];
            force?: boolean;
          };
          if (!Array.isArray(data.keys)) return;

          const validKeys = data.keys.filter((key): key is keyof PatientRealtimeRevisions =>
            key in initialPatientRealtimeRevisions,
          );
          if (validKeys.length > 0) queueRefresh(validKeys, data.force === true);
        },
      )
      .subscribe();

    const intakeTables = [
      "patient_intake_submissions",
      "patient_intake_preferences",
      "patient_health_background",
      "patient_measurements",
      "patient_treatment_areas",
      "patient_treatment_preferences",
      "patient_intake_photos",
      "patient_consultation_data",
    ];

    for (const table of intakeTables) {
      channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `patient_id=eq.${patientId}` },
        () => queueRefresh(["intakeRevision"]),
      );
    }

    channel
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_line_items" }, queueIfInvoiceBelongsToPatient)
      .on("postgres_changes", { event: "*", schema: "public", table: "invoice_installments" }, queueIfInvoiceBelongsToPatient)
      .on("postgres_changes", { event: "*", schema: "public", table: "medidata_submissions" }, queueIfInvoiceBelongsToPatient)
      .on("postgres_changes", { event: "*", schema: "public", table: "task_comments" }, queueIfTaskBelongsToPatient)
      .subscribe();

    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
      broadcastChannel?.close();
      supabaseClient.removeChannel(channel);
      supabaseClient.removeChannel(broadcastRealtimeChannel);
    };
  }, [patientId, router]);

  const providerValue = useMemo(() => revisions, [revisions]);

  return (
    <PatientRealtimeProvider revisions={providerValue}>
      <DocumentPreviewTabsWrapper
        patientId={patientId}
        medicalTab={medicalTab}
        medicalTabs={medicalTabs}
        CrmTabDropdown={
          <CrmTabDropdown patientId={patientId} isActive={medicalTab === "crm"} />
        }
      >
        {children}
      </DocumentPreviewTabsWrapper>
    </PatientRealtimeProvider>
  );
}
