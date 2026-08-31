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
      const [unfinishedResult, taskCommentsResult] = await Promise.all([
        supabaseClient
          .from("tasks")
          .select("id", { count: "exact", head: true })
          .eq("assigned_user_id", user.id)
          .neq("status", "completed"),
        supabaseClient
          .from("task_comment_mentions")
          .select("id", { count: "exact", head: true })
          .eq("mentioned_user_id", user.id)
          .is("read_at", null),
      ]);

      if (unfinishedResult.error && taskCommentsResult.error) {
        setOpenTasksCount(0);
        return;
      }

      setOpenTasksCount(
        (unfinishedResult.count ?? 0) + (taskCommentsResult.count ?? 0),
      );
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
    const handleTaskStatusChanged = () => void refreshOpenTasksCount();
    window.addEventListener("task-status-changed", handleTaskStatusChanged);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener("task-status-changed", handleTaskStatusChanged);
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
