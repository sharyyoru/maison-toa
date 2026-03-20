"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const APP_LINKS = [
  { href: "/", label: "Dashboard" },
  { href: "/patients", label: "Patients" },
  { href: "/appointments", label: "Calendar" },
  { href: "/deals", label: "Deals & Pipeline" },
  { href: "/financials", label: "Financials" },
  { href: "/services", label: "Services" },
  { href: "/tasks", label: "Tasks" },
  { href: "/users", label: "User Management" },
  { href: "/workflows", label: "Workflows" },
  { href: "/chat", label: "Chat" },
  { href: "/settings", label: "Settings" },
];

export default function AppMenuLauncher() {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const el = containerRef.current;
      if (!el) return;
      if (!el.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
        aria-label="Open app menu"
      >
        <span className="grid h-4 w-4 grid-cols-3 grid-rows-3 gap-[2px]">
          {Array.from({ length: 9 }).map((_, index) => (
            <span
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className="h-[3px] w-[3px] rounded-full bg-slate-500"
            />
          ))}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl border border-slate-200/80 bg-white/95 p-3 text-xs text-slate-800 shadow-[0_18px_40px_rgba(15,23,42,0.45)]">
          <div className="grid grid-cols-3 gap-3">
            {APP_LINKS.map((app) => (
              <Link
                key={app.href}
                href={app.href}
                className="flex flex-col items-center gap-1 rounded-xl bg-slate-50/80 px-2 py-2 text-center text-[11px] font-medium text-slate-700 hover:bg-sky-50 hover:text-sky-800"
                onClick={() => setOpen(false)}
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-sky-500 to-emerald-400 text-[11px] font-semibold text-white shadow-[0_4px_12px_rgba(15,23,42,0.35)]">
                  {app.label.charAt(0)}
                </span>
                <span className="line-clamp-2 leading-tight">{app.label}</span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
