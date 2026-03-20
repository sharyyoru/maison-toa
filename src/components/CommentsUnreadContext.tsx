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

type CommentsUnreadContextValue = {
  unreadCount: number | null;
  refreshUnread: () => Promise<void>;
  setUnreadCountOptimistic: (updater: (prev: number) => number) => void;
};

const CommentsUnreadContext = createContext<CommentsUnreadContextValue | undefined>(
  undefined,
);

export function CommentsUnreadProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [unreadCount, setUnreadCount] = useState<number | null>(null);

  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }

    try {

      // Count unread patient note mentions
      const { count: noteCount, error: noteError } = await supabaseClient
        .from("patient_note_mentions")
        .select("id", { count: "exact", head: true })
        .eq("mentioned_user_id", user.id)
        .is("read_at", null);

      // Count unread task comment mentions
      const { count: taskCount, error: taskError } = await supabaseClient
        .from("task_comment_mentions")
        .select("id", { count: "exact", head: true })
        .eq("mentioned_user_id", user.id)
        .is("read_at", null);

      // Count unread email reply notifications
      const { count: emailReplyCount, error: emailReplyError } = await supabaseClient
        .from("email_reply_notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .is("read_at", null);

      if (noteError && taskError && emailReplyError) {
        setUnreadCount(0);
        return;
      }

      setUnreadCount((noteCount ?? 0) + (taskCount ?? 0) + (emailReplyCount ?? 0));
    } catch {
      setUnreadCount(0);
    }
  }, [user]);

  useEffect(() => {
    // Wait for auth to load before fetching
    if (authLoading) return;

    let isMounted = true;

    async function load() {
      if (!isMounted) return;
      await refreshUnread();
    }

    void load();

    const intervalId = window.setInterval(() => {
      if (!isMounted) return;
      void refreshUnread();
    }, 30000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, [authLoading, refreshUnread]);

  const setUnreadCountOptimistic = (updater: (prev: number) => number) => {
    setUnreadCount((prev) => {
      const base = prev ?? 0;
      const next = updater(base);
      return next < 0 ? 0 : next;
    });
  };

  const value: CommentsUnreadContextValue = {
    unreadCount,
    refreshUnread,
    setUnreadCountOptimistic,
  };

  return (
    <CommentsUnreadContext.Provider value={value}>
      {children}
    </CommentsUnreadContext.Provider>
  );
}

export function useCommentsUnread(): CommentsUnreadContextValue {
  const ctx = useContext(CommentsUnreadContext);
  if (!ctx) {
    throw new Error("useCommentsUnread must be used within CommentsUnreadProvider");
  }
  return ctx;
}
