"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useLayoutMode } from "./LayoutModeContext";
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

  if (isStandaloneRoute(pathname)) {
    return <>{children}</>;
  }

  if (mode === "blizzard") {
    return <BlizzardShell>{children}</BlizzardShell>;
  }

  return <>{classicShell}</>;
}
