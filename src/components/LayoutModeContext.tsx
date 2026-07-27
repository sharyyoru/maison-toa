"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type LayoutMode = "blizzard" | "classic";

type LayoutModeContextType = {
  mode: LayoutMode;
  setMode: (mode: LayoutMode) => void;
  toggleMode: () => void;
};

const LayoutModeContext = createContext<LayoutModeContextType>({
  mode: "classic",
  setMode: () => {},
  toggleMode: () => {},
});

const STORAGE_KEY = "layout_mode";

export function LayoutModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<LayoutMode>("classic");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as LayoutMode | null;
    if (stored === "classic" || stored === "blizzard") {
      setModeState(stored);
    }
    setMounted(true);
  }, []);

  const setMode = (newMode: LayoutMode) => {
    setModeState(newMode);
    localStorage.setItem(STORAGE_KEY, newMode);
  };

  const toggleMode = () => {
    const next = mode === "blizzard" ? "classic" : "blizzard";
    setMode(next);
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
