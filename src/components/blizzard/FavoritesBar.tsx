"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ReactNode } from "react";
import { useTranslations } from "next-intl";

function TooltipIcon({
  href,
  label,
  isActive,
  children,
}: {
  href?: string;
  label: string;
  isActive?: boolean;
  children: ReactNode;
}) {
  const baseClasses =
    "flex h-9 w-9 items-center justify-center rounded-full border transition-all duration-200";
  const activeClasses = "border-sky-400/60 bg-sky-500/10 text-sky-500 dark:text-sky-400";
  const inactiveClasses =
    "border-[var(--blz-border)] text-[var(--blz-text-muted)] hover:border-sky-400 hover:bg-sky-500/10 hover:text-sky-500 dark:hover:text-sky-200 hover:shadow-[0_0_16px_rgba(56,189,248,0.35)] hover:scale-105";
  const tooltip = (
    <div className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 -translate-x-1/2 whitespace-nowrap rounded-md bg-[var(--blz-surface-elevated)] px-2.5 py-1.5 text-[11px] font-medium text-[var(--blz-text-primary)] opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100">
      {label}
      <span className="absolute -top-1 left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 bg-[var(--blz-surface-elevated)]" />
    </div>
  );

  return (
    <div className="group relative flex items-center justify-center">
      {href ? (
        <Link
          href={href}
          className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        >
          {children}
        </Link>
      ) : (
        <button
          type="button"
          className={`${baseClasses} ${isActive ? activeClasses : inactiveClasses}`}
        >
          {children}
        </button>
      )}
      {tooltip}
    </div>
  );
}

export default function FavoritesBar() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <div className="flex items-center gap-3 border-b border-[var(--blz-border)] bg-[var(--blz-surface)] px-4 py-2">
      <span className="mr-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--blz-text-muted)]">
        Favorites
      </span>
      <div className="flex items-center gap-2">
        <TooltipIcon href="/" label={tNav("dashboard")} isActive={isActive("/")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 11.5 12 4l8 7.5" />
            <path d="M5 10.5V20h4v-5h6v5h4v-9.5" />
          </svg>
        </TooltipIcon>
        <TooltipIcon href="/patients" label={tNav("patients")} isActive={isActive("/patients")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z" />
            <path d="M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20" />
          </svg>
        </TooltipIcon>
        <TooltipIcon href="/appointments" label={tNav("calendar")} isActive={isActive("/appointments")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="5" width="18" height="16" rx="2" />
            <path d="M16 3v4M8 3v4M3 11h18" />
          </svg>
        </TooltipIcon>
        <TooltipIcon href="/deals" label={tNav("dealsAndPipeline")} isActive={isActive("/deals")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h4v12H3zM10 10h4v8h-4zM17 8h4v10h-4z" />
          </svg>
        </TooltipIcon>
        <TooltipIcon href="/financials" label={tNav("financials")} isActive={isActive("/financials")}>
          <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="6" width="18" height="12" rx="2" />
            <path d="M7 10h4M7 14h2" />
          </svg>
        </TooltipIcon>
        <TooltipIcon href="/search" label="Search" isActive={isActive("/search")}>
          <svg className="h-4.5 w-4.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.35-4.35" />
          </svg>
        </TooltipIcon>
        <TooltipIcon label="Add favorite">
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
        </TooltipIcon>
      </div>
    </div>
  );
}
