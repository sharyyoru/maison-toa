"use client";

import { createContext, useContext } from "react";

export type PatientRealtimeRevisions = {
  patientRevision: number;
  consultationsRevision: number;
  billingRevision: number;
  rendezvousRevision: number;
  crmRevision: number;
  intakeRevision: number;
  medicationRevision: number;
  forcedConsultationsRevision: number;
};

export const initialPatientRealtimeRevisions: PatientRealtimeRevisions = {
  patientRevision: 0,
  consultationsRevision: 0,
  billingRevision: 0,
  rendezvousRevision: 0,
  crmRevision: 0,
  intakeRevision: 0,
  medicationRevision: 0,
  forcedConsultationsRevision: 0,
};

const PatientRealtimeContext = createContext<PatientRealtimeRevisions>(
  initialPatientRealtimeRevisions,
);

export function PatientRealtimeProvider({
  revisions,
  children,
}: {
  revisions: PatientRealtimeRevisions;
  children: React.ReactNode;
}) {
  return (
    <PatientRealtimeContext.Provider value={revisions}>
      {children}
    </PatientRealtimeContext.Provider>
  );
}

export function usePatientRealtime() {
  return useContext(PatientRealtimeContext);
}
