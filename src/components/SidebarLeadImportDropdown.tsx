"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export default function SidebarLeadImportDropdown() {
  const pathname = usePathname();
  const isActive = pathname?.startsWith("/lead-import");
  const [isOpen, setIsOpen] = useState(isActive);

  return (
    <div className="border-b border-slate-100/80">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`group flex w-full items-center gap-3 px-3 py-2.5 text-xs font-medium text-slate-700 hover:bg-sky-50/80 hover:text-slate-900 sm:text-sm ${
          isActive ? "bg-sky-50/60 text-slate-900" : ""
        }`}
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-xl bg-white/70 text-slate-500 shadow-[0_6px_18px_rgba(15,23,42,0.18)] backdrop-blur group-hover:bg-sky-500/90 group-hover:text-white ${
          isActive ? "bg-sky-500/90 text-white" : ""
        }`}>
          <svg
            className="h-3.5 w-3.5"
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </span>
        <span className="flex-1 text-left">Lead Import</span>
        <svg
          className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      
      {isOpen && (
        <div className="ml-10 space-y-0.5 pb-2">
          <Link
            href="/lead-import"
            className={`block py-1.5 pl-3 text-xs hover:text-sky-600 ${
              pathname === "/lead-import" ? "text-sky-600 font-medium" : "text-slate-500"
            }`}
          >
            CSV Import
          </Link>
          <Link
            href="/lead-import/history"
            className={`block py-1.5 pl-3 text-xs hover:text-sky-600 ${
              pathname === "/lead-import/history" ? "text-sky-600 font-medium" : "text-slate-500"
            }`}
          >
            Import History
          </Link>
          <Link
            href="/lead-import/meta-leads"
            className={`block py-1.5 pl-3 text-xs hover:text-sky-600 ${
              pathname === "/lead-import/meta-leads" ? "text-sky-600 font-medium" : "text-slate-500"
            }`}
          >
            Meta & Zapier Leads
          </Link>
          <Link
            href="/lead-import/retell-calls"
            className={`block py-1.5 pl-3 text-xs hover:text-sky-600 ${
              pathname === "/lead-import/retell-calls" ? "text-sky-600 font-medium" : "text-slate-500"
            }`}
          >
            Retell AI Calls
          </Link>
          <Link
            href="/lead-import/embed-forms"
            className={`block py-1.5 pl-3 text-xs hover:text-sky-600 ${
              pathname === "/lead-import/embed-forms" ? "text-sky-600 font-medium" : "text-slate-500"
            }`}
          >
            Embed Forms
          </Link>
        </div>
      )}
    </div>
  );
}
