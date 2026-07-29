"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLayoutMode } from "../LayoutModeContext";

const NavIcon = ({ paths }: { paths: string }) => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d={paths} />
  </svg>
);

const MultiPathNavIcon = ({ paths }: { paths: string[] }) => (
  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {paths.map((d, i) => <path key={i} d={d} />)}
  </svg>
);

type NavItem = {
  label: string;
  href: string;
  icon?: React.ReactNode;
  children?: { label: string; href: string }[];
};

const NAV_SECTIONS: { items: NavItem[] }[] = [
  {
    items: [
      { label: "Dashboard", href: "/", icon: <MultiPathNavIcon paths={["M4 11.5 12 4l8 7.5", "M5 10.5V20h4v-5h6v5h4v-9.5"]} /> },
      { label: "Patients", href: "/patients", icon: <MultiPathNavIcon paths={["M12 12a4 4 0 1 0-4-4 4 4 0 0 0 4 4Z", "M4 20a6 6 0 0 1 8-5.29A6 6 0 0 1 20 20"]} /> },
      { label: "Agenda", href: "/appointments", icon: <MultiPathNavIcon paths={["M3 5h18v16H3z", "M16 3v4M8 3v4M3 11h18"]} /> },
      { label: "Online Bookings", href: "/online-bookings", icon: <NavIcon paths="M12 3c-2.5 3-4 5.5-4 9s1.5 6 4 9M12 3c2.5 3 4 5.5 4 9s-1.5 6-4 9M3 12h18" /> },
      { label: "Book Appointment CMS", href: "/cms/book-appointment", icon: <NavIcon paths="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" /> },
      { label: "Deals & Pipeline", href: "/deals", icon: <MultiPathNavIcon paths={["M3 6h4v12H3zM10 10h4v8h-4zM17 8h4v10h-4z"]} /> },
      {
        label: "Lead Import",
        href: "/lead-import",
        icon: <MultiPathNavIcon paths={["M3 3h6v6H3zM9 9h6v6H9zM15 15h6v6h-6z", "M6 9v3a3 3 0 0 0 3 3h3M12 15v3a3 3 0 0 0 3 3h3"]} />,
        children: [
          { label: "CSV Import", href: "/lead-import" },
          { label: "Import History", href: "/lead-import/history" },
          { label: "Meta & Zapier Leads", href: "/lead-import/meta-leads" },
          { label: "Retell AI Calls", href: "/lead-import/retell-calls" },
          { label: "Embed Forms", href: "/lead-import/embed-forms" },
        ],
      },
      { label: "Financials", href: "/financials", icon: <MultiPathNavIcon paths={["M3 6h18v12H3z", "M7 10h4M7 14h2"]} /> },
      { label: "Invoices", href: "/invoices", icon: <MultiPathNavIcon paths={["M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z", "M14 2v6h6", "M16 13H8M16 17H8M10 9H8"]} /> },
      { label: "Acomptes 50%", href: "/deposits", icon: <MultiPathNavIcon paths={["M12 8v4l2 2", "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"]} /> },
      { label: "MediData", href: "/medidata", icon: <MultiPathNavIcon paths={["M9 12l2 2 4-4", "M12 3c7.2 0 9 1.8 9 9s-1.8 9-9 9-9-1.8-9-9 1.8-9 9-9z"]} /> },
      { label: "Services", href: "/services", icon: <MultiPathNavIcon paths={["M3 4h18v16H3z", "M7 9h10M7 13h6M7 17h3"]} /> },
      { label: "Tasks", href: "/tasks", icon: <MultiPathNavIcon paths={["M4 4h16v16H4z", "M8 9h8M8 13h5M8 17h3"]} /> },
      { label: "User Management", href: "/users", icon: <MultiPathNavIcon paths={["M9 11a3 3 0 1 0-3-3 3 3 0 0 0 3 3Z", "M17 11a3 3 0 1 0-3-3", "M3 20a4 4 0 0 1 8 0", "M13 20a4 4 0 0 1 8 0"]} /> },
      {
        label: "Workflows",
        href: "/workflows",
        icon: <MultiPathNavIcon paths={["M3 3h6v6H3zM9 9h6v6H9zM15 15h6v6h-6z", "M6 9v3a3 3 0 0 0 3 3h3M12 15v3a3 3 0 0 0 3 3h3"]} />,
        children: [
          { label: "Workflows", href: "/workflows" },
          { label: "Templates", href: "/workflows/templates" },
        ],
      },
      { label: "Controllers", href: "/controllers", icon: <NavIcon paths="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" /> },
      { label: "Email Reports", href: "/email-reports", icon: <MultiPathNavIcon paths={["M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z", "M22 6 12 13 2 6", "M2 20l7-7", "M22 20l-7-7"]} /> },
      {
        label: "Chat with Aliice",
        href: "/chat",
        icon: <MultiPathNavIcon paths={["M4 6h16v9H8l-4 3z", "M8 10h8", "M8 13h5"]} />,
      },
      { label: "Client Onboarding", href: "/client-onboarding", icon: <MultiPathNavIcon paths={["M13.828 10.172a4 4 0 0 0-5.656 0l-4 4a4 4 0 1 0 5.656 5.656l1.102-1.101", "M10.172 13.828a4 4 0 0 0 5.656 0l4-4a4 4 0 1 0-5.656-5.656l-1.1 1.1"]} /> },
    ],
  },
  {
    items: [
      { label: "Settings", href: "/settings", icon: <NavIcon paths="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm7.5-3c0 .35-.04.7-.12 1.03l1.95 1.55c.17.14.22.39.1.59l-1.85 3.2c-.12.21-.37.28-.58.2l-2.3-.93c-.48.36-1 .65-1.56.87l-.35 2.45c-.05.23-.25.39-.49.39h-3.7c-.24 0-.44-.16-.49-.39l-.35-2.45a6.96 6.96 0 0 1-1.56-.87l-2.3.93c-.21.08-.46 0-.58-.2l-1.85-3.2a.42.42 0 0 1 .1-.59l1.95-1.55c-.08-.33-.12-.68-.12-1.03s.04-.7.12-1.03l-1.95-1.55a.42.42 0 0 1-.1-.59l1.85-3.2c.12-.21.37-.28.58-.2l2.3.93c.48-.36 1-.65 1.56-.87l.35-2.45c.05-.23.25-.39.49-.39h3.7c.24 0 .44.16.49.39l.35 2.45c.56.22 1.08.51 1.56.87l2.3-.93c.21-.08.46 0 .58-.2l1.85 3.2a.42.42 0 0 1-.1.59l-1.95 1.55c.08.33.12.68.12 1.03z" /> },
    ],
  },
];

