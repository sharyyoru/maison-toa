"use client";

import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { usePatientTabs } from "./PatientTabsContext";

// Routes where the tab bar should be hidden
const HIDDEN_ROUTES = ["/form", "/login", "/book-appointment", "/intake", "/onboarding", "/invoice"];

export default function PatientTabBar() {
  const { tabs, activePatientId, removeTab, clearAllTabs } = usePatientTabs();
  const router = useRouter();
  const pathname = usePathname();

  // Don't render on standalone/public routes
  if (HIDDEN_ROUTES.some(route => pathname.startsWith(route))) {
    return null;
  }

  // Don't render if no tabs
  if (tabs.length === 0) {
    return null;
  }

  const handleClose = (e: React.MouseEvent, patientId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    const isActive = patientId === activePatientId;
    const tabIndex = tabs.findIndex((t) => t.id === patientId);
    
    removeTab(patientId);
    
    // If closing the active tab, navigate to another tab or patients list
    if (isActive && tabs.length > 1) {
      // Navigate to the previous tab, or the next one if this is the first
      const nextTab = tabs[tabIndex - 1] || tabs[tabIndex + 1];
      if (nextTab) {
        router.push(`/patients/${nextTab.id}`);
      }
    } else if (isActive && tabs.length === 1) {
      // Last tab being closed, go to patients list
      router.push("/patients");
    }
  };

  const handleCloseAll = () => {
    clearAllTabs();
    router.push("/patients");
  };

  return (
    <div className="flex items-center gap-1 border-b border-slate-200/80 bg-gradient-to-r from-slate-50/90 to-white/80 px-2 py-1.5 overflow-x-auto">
      <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent">
        {tabs.map((tab) => {
          const isActive = tab.id === activePatientId;
          const initials = `${tab.firstName?.[0] ?? ""}${tab.lastName?.[0] ?? ""}`.toUpperCase() || "?";
          const displayName = `${tab.firstName ?? ""} ${tab.lastName ?? ""}`.trim() || "Unknown";
          const truncatedName = displayName.length > 16 ? displayName.slice(0, 14) + "..." : displayName;

          return (
            <Link
              key={tab.id}
              href={`/patients/${tab.id}`}
              className={`
                group relative flex items-center gap-2 rounded-t-lg px-3 py-1.5 text-xs font-medium transition-all
                ${isActive
                  ? "bg-white text-slate-900 shadow-sm border border-b-0 border-slate-200/80 -mb-px z-10"
                  : "bg-slate-100/80 text-slate-600 hover:bg-slate-200/80 hover:text-slate-800 border border-transparent"
                }
              `}
              title={displayName}
            >
              {/* Avatar */}
              {tab.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={tab.avatarUrl}
                  alt={displayName}
                  className="h-5 w-5 rounded-full object-cover ring-1 ring-slate-200"
                />
              ) : (
                <span className={`
                  flex h-5 w-5 items-center justify-center rounded-full text-[9px] font-semibold
                  ${isActive
                    ? "bg-gradient-to-br from-sky-500 to-indigo-500 text-white"
                    : "bg-slate-300 text-slate-600"
                  }
                `}>
                  {initials}
                </span>
              )}

              {/* Name */}
              <span className="max-w-[100px] truncate">{truncatedName}</span>

              {/* Close button */}
              <button
                type="button"
                onClick={(e) => handleClose(e, tab.id)}
                className={`
                  ml-1 rounded-full p-0.5 transition-colors
                  ${isActive
                    ? "text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    : "text-slate-400 opacity-0 group-hover:opacity-100 hover:bg-slate-300/80 hover:text-slate-700"
                  }
                `}
                title="Close tab"
              >
                <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </Link>
          );
        })}
      </div>

      {/* Close all button */}
      {tabs.length > 1 && (
        <button
          type="button"
          onClick={handleCloseAll}
          className="flex-shrink-0 ml-2 rounded-md px-2 py-1 text-[10px] font-medium text-slate-500 hover:bg-slate-200/80 hover:text-slate-700 transition-colors"
          title="Close all tabs"
        >
          Close all
        </button>
      )}
    </div>
  );
}
