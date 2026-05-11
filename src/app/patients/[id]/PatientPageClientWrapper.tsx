"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import DocumentPreviewTabsWrapper from "./DocumentPreviewTabsWrapper";
import CrmTabDropdown from "./CrmTabDropdown";

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
  | "document_forms"
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

  const medicalTabs: { id: MedicalTab; label: string }[] = [
    { id: "cockpit", label: t("cockpit") },
    { id: "notes", label: t("consultations") },
    { id: "invoice", label: t("invoiceTab") },
    { id: "medication", label: t("medication") },
    { id: "3d", label: t("threeD") },
    { id: "patient_information", label: t("patientInformation") },
    { id: "documents", label: t("documents") },
    { id: "document_forms", label: t("documentForms") },
    { id: "rendezvous", label: t("rendezvous") },
    { id: "forms", label: t("forms") },
    { id: "crm", label: t("crm") },
  ];

  return (
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
  );
}
