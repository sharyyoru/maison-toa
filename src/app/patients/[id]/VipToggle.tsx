"use client";

import { useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type Props = {
  patientId: string;
};

/**
 * Small toggle shown next to the patient name that flips the `is_vip` flag on
 * the patients table. The calendar uses this flag to show a VIP badge on the
 * patient's appointments.
 */
export default function VipToggle({ patientId }: Props) {
  const [isVip, setIsVip] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const { data, error } = await supabaseClient
        .from("patients")
        .select("is_vip")
        .eq("id", patientId)
        .single();
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setIsVip(false);
        return;
      }
      setIsVip(Boolean((data as any)?.is_vip));
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  async function toggle() {
    if (isVip === null || saving) return;
    const next = !isVip;
    setSaving(true);
    setError(null);
    const prev = isVip;
    setIsVip(next);
    const { error } = await supabaseClient
      .from("patients")
      .update({ is_vip: next })
      .eq("id", patientId);
    setSaving(false);
    if (error) {
      setIsVip(prev);
      setError(error.message);
    }
  }

  if (isVip === null) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => void toggle()}
      disabled={saving}
      title={error ?? (isVip ? "Remove VIP status" : "Mark patient as VIP")}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition ${
        isVip
          ? "border-amber-300 bg-amber-100 text-amber-800 hover:bg-amber-200"
          : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      <span aria-hidden>{isVip ? "⭐" : "☆"}</span>
      <span>{isVip ? "VIP" : "Mark VIP"}</span>
    </button>
  );
}
