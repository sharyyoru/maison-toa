"use client";

import { useRouter } from "next/navigation";
import { useTasksNotifications } from "@/components/TasksNotificationsContext";

export default function HeaderTasksButton() {
  const router = useRouter();
  const { openTasksCount } = useTasksNotifications();

  const count = openTasksCount ?? 0;
  const displayCount = count > 9 ? "9+" : count;
  const hasOpen = count > 0;

  return (
    <button
      type="button"
      onClick={() => router.push("/tasks")}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
      title="Tasks"
    >
      <span className="sr-only">Tasks</span>
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      {hasOpen ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-amber-500 px-1 text-[9px] font-semibold text-white shadow-sm">
          {displayCount}
        </span>
      ) : null}
    </button>
  );
}
