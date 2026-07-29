"use client";

import { useState, useEffect } from "react";
import TopBar from "./TopBar";
import FavoritesBar from "./FavoritesBar";
import RightPanel from "./RightPanel";
import RequireAuth from "../RequireAuth";

const PANEL_STORAGE_KEY = "blizzard_panel_collapsed";

export default function BlizzardShell({ children }: { children: React.ReactNode }) {
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(PANEL_STORAGE_KEY);
    if (stored === "true") setPanelCollapsed(true);
  }, []);

  const togglePanel = () => {
    const next = !panelCollapsed;
    setPanelCollapsed(next);
    localStorage.setItem(PANEL_STORAGE_KEY, String(next));
  };

  return (
    <RequireAuth>
      <div className="flex h-screen flex-col overflow-hidden bg-[var(--blz-surface)] text-[var(--blz-text-secondary)]">
        <TopBar />
        <FavoritesBar />
        <div className="flex flex-1 overflow-hidden">
          <main className="flex-1 overflow-y-auto bg-[var(--blz-bg)]">
            <div className="min-h-full blz-content px-4 py-4 sm:px-6 lg:px-8">
              {children}
            </div>
          </main>
          <RightPanel collapsed={panelCollapsed} onToggle={togglePanel} />
        </div>
      </div>
    </RequireAuth>
  );
}
