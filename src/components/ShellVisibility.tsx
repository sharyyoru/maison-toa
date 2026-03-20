"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";

// Routes that should be completely standalone (no sidebar, header, or shell)
const STANDALONE_ROUTES = ["/login", "/book-appointment", "/intake", "/onboarding", "/invoice/pay", "/consultations", "/embed", "/form"];

function isStandaloneRoute(pathname: string): boolean {
  return STANDALONE_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
}

export function ShellSidebar({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isStandaloneRoute(pathname)) {
    return null;
  }
  return <>{children}</>;
}

export function ShellHeader({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isStandaloneRoute(pathname)) {
    return null;
  }
  return <>{children}</>;
}

export function ShellFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  // Standalone pages render without any shell wrapper
  if (isStandaloneRoute(pathname)) {
    return <>{children}</>;
  }

  if (pathname === "/appointments") {
    return (
      <div className="min-h-[80vh] w-full overflow-x-hidden overflow-y-auto mx-[-1rem] sm:mx-[-1.5rem] lg:mx-[-2rem]">
        {children}
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-[1614px] min-h-[80vh] overflow-x-hidden overflow-y-auto rounded-3xl border border-white/60 bg-white/80 shadow-[0_22px_60px_rgba(15,23,42,0.12)] backdrop-blur-xl">
      {children}
    </div>
  );
}
