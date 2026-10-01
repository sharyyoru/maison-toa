"use client";

import { useEffect } from "react";
import { usePatientTabs } from "@/components/PatientTabsContext";
import { prefetchPatientDocuments } from "@/lib/patientDocumentPrefetch";

interface PatientTabRegistrarProps {
  patientId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
  prefetchDocuments?: boolean;
}

export default function PatientTabRegistrar({
  patientId,
  firstName,
  lastName,
  avatarUrl,
  prefetchDocuments = true,
}: PatientTabRegistrarProps) {
  const { addTab } = usePatientTabs();

  useEffect(() => {
    addTab({
      id: patientId,
      firstName,
      lastName,
      avatarUrl,
    });
  }, [patientId, firstName, lastName, avatarUrl, addTab]);

  useEffect(() => {
    if (prefetchDocuments) prefetchPatientDocuments(patientId, `${firstName} ${lastName}`);
  }, [patientId, firstName, lastName, prefetchDocuments]);

  return null;
}
