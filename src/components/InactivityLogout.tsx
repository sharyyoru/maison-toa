"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { clearDemoCache } from "@/lib/demoMode";
import { supabaseClient } from "@/lib/supabaseClient";

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000;
const CHECK_INTERVAL_MS = 15 * 1000;
const ACTIVITY_WRITE_THROTTLE_MS = 5 * 1000;

const LAST_ACTIVITY_KEY = "maison-toa:last-activity-at";
const LOGOUT_MARKER_KEY = "maison-toa:inactivity-logout-at";

const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "focus",
] as const;

function readStoredTimestamp(key: string): number | null {
  try {
    const value = window.localStorage.getItem(key);
    if (!value) return null;

    const timestamp = Number(value);
    return Number.isFinite(timestamp) ? timestamp : null;
  } catch {
    return null;
  }
}

function writeStoredTimestamp(key: string, timestamp: number): boolean {
  try {
    window.localStorage.setItem(key, String(timestamp));
    return true;
  } catch {
    return false;
  }
}

export default function InactivityLogout() {
  const router = useRouter();
  const fallbackLastActivityRef = useRef(Date.now());
  const lastActivityWriteRef = useRef(0);
  const isLoggingOutRef = useRef(false);

  useEffect(() => {
    function getLastActivity() {
      return readStoredTimestamp(LAST_ACTIVITY_KEY) ?? fallbackLastActivityRef.current;
    }

    function markActivity(forceWrite = false) {
      if (isLoggingOutRef.current) return;

      const now = Date.now();
      fallbackLastActivityRef.current = now;

      if (!forceWrite && now - lastActivityWriteRef.current < ACTIVITY_WRITE_THROTTLE_MS) {
        return;
      }

      if (writeStoredTimestamp(LAST_ACTIVITY_KEY, now)) {
        lastActivityWriteRef.current = now;
      }
    }

    async function logout() {
      if (isLoggingOutRef.current) return;
      isLoggingOutRef.current = true;

      writeStoredTimestamp(LOGOUT_MARKER_KEY, Date.now());

      await supabaseClient.auth.signOut();
      clearDemoCache();
      router.replace("/login");
      router.refresh();
    }

    function checkInactivity() {
      if (Date.now() - getLastActivity() >= INACTIVITY_TIMEOUT_MS) {
        void logout();
      }
    }

    function handleActivity() {
      markActivity();
    }

    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;

      if (Date.now() - getLastActivity() >= INACTIVITY_TIMEOUT_MS) {
        void logout();
        return;
      }

      markActivity(true);
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === LOGOUT_MARKER_KEY && event.newValue) {
        void logout();
      }
    }

    markActivity(true);

    const intervalId = window.setInterval(checkInactivity, CHECK_INTERVAL_MS);

    ACTIVITY_EVENTS.forEach(eventName => {
      window.addEventListener(eventName, handleActivity, { passive: true });
    });
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      window.clearInterval(intervalId);
      ACTIVITY_EVENTS.forEach(eventName => {
        window.removeEventListener(eventName, handleActivity);
      });
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [router]);

  return null;
}