export default function LogoDropdown({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const { toggleMode, mode } = useLayoutMode();
  const pathname = usePathname();
  const [expandedItems, setExpandedItems] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const section of NAV_SECTIONS) {
      for (const item of section.items) {
        if (item.children && pathname.startsWith(item.href)) {
          initial.add(item.href);
        }
      }
    }
    return initial;
  });

  function toggleExpand(href: string) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(href)) next.delete(href);
      else next.add(href);
      return next;
    });
  }

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute left-0 top-full mt-2 w-72 rounded-xl border border-[var(--blz-border)] bg-[var(--blz-surface-elevated)] shadow-2xl shadow-black/10 dark:shadow-black/40 py-2 z-[100] max-h-[80vh] overflow-y-auto"
    >
      {NAV_SECTIONS.map((section, si) => (
        <div key={si}>
          {si > 0 && <div className="my-2 border-t border-[var(--blz-border)]" />}
          {section.items.map((item) => {
            const hasChildren = item.children && item.children.length > 0;
            const isExpanded = expandedItems.has(item.href);
            const isActive = pathname === item.href || pathname.startsWith(item.href + "/");

            if (!hasChildren) {
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? "text-[var(--blz-text-primary)] bg-[var(--blz-hover)]"
                      : "text-[var(--blz-text-secondary)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)]"
                  }`}
                >
                  {item.icon ? <span className="text-[var(--blz-text-muted)]">{item.icon}</span> : null}
                  <span>{item.label}</span>
                </Link>
              );
            }

            return (
              <div key={item.href}>
                <button
                  type="button"
                  onClick={() => toggleExpand(item.href)}
                  className={`flex w-full items-center justify-between px-4 py-2 text-sm transition-colors ${
                    isActive
                      ? "text-[var(--blz-text-primary)] bg-[var(--blz-hover)]"
                      : "text-[var(--blz-text-secondary)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)]"
                  }`}
                >
                  <span className="flex items-center gap-3">
                    {item.icon ? <span className="text-[var(--blz-text-muted)]">{item.icon}</span> : null}
                    <span>{item.label}</span>
                  </span>
                  <svg
                    className={`h-3.5 w-3.5 text-[var(--blz-text-muted)] transition-transform duration-200 ${
                      isExpanded ? "rotate-180" : ""
                    }`}
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
                {isExpanded && (
                  <div className="ml-4 border-l border-[var(--blz-border)] pl-2 py-0.5">
                    {item.children!.map((child) => {
                      const childActive = pathname === child.href;
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          onClick={onClose}
                          className={`block px-3 py-1.5 text-[13px] transition-colors rounded ${
                            childActive
                              ? "text-sky-500 dark:text-sky-400 bg-sky-400/10"
                              : "text-[var(--blz-text-muted)] hover:text-[var(--blz-text-secondary)] hover:bg-[var(--blz-hover)]"
                          }`}
                        >
                          {child.label}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      <div className="my-2 border-t border-[var(--blz-border)]" />

      <button
        onClick={() => {
          toggleMode();
          onClose();
        }}
        className="flex w-full items-center gap-3 px-4 py-2 text-sm text-[var(--blz-text-secondary)] hover:bg-[var(--blz-hover)] hover:text-[var(--blz-text-primary)] transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <path d="M9 3v18" />
        </svg>
        <span>{mode === "blizzard" ? "Use Classic Layout" : "Use Modern Layout"}</span>
      </button>
    </div>
  );
}
