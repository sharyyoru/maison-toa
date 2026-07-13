"use client";

import React, { useState, useRef, useEffect } from "react";

interface TooltipProps {
  children: React.ReactNode;
  label: string;
  position?: "top" | "bottom" | "left" | "right";
  delay?: number;
}

/**
 * Lightweight tooltip that appears quickly on hover/focus.
 *
 * Native `title` tooltips have a long browser-imposed delay and do not show on
 * many touch/tablet interactions. This component shows a styled label after a
 * configurable delay (default 150ms) and is positioned above the trigger.
 */
export default function Tooltip({
  children,
  label,
  position = "top",
  delay = 150,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);

  const show = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const positionClasses = {
    top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
    bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
    left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
    right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
  };

  return (
    <div
      ref={triggerRef}
      className="relative inline-flex items-center justify-center"
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <div
          className={`absolute z-50 whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-[10px] font-medium text-white shadow-lg ${positionClasses[position]}`}
          role="tooltip"
        >
          {label}
          <span
            className={`absolute h-1.5 w-1.5 rotate-45 bg-slate-900 ${
              position === "top"
                ? "left-1/2 top-full -translate-x-1/2 -translate-y-1/2"
                : position === "bottom"
                  ? "left-1/2 bottom-full -translate-x-1/2 translate-y-1/2"
                  : position === "left"
                    ? "left-full top-1/2 -translate-y-1/2 -translate-x-1/2"
                    : "right-full top-1/2 -translate-y-1/2 translate-x-1/2"
            }`}
          />
        </div>
      )}
    </div>
  );
}
