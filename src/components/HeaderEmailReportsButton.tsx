"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthContext";

export default function HeaderEmailReportsButton() {
  const router = useRouter();
  const { user } = useAuth();

  return (
    <button
      type="button"
      onClick={() => {
        const params = new URLSearchParams();
        if (user?.email) params.set("doctor_email", user.email);
        const query = params.toString();
        router.push(query ? `/email-reports?${query}` : "/email-reports");
      }}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-300 dark:hover:bg-slate-600"
      title="All patient emails"
    >
      <span className="sr-only">All patient emails</span>
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="m3 7 9 6 9-6" />
      </svg>
    </button>
  );
}
