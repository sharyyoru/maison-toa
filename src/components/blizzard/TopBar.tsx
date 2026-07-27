"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import LogoDropdown from "./LogoDropdown";
import ThemeToggle from "../ThemeToggle";
import HeaderNotificationsButton from "../HeaderNotificationsButton";
import HeaderCommentsButton from "../HeaderCommentsButton";
import HeaderTasksButton from "../HeaderTasksButton";
import HeaderWhatsAppButton from "../HeaderWhatsAppButton";
import HeaderUser from "../HeaderUser";
import HeaderEmailReportsButton from "../HeaderEmailReportsButton";
import HeaderDealNotificationsButton from "../HeaderDealNotificationsButton";
import { useTranslations } from "next-intl";

export default function TopBar() {
  const pathname = usePathname();
  const tNav = useTranslations("nav");
  const [logoMenuOpen, setLogoMenuOpen] = useState(false);

  const navItems = [
    { label: tNav("dashboard"), href: "/" },
    { label: tNav("calendar"), href: "/appointments" },
    { label: tNav("dealsAndPipeline"), href: "/deals" },
    { label: tNav("patients"), href: "/patients" },
  ];

  const isActive = (href: string) => {
    if (href === "/") return pathname === "/";
    return pathname.startsWith(href);
  };

  return (
    <header className="flex h-12 items-center justify-between border-b border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] px-4 relative z-50">
      <div className="flex items-center gap-4">
        <div className="relative">
          <button
            onClick={() => setLogoMenuOpen(!logoMenuOpen)}
            className="flex items-center gap-1.5 group"
          >
            <span className="flex items-center rounded-full bg-gradient-to-r from-slate-100 via-slate-200 to-slate-100 px-3 py-1.5 shadow-sm">
              <Image
                src="/logos/maisontoa-logo.png"
                alt="Clinic logo"
                width={90}
                height={28}
                className="h-6 w-auto"
              />
            </span>
            <svg
              className={`h-3.5 w-3.5 text-[var(--blz-text-muted)] transition-transform duration-200 ${logoMenuOpen ? "rotate-180" : ""}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {logoMenuOpen && <LogoDropdown onClose={() => setLogoMenuOpen(false)} />}
        </div>

        <div className="flex items-center gap-0.5">
          <button
            onClick={() => window.history.back()}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)] transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <button
            onClick={() => window.history.forward()}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--blz-text-muted)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)] transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14M12 5l7 7-7 7" />
            </svg>
          </button>
        </div>

        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`px-3 py-1.5 text-xs font-semibold tracking-wide transition-colors rounded ${
                isActive(item.href)
                  ? "text-[var(--blz-text-primary)]"
                  : "text-[var(--blz-text-muted)] hover:text-[var(--blz-text-secondary)]"
              }`}
            >
              {item.label}
              {isActive(item.href) && (
                <span className="block h-0.5 mt-0.5 rounded-full bg-sky-400" />
              )}
            </Link>
          ))}
        </nav>
      </div>

      <div className="flex items-center gap-1">
        <HeaderTasksButton />
        <HeaderDealNotificationsButton />
        <HeaderEmailReportsButton />
        <HeaderNotificationsButton />
        <HeaderCommentsButton />
        <HeaderWhatsAppButton />
        <ThemeToggle />
        <HeaderUser />
      </div>
    </header>
  );
}
