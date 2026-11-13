"use client";

import { useEffect, useState } from "react";

/**
 * Fetches /api/sumex/health once on mount and shows a visible warning banner
 * when insurance transmission (MediData) is unreachable. Hidden when it is up.
 */
export default function SumexStatusBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    let active = true;
    fetch("/api/sumex/health")
      .then((r) => r.json())
      .then((data) => {
        if (active && data.online === false) setOffline(true);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => { active = false; };
  }, []);

  if (!offline) return null;

  return (
    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-xs text-amber-900 shadow-sm">
      <strong>Insurance transmission offline</strong> — MediData cannot be
      reached right now. Invoices queued for insurance stay in the queue and are
      sent automatically when the connection returns.
    </div>
  );
}
