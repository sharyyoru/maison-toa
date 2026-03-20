"use client";

import { useEffect } from "react";
import { usePatientTabs } from "@/components/PatientTabsContext";

interface PatientTabRegistrarProps {
  patientId: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

export default function PatientTabRegistrar({
  patientId,
  firstName,
  lastName,
  avatarUrl,
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

  return null;
}
