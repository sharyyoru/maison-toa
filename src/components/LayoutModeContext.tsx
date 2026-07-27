"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type LayoutMode = "blizzard" | "classic";

type LayoutModeContextType = {
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  toggleMode: () => void;
};

const LayoutModeContext = createContext<LayoutModeContextType>({
  mode: "blizzard",
  setMode: () => {},
  toggleMode: () => {},
});

const STORAGE_KEY = "layout_mode";

function isLayoutMode(value: string | null): value is LayoutMode {
  return value === "classic" || value === "blizzard";
}

function getUrlLayout(): LayoutMode | null {
  if (typeof window === "undefined") return null;
  const params = new URLSearchParams(window.location.search);
  const value = params.get("layout");
  return isLayoutMode(value) ? value : null;
}

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>("blizzard");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // URL param takes highest precedence, then localStorage, then default blizzard.
    const urlMode = getUrlLayout();
    if (urlMode) {
      setModeState(urlMode);
      localStorage.setItem(STORAGE_KEY, urlMode);
      setMounted(true);
      return;
    }

    const stored = localStorage.getItem(STORAGE_KEY) as LayoutMode | null;
    if (isLayoutMode(stored)) {
      setModeState(stored);
    }
    setMounted(true);
  }, []);

  const setMode = (newMode: LayoutMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  const toggleMode = () => {
    setMode(mode === "blizzard" ? "classic" : "blizzard");
  };

  if (!mounted) {
    return <>{children}</>;
  }

  return (
    <LayoutModeContext.Provider value={{ mode, setMode, toggleMode }}>
      {children}
    </LayoutModeContext.Provider>
  );
}

export function useLayoutMode() {
  return useContext(LayoutModeContext);
}
