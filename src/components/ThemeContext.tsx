"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { usePathname } from "next/navigation";

type Theme = "light" | "dark";

// Public, patient-facing pages must never inherit an admin's CRM dark-mode
// preference — the "dark" utility overrides in globals.css assume the
// Blizzard dashboard shell (.blz-content) and aren't safe on these
// standalone pages. Keep this list in sync with STANDALONE_ROUTES in
// LayoutShellSwitch.tsx.
const PUBLIC_STANDALONE_ROUTES = [
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

function isPublicStandaloneRoute(pathname: string): boolean {
  return PUBLIC_STANDALONE_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

type ThemeContextType = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  setTheme: () => {},
  toggleTheme: () => {},
});

const STORAGE_KEY = "app_theme";

function applyThemeClass(theme: Theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.classList.add("dark");
  } else {
    root.classList.remove("dark");
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const pathname = usePathname();

  useEffect(() => {
    // Never apply the admin's CRM dark-mode preference on public,
    // patient-facing standalone pages (booking, intake, invoices, etc.) —
    // always force light there, regardless of the stored preference.
    if (isPublicStandaloneRoute(pathname)) {
      setThemeState("light");
      applyThemeClass("light");
      return;
    }

    let stored: Theme | null = null;
    try {
      stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    } catch {
      // ignore
    }
    const initial = stored === "dark" || stored === "light" ? stored : "light";
    setThemeState(initial);
    applyThemeClass(initial);
  }, [pathname]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    applyThemeClass(newTheme);
    try {
      localStorage.setItem(STORAGE_KEY, newTheme);
    } catch {
      // ignore
    }
  };

  const toggleTheme = () => {
    setTheme(theme === "dark" ? "light" : "dark");
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
