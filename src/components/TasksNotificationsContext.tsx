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

type TasksNotificationsContextValue = {
  openTasksCount: number | null;
  refreshOpenTasksCount: () => Promise<void>;
  setOpenTasksCountOptimistic: (updater: (prev: number) => number) => void;
};

const TasksNotificationsContext =
  createContext<TasksNotificationsContextValue | undefined>(undefined);

export function TasksNotificationsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const { user, loading: authLoading } = useAuth();
  const [openTasksCount, setOpenTasksCount] = useState<number | null>(null);

  const refreshOpenTasksCount = useCallback(async () => {
    if (!user) {
      setOpenTasksCount(0);
      return;
    }

    try {
      const { count, error } = await supabaseClient
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("assigned_user_id", user.id)
        .is("assigned_read_at", null);

      if (error) {
        setOpenTasksCount(0);
        return;
      }

      setOpenTasksCount(count ?? 0);
    } catch {
      setOpenTasksCount(0);
    }
  }, [user]);

  useEffect(() => {
    // Wait for auth to load before fetching
    if (authLoading) return;

    let isMounted = true;

    async function load() {
      if (!isMounted) return;
      await refreshOpenTasksCount();
    }

    void load();

    const intervalId = window.setInterval(() => {
      if (!isMounted) return;
      void refreshOpenTasksCount();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [authLoading, refreshOpenTasksCount]);

  const setOpenTasksCountOptimistic = (updater: (prev: number) => number) => {
    setOpenTasksCount((prev) => {
      const base = prev ?? 0;
      const next = updater(base);
      return next < 0 ? 0 : next;
    });
  };

  const value: TasksNotificationsContextValue = {
    openTasksCount,
    refreshOpenTasksCount,
    setOpenTasksCountOptimistic,
  };

  return (
    <TasksNotificationsContext.Provider value={value}>
      {children}
    </TasksNotificationsContext.Provider>
  );
}

export function useTasksNotifications(): TasksNotificationsContextValue {
  const ctx = useContext(TasksNotificationsContext);
  if (!ctx) {
    throw new Error(
      "useTasksNotifications must be used within TasksNotificationsProvider",
    );
  }
  return ctx;
}
