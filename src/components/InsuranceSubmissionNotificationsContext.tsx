"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
} from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthContext";

export type InsuranceSubmissionStatus = "pending" | "processing" | "completed" | "failed";

export type InsuranceSubmissionNotification = {
  id: string;
  invoice_id: string;
  patient_id: string | null;
  submission_id: string | null;
  invoice_number: string | null;
  status: InsuranceSubmissionStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  retry_count: number;
  created_by_user_id: string | null;
  support_flagged_at: string | null;
  support_flagged_by_user_id: string | null;
  payload: Record<string, any>;
  patients: { first_name: string | null; last_name: string | null; email: string | null } | null;
};

type InsuranceSubmissionNotificationsContextValue = {
  jobs: InsuranceSubmissionNotification[];
  loading: boolean;
  error: string | null;
  pendingCount: number;
  completedUnreadCount: number;
  refreshJobs: () => Promise<void>;
  markCompletedAsRead: () => void;
  hasPendingJob: (invoiceId: string) => boolean;
  getJobsForInvoice: (invoiceId: string) => InsuranceSubmissionNotification[];
  retryJob: (jobId: string) => Promise<boolean>;
  flagJob: (jobId: string) => Promise<boolean>;
};

const InsuranceSubmissionNotificationsContext = createContext<
  InsuranceSubmissionNotificationsContextValue | undefined
>(undefined);

export function InsuranceSubmissionNotificationsProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user } = useAuth();
  const [jobs, setJobs] = useState<InsuranceSubmissionNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const lastSeenRef = useRef<string | null>(null);

  const fetchJobs = useCallback(async () => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await fetch("/api/medidata/submission-jobs?limit=50&forAll=true", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      const fetchedJobs = (data.jobs || []) as InsuranceSubmissionNotification[];
      setJobs(fetchedJobs);
      setLoading(false);
    } catch (err) {
      console.error("[InsuranceSubmissionContext] fetch error:", err);
      setError(err instanceof Error ? err.message : "Failed to fetch");
      setLoading(false);
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    setLoading(true);
    await fetchJobs();
  }, [fetchJobs]);

  const markCompletedAsRead = useCallback(() => {
    const completedIds = jobs
      .filter((j) => j.status === "completed" && j.completed_at)
      .map((j) => j.id);
    setReadIds((prev) => new Set([...prev, ...completedIds]));
  }, [jobs]);

  const retryJob = useCallback(async (jobId: string): Promise<boolean> => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return false;
    try {
      const res = await fetch(`/api/medidata/submission-jobs/retry/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        await refreshJobs();
        return true;
      }
      return false;
    } catch (err) {
      console.error("[InsuranceSubmissionContext] retry error:", err);
      return false;
    }
  }, [refreshJobs]);

  const flagJob = useCallback(async (jobId: string): Promise<boolean> => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return false;
    try {
      const res = await fetch(`/api/medidata/submission-jobs/flag/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        await refreshJobs();
        return true;
      }
      return false;
    } catch (err) {
      console.error("[InsuranceSubmissionContext] flag error:", err);
      return false;
    }
  }, [refreshJobs]);

  const hasPendingJob = useCallback((invoiceId: string) => {
    return jobs.some(
      (j) => j.invoice_id === invoiceId && (j.status === "pending" || j.status === "processing")
    );
  }, [jobs]);

  const getJobsForInvoice = useCallback((invoiceId: string) => {
    return jobs.filter((j) => j.invoice_id === invoiceId);
  }, [jobs]);

  // Initial fetch and polling
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    fetchJobs();
    const interval = setInterval(fetchJobs, 30000);
    return () => clearInterval(interval);
  }, [user, fetchJobs]);

  // Fast polling when there are pending/processing jobs
  const hasActiveJobs = jobs.some((j) => j.status === "pending" || j.status === "processing");
  useEffect(() => {
    if (!hasActiveJobs) return;
    const fastInterval = setInterval(fetchJobs, 5000);
    return () => clearInterval(fastInterval);
  }, [hasActiveJobs, fetchJobs]);

  // Beep when a job completes
  useEffect(() => {
    if (lastSeenRef.current === null) {
      lastSeenRef.current = jobs
        .filter((j) => j.status === "completed" && j.completed_at)
        .map((j) => j.id)
        .join(",");
      return;
    }
    const completedIds = jobs
      .filter((j) => j.status === "completed" && j.completed_at)
      .map((j) => j.id);
    const lastSeenSet = new Set(lastSeenRef.current.split(",").filter(Boolean));
    const newCompleted = completedIds.filter((id) => !lastSeenSet.has(id));
    if (newCompleted.length > 0 && typeof window !== "undefined") {
      try {
        const audio = new Audio("/sounds/notification.mp3");
        void audio.play().catch(() => {});
      } catch {
        // ignore
      }
      lastSeenRef.current = completedIds.join(",");
    }
  }, [jobs]);

  const pendingCount = jobs.filter((j) => j.status === "pending" || j.status === "processing").length;
  const completedUnreadCount = jobs.filter(
    (j) => j.status === "completed" && j.completed_at && !readIds.has(j.id)
  ).length;

  return (
    <InsuranceSubmissionNotificationsContext.Provider
      value={{
        jobs,
        loading,
        error,
        pendingCount,
        completedUnreadCount,
        refreshJobs,
        markCompletedAsRead,
        hasPendingJob,
        getJobsForInvoice,
        retryJob,
        flagJob,
      }}
    >
      {children}
    </InsuranceSubmissionNotificationsContext.Provider>
  );
}

export function useInsuranceSubmissionNotifications() {
  const ctx = useContext(InsuranceSubmissionNotificationsContext);
  if (!ctx) {
    throw new Error("useInsuranceSubmissionNotifications must be used within InsuranceSubmissionNotificationsProvider");
  }
  return ctx;
}
