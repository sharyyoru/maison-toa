"use client";

import { useRouter } from "next/navigation";
import { useCommentsUnread } from "@/components/CommentsUnreadContext";

export default function HeaderCommentsButton() {
  const router = useRouter();
  const { unreadCount } = useCommentsUnread();

  const displayCount = unreadCount && unreadCount > 9 ? "9+" : unreadCount ?? 0;
  const hasUnread = (unreadCount ?? 0) > 0;

  return (
    <button
      type="button"
      onClick={() => router.push("/comments")}
      className="relative inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
    >
      <span className="sr-only">Comments</span>
      <svg
        className="h-4 w-4"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4 6h16v9H7l-3 3z" />
      </svg>
      {hasUnread ? (
        <span className="absolute -top-0.5 -right-0.5 inline-flex min-h-[14px] min-w-[14px] items-center justify-center rounded-full bg-sky-500 px-1 text-[9px] font-semibold text-white shadow-sm">
          {displayCount}
        </span>
      ) : null}
    </button>
  );
}
