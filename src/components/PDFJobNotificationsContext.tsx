"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { useAuth } from "./AuthContext";

export type PdfJobStatus = "pending" | "processing" | "completed" | "failed";

export type PdfJobNotification = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  invoice_type: string;
  reminder_level: number | null;
  status: PdfJobStatus;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
  pdf_url: string | null;
  pdf_path: string | null;
  patient_id: string | null;
  retry_count: number;
  support_flagged_at: string | null;
  support_flagged_by_user_id: string | null;
  patients: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null;
};

type PDFJobNotificationsContextValue = {
  jobs: PdfJobNotification[];
  loading: boolean;
  error: string | null;
  refreshJobs: () => Promise<void>;
  pendingCount: number;
  completedUnreadCount: number;
  markCompletedAsRead: () => void;
  getJobsForInvoice: (invoiceId: string) => PdfJobNotification[];
  hasPendingJob: (invoiceId: string, invoiceType: string, reminderLevel?: number) => boolean;
  retryJob: (jobId: string) => Promise<boolean>;
  flagJob: (jobId: string) => Promise<boolean>;
  sendJobEmail: (job: PdfJobNotification) => Promise<{ ok: boolean; message: string }>;
  viewJobPdf: (job: PdfJobNotification) => Promise<boolean>;
};

const PDFJobNotificationsContext = createContext<PDFJobNotificationsContextValue | undefined>(
  undefined,
);

const STORAGE_KEY = "pdf-jobs-last-read";

export function PDFJobNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [jobs, setJobs] = useState<PdfJobNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastReadAt, setLastReadAt] = useState<string | null>(null);

  // Restore last-read timestamp from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setLastReadAt(raw);
    } catch {
      // ignore
    }
  }, []);

  const refreshJobs = useCallback(async () => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!user || !accessToken) {
      setJobs([]);
      setLoading(false);
      return;
    }

    try {
      setError(null);
      const res = await fetch("/api/invoices/pdf-jobs?limit=50&forAll=true", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      const data = await res.json();
      setJobs((data.jobs || []) as PdfJobNotification[]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("[PDFJobsContext] Error fetching jobs:", message);
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [user]);

  // Poll: every 30s in background, refresh on mount
  useEffect(() => {
    if (authLoading) return;
    refreshJobs();
    const interval = setInterval(refreshJobs, 30000);
    return () => clearInterval(interval);
  }, [authLoading, refreshJobs]);

  // Fast poll when there are pending/processing jobs
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === "pending" || j.status === "processing");
    if (!hasActive) return;
    const interval = setInterval(refreshJobs, 5000);
    return () => clearInterval(interval);
  }, [jobs, refreshJobs]);

  const markCompletedAsRead = useCallback(() => {
    const now = new Date().toISOString();
    setLastReadAt(now);
    try {
      localStorage.setItem(STORAGE_KEY, now);
    } catch {
      // ignore
    }
  }, []);

  const pendingCount = jobs.filter(j => j.status === "pending" || j.status === "processing").length;

  const completedUnreadCount = jobs.filter(
    j =>
      j.status === "completed" &&
      (!lastReadAt || new Date(j.completed_at || j.created_at) > new Date(lastReadAt))
  ).length;

  const getJobsForInvoice = useCallback(
    (invoiceId: string) => jobs.filter(j => j.invoice_id === invoiceId),
    [jobs]
  );

  const hasPendingJob = useCallback(
    (invoiceId: string, invoiceType: string, reminderLevel = 1) =>
      jobs.some(
        j =>
          j.invoice_id === invoiceId &&
          j.invoice_type === invoiceType &&
          (invoiceType !== "reminder" || (j.reminder_level || 1) === reminderLevel) &&
          (j.status === "pending" || j.status === "processing")
      ),
    [jobs]
  );

  const retryJob = useCallback(async (jobId: string): Promise<boolean> => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return false;
    try {
      const res = await fetch(`/api/invoices/pdf-jobs/retry/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        await refreshJobs();
        return true;
      }
      return false;
    } catch (err) {
      console.error("[PDFJobsContext] retryJob error:", err);
      return false;
    }
  }, [refreshJobs]);

  const flagJob = useCallback(async (jobId: string): Promise<boolean> => {
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return false;
    try {
      const res = await fetch(`/api/invoices/pdf-jobs/flag/${jobId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) {
        await refreshJobs();
        return true;
      }
      return false;
    } catch (err) {
      console.error("[PDFJobsContext] flagJob error:", err);
      return false;
    }
  }, [refreshJobs]);

  const sendJobEmail = useCallback(async (job: PdfJobNotification): Promise<{ ok: boolean; message: string }> => {
    if (!job.patients?.email) {
      return { ok: false, message: "Patient has no email address" };
    }
    if (!job.pdf_path) {
      return { ok: false, message: "PDF path is missing" };
    }
    const { data: sessionData } = await supabaseClient.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) {
      return { ok: false, message: "You must be signed in" };
    }
    try {
      const res = await fetch("/api/invoices/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          invoiceId: job.invoice_id,
          recipientEmail: job.patients.email,
          documentType: job.invoice_type,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        return { ok: true, message: `Sent to ${job.patients.email}` };
      }
      return { ok: false, message: data.error || "Failed to send email" };
    } catch (err) {
      console.error("[PDFJobsContext] sendJobEmail error:", err);
      return { ok: false, message: err instanceof Error ? err.message : "Failed to send email" };
    }
  }, []);

  const viewJobPdf = useCallback(async (job: PdfJobNotification): Promise<boolean> => {
    if (!job.pdf_path) return false;
    try {
      const { data, error } = await supabaseClient.storage
        .from("invoice-pdfs")
        .createSignedUrl(job.pdf_path, 60);
      if (error || !data?.signedUrl) return false;
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return true;
    } catch (err) {
      console.error("[PDFJobsContext] viewJobPdf error:", err);
      return false;
    }
  }, []);

  return (
    <PDFJobNotificationsContext.Provider
      value={{
        jobs,
        loading,
        error,
        refreshJobs,
        pendingCount,
        completedUnreadCount,
        markCompletedAsRead,
        getJobsForInvoice,
        hasPendingJob,
        retryJob,
        flagJob,
        sendJobEmail,
        viewJobPdf,
      }}
    >
      {children}
    </PDFJobNotificationsContext.Provider>
  );
}

export function usePDFJobNotifications() {
  const ctx = useContext(PDFJobNotificationsContext);
  if (!ctx) {
    throw new Error("usePDFJobNotifications must be used within PDFJobNotificationsProvider");
  }
  return ctx;
}
