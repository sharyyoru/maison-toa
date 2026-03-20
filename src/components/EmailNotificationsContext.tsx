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

type EmailNotification = {
  id: string;
  created_at: string;
  read_at: string | null;
  patient_id: string;
  original_email_id: string;
  reply_email_id: string;
  reply_email: {
    id: string;
    subject: string | null;
    body: string | null;
    from_address: string | null;
    sent_at: string | null;
    created_at: string | null;
  } | null;
  patient: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

type EmailNotificationsContextValue = {
  unreadCount: number | null;
  notifications: EmailNotification[];
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

const EmailNotificationsContext = createContext<EmailNotificationsContextValue | undefined>(
  undefined,
);

export function EmailNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<EmailNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      // Fetch email reply notifications with simpler query
      const { data, error } = await supabaseClient
        .from("email_reply_notifications")
        .select(
          "id, created_at, read_at, patient_id, original_email_id, reply_email_id",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching email notifications:", error);
        setUnreadCount(0);
        setNotifications([]);
        setLoading(false);
        return;
      }

      if (!data || data.length === 0) {
        setUnreadCount(0);
        setNotifications([]);
        setLoading(false);
        return;
      }

      // Fetch related emails and patients separately for reliability
      const replyEmailIds = data.map(n => n.reply_email_id).filter(Boolean);
      const patientIds = [...new Set(data.map(n => n.patient_id).filter(Boolean))];

      // Fetch reply emails
      let emailsMap: Record<string, { id: string; subject: string | null; body: string | null; from_address: string | null; sent_at: string | null; created_at: string | null }> = {};
      if (replyEmailIds.length > 0) {
        const { data: emails } = await supabaseClient
          .from("emails")
          .select("id, subject, body, from_address, sent_at, created_at")
          .in("id", replyEmailIds);
        if (emails) {
          emailsMap = Object.fromEntries(emails.map(e => [e.id, e]));
        }
      }

      // Fetch patients
      let patientsMap: Record<string, { id: string; first_name: string | null; last_name: string | null }> = {};
      if (patientIds.length > 0) {
        const { data: patients } = await supabaseClient
          .from("patients")
          .select("id, first_name, last_name")
          .in("id", patientIds);
        if (patients) {
          patientsMap = Object.fromEntries(patients.map(p => [p.id, p]));
        }
      }

      // Combine data
      const typedData: EmailNotification[] = data.map(n => ({
        id: n.id,
        created_at: n.created_at,
        read_at: n.read_at,
        patient_id: n.patient_id,
        original_email_id: n.original_email_id,
        reply_email_id: n.reply_email_id,
        reply_email: n.reply_email_id ? emailsMap[n.reply_email_id] || null : null,
        patient: n.patient_id ? patientsMap[n.patient_id] || null : null,
      }));

      setNotifications(typedData);
      setUnreadCount(typedData.filter(n => !n.read_at).length);
      setLoading(false);
    } catch (err) {
      console.error("Error in refreshNotifications:", err);
      setUnreadCount(0);
      setNotifications([]);
      setLoading(false);
    }
  }, [user]);

  const markAsRead = async (id: string) => {
    try {
      const nowIso = new Date().toISOString();
      await supabaseClient
        .from("email_reply_notifications")
        .update({ read_at: nowIso })
        .eq("id", id);

      setNotifications(prev => 
        prev.map(n => n.id === id ? { ...n, read_at: nowIso } : n)
      );
      setUnreadCount(prev => Math.max(0, (prev ?? 0) - 1));
    } catch {
      // Silent fail
    }
  };

  const markAllAsRead = useCallback(async () => {
    if (!user) return;

    try {
      const nowIso = new Date().toISOString();
      await supabaseClient
        .from("email_reply_notifications")
        .update({ read_at: nowIso })
        .eq("user_id", user.id)
        .is("read_at", null);

      setNotifications(prev => 
        prev.map(n => ({ ...n, read_at: n.read_at || nowIso }))
      );
      setUnreadCount(0);
    } catch {
      // Silent fail
    }
  }, [user]);

  useEffect(() => {
    // Wait for auth to load before fetching
    if (authLoading) return;

    let isMounted = true;

    async function load() {
      if (!isMounted) return;
      await refreshNotifications();
    }

    void load();

    const intervalId = window.setInterval(() => {
      if (!isMounted) return;
      void refreshNotifications();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [authLoading, refreshNotifications]);

  const value: EmailNotificationsContextValue = {
    unreadCount,
    notifications,
    loading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
  };

  return (
    <EmailNotificationsContext.Provider value={value}>
      {children}
    </EmailNotificationsContext.Provider>
  );
}

export function useEmailNotifications(): EmailNotificationsContextValue {
  const ctx = useContext(EmailNotificationsContext);
  if (!ctx) {
    throw new Error("useEmailNotifications must be used within EmailNotificationsProvider");
  }
  return ctx;
}
