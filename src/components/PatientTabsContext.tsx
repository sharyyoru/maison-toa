"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";

export interface PatientTab {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string | null;
}

interface PatientTabsContextValue {
  tabs: PatientTab[];
  activePatientId: string | null;
  addTab: (patient: PatientTab) => void;
  removeTab: (patientId: string) => void;
  clearAllTabs: () => void;
}

const PatientTabsContext = createContext<PatientTabsContextValue | undefined>(undefined);

const STORAGE_KEY = "patient-tabs";
const MAX_TABS = 10;

export function PatientTabsProvider({ children }: { children: ReactNode }) {
  const [tabs, setTabs] = useState<PatientTab[]>([]);
  const [isHydrated, setIsHydrated] = useState(false);
  const pathname = usePathname();

  // Derive active patient ID from URL
  const activePatientId = pathname?.match(/^\/patients\/([^\/]+)/)?.[1] ?? null;

  // Load tabs from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setTabs(parsed.slice(0, MAX_TABS));
        }
      }
    } catch (e) {
      console.error("Failed to load patient tabs from localStorage:", e);
    }
    setIsHydrated(true);
  }, []);

  // Save tabs to localStorage when they change
  useEffect(() => {
    if (isHydrated) {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tabs));
      } catch (e) {
        console.error("Failed to save patient tabs to localStorage:", e);
      }
    }
  }, [tabs, isHydrated]);

  const addTab = useCallback((patient: PatientTab) => {
    setTabs((prev) => {
      // Check if tab already exists
      const existingIndex = prev.findIndex((t) => t.id === patient.id);
      if (existingIndex !== -1) {
        // Update existing tab info in place (keep position)
        const updated = [...prev];
        updated[existingIndex] = patient;
        return updated;
      }
      // Add new tab, respecting max limit
      const newTabs = [...prev, patient];
      if (newTabs.length > MAX_TABS) {
        return newTabs.slice(-MAX_TABS);
      }
      return newTabs;
    });
  }, []);

  const removeTab = useCallback((patientId: string) => {
    setTabs((prev) => prev.filter((t) => t.id !== patientId));
  }, []);

  const clearAllTabs = useCallback(() => {
    setTabs([]);
  }, []);

  return (
    <PatientTabsContext.Provider
      value={{
        tabs,
        activePatientId,
        addTab,
        removeTab,
        clearAllTabs,
      }}
    >
      {children}
    </PatientTabsContext.Provider>
  );
}

export function usePatientTabs() {
  const context = useContext(PatientTabsContext);
  if (context === undefined) {
    throw new Error("usePatientTabs must be used within a PatientTabsProvider");
  }
  return context;
}

// Hook to register a patient in tabs when viewing their page
export function useRegisterPatientTab(patient: PatientTab | null) {
  const { addTab } = usePatientTabs();

  useEffect(() => {
    if (patient) {
      addTab(patient);
    }
  }, [patient, addTab]);
}
