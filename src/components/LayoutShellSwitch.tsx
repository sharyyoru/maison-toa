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
    // DEBUG: bypass auth check to isolate whether auth or shell is the issue
    return <BlizzardShell>{children}</BlizzardShell>;
  }

  return <>{classicShell}</>;
}
