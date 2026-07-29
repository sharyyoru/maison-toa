"use client";

import { useLayoutMode } from "./LayoutModeContext";

export default function ClassicLayoutToggle() {
  const { toggleMode } = useLayoutMode();

  return (
    <button
      type="button"
      onClick={toggleMode}
      title="Switch to modern layout"
      className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 shadow-sm hover:bg-slate-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M9 3v18" />
      </svg>
      <span className="sr-only">Switch to modern layout</span>
    </button>
  );
}
