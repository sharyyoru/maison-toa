"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLayoutMode } from "./LayoutModeContext";

// Routes that should be completely standalone (no sidebar, header, or shell)
const STANDALONE_ROUTES = ["/login", "/book-appointment", "/intake", "/onboarding", "/invoice/pay", "/consultations", "/embed", "/form", "/appointments/manage", "/register"];

// Routes that should have transparent/minimal background (for iframe embedding)
const TRANSPARENT_ROUTES = ["/embed"];

function isStandaloneRoute(pathname: string): boolean {
  return STANDALONE_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
}

function isTransparentRoute(pathname: string): boolean {
  return TRANSPARENT_ROUTES.some(route => pathname === route || pathname.startsWith(route + "/"));
}

export function ShellBackground({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { mode } = useLayoutMode();

  // Embed routes: NO wrapper div at all - just render children directly
  if (isTransparentRoute(pathname)) {
    return <>{children}</>;
  }

  // Blizzard mode (regular routes): full-bleed shell, no outer padding/gradient
  if (mode === "blizzard" && !isStandaloneRoute(pathname)) {
    return (
      <div className="min-h-screen">
        {children}
      </div>
    );
  }

  // Classic mode and standalone routes get the gradient background with padding
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_#eef2ff,_#e0f2fe_40%,_#fdf2ff_80%)] px-4 py-6 sm:px-6 lg:px-8">
      {children}
    </div>
  );
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
      <div className="h-[calc(100dvh-3rem)] w-full overflow-hidden mx-[-1rem] sm:mx-[-1.5rem] lg:mx-[-2rem]">
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
