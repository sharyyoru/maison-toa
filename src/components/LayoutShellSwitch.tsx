"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLayoutMode } from "./LayoutModeContext";
import { useAuth } from "./AuthContext";
import BlizzardShell from "./blizzard/BlizzardShell";

// Routes that should bypass both shells entirely (standalone pages)
const STANDALONE_ROUTES = [
  "/login",
  "/book-appointment",
  "/intake",
  "/onboarding",
  "/invoice/pay",
  "/consultations",
  "/embed",
  "/form",
  "/appointments/manage",
  "/register",
];

function isStandaloneRoute(pathname: string): boolean {
  return STANDALONE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

export default function LayoutShellSwitch({
  children,
  classicShell,
}: {
  children: ReactNode;
  classicShell: ReactNode;
}) {
  const pathname = usePathname();
  const { mode } = useLayoutMode();
  const { user, loading } = useAuth();

  if (isStandaloneRoute(pathname)) {
    return <>{children}</>;
  }

  if (mode === "blizzard") {
    // Avoid auth flash by not wrapping until auth state is known.
    if (loading) {
      return (
        <div className="flex h-screen w-full items-center justify-center bg-[var(--blz-bg)]">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-sky-400 border-t-transparent" />
        </div>
      );
    }
    if (!user) {
      return <>{children}</>;
    }
    return <BlizzardShell>{children}</BlizzardShell>;
  }

  return <>{classicShell}</>;
}
