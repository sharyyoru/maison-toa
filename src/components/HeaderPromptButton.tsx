"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

export default function HeaderPromptButton() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [checked, setChecked] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAdmin() {
      try {
        const { data } = await supabaseClient.auth.getUser();
        if (!isMounted) return;

        const user = data?.user;
        if (!user) {
          setIsAdmin(false);
          setChecked(true);
          return;
        }

        const meta = (user.user_metadata || {}) as Record<string, unknown>;
        const role = ((meta["role"] as string) || "").toLowerCase();
        setIsAdmin(role === "admin");
        setChecked(true);
      } catch {
        if (isMounted) {
          setIsAdmin(false);
          setChecked(true);
        }
      }
    }

    void checkAdmin();

    const {
      data: { subscription },
    } = supabaseClient.auth.onAuthStateChange(() => {
      void checkAdmin();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  if (!checked || !isAdmin) return null;

  return (
    <button
      type="button"
      onClick={() => router.push("/prompt")}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
      title="AI Knowledge Base"
    >
      <span className="sr-only">AI Knowledge Base</span>
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3v3" />
        <path d="M12 18v3" />
        <path d="M3 12h3" />
        <path d="M18 12h3" />
        <path d="M5.6 5.6l2.1 2.1" />
        <path d="M16.3 16.3l2.1 2.1" />
        <path d="M5.6 18.4l2.1-2.1" />
        <path d="M16.3 7.7l2.1-2.1" />
        <circle cx="12" cy="12" r="3" />
      </svg>
    </button>
  );
}
