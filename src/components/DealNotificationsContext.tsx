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
import { usePathname } from "next/navigation";

const PUBLIC_STANDALONE_ROUTES = [
  "/login",
  "/book-appointment",
  "/intake",
  "/onboarding",
  "/invoice/pay",
  "/consultations",
  "/embed",
  "/form",
  "/appointments/manage",
  "/register",
];

type DealNotification = {
  id: string;
  created_at: string;
  read_at: string | null;
  deal_id: string;
  patient_id: string;
  notification_type: 'stage_changed' | 'deal_created' | 'deal_assigned' | 'deal_updated';
  old_stage_name: string | null;
  new_stage_name: string | null;
  changed_by_name: string | null;
  patient: {
    id: string;
    first_name: string | null;
    last_name: string | null;
  } | null;
  deal: {
    id: string;
    title: string | null;
  } | null;
};

type DealNotificationsContextValue = {
  unreadCount: number | null;
  notifications: DealNotification[];
  loading: boolean;
  refreshNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
};

const DealNotificationsContext = createContext<DealNotificationsContextValue | undefined>(
  undefined,
);

export function DealNotificationsProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const pathname = usePathname();
  const isPublicRoute = PUBLIC_STANDALONE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
  const [unreadCount, setUnreadCount] = useState<number | null>(null);
  const [notifications, setNotifications] = useState<DealNotification[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshNotifications = useCallback(async () => {
    if (!user || isPublicRoute) {
      setUnreadCount(0);
      setNotifications([]);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabaseClient
        .from("deal_notifications")
        .select(
          "id, created_at, read_at, deal_id, patient_id, notification_type, old_stage_name, new_stage_name, changed_by_name",
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (error) {
        console.error("Error fetching deal notifications:", error);
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

      const dealIds = [...new Set(data.map(n => n.deal_id).filter(Boolean))];
      const patientIds = [...new Set(data.map(n => n.patient_id).filter(Boolean))];

      let dealsMap: Record<string, { id: string; title: string | null }> = {};
      if (dealIds.length > 0) {
        const { data: deals } = await supabaseClient
          .from("deals")
          .select("id, title")
          .in("id", dealIds);
        if (deals) {
          dealsMap = Object.fromEntries(deals.map(d => [d.id, d]));
        }
      }

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

      const typedData: DealNotification[] = data.map(n => ({
        id: n.id,
        created_at: n.created_at,
        read_at: n.read_at,
        deal_id: n.deal_id,
        patient_id: n.patient_id,
        notification_type: n.notification_type,
        old_stage_name: n.old_stage_name,
        new_stage_name: n.new_stage_name,
        changed_by_name: n.changed_by_name,
        patient: n.patient_id ? patientsMap[n.patient_id] || null : null,
        deal: n.deal_id ? dealsMap[n.deal_id] || null : null,
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
  }, [isPublicRoute, user]);

  const markAsRead = async (id: string) => {
    try {
      const nowIso = new Date().toISOString();
      await supabaseClient
        .from("deal_notifications")
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
        .from("deal_notifications")
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

  const value: DealNotificationsContextValue = {
    unreadCount,
    notifications,
    loading,
    refreshNotifications,
    markAsRead,
    markAllAsRead,
  };

  return (
    <DealNotificationsContext.Provider value={value}>
      {children}
    </DealNotificationsContext.Provider>
  );
}

export function useDealNotifications(): DealNotificationsContextValue {
  const ctx = useContext(DealNotificationsContext);
  if (!ctx) {
    throw new Error("useDealNotifications must be used within DealNotificationsProvider");
  }
  return ctx;
}
