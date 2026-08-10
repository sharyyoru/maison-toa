"use client";

import { useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type ManualWidget = "is_member" | "is_social_media";
type Props = { patientId: string; isVip: boolean; initialMember: boolean; initialSocialMedia: boolean };

export default function PatientStatusWidgets({ patientId, isVip, initialMember, initialSocialMedia }: Props) {
  const [values, setValues] = useState<Record<ManualWidget, boolean>>({
    is_member: initialMember,
    is_social_media: initialSocialMedia,
  });
  const [saving, setSaving] = useState<ManualWidget | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(widget: ManualWidget) {
    if (saving) return;
    const previous = values[widget];
    const next = !previous;
    setValues((current) => ({ ...current, [widget]: next }));
    setSaving(widget);
    setError(null);
    const { error: updateError } = await supabaseClient.from("patients").update({ [widget]: next }).eq("id", patientId);
    setSaving(null);
    if (updateError) {
      setValues((current) => ({ ...current, [widget]: previous }));
      setError(updateError.message);
    }
  }

  const button = (widget: ManualWidget, icon: string, label: string, activeClasses: string) => (
    <button type="button" onClick={() => void toggle(widget)} disabled={saving !== null}
      aria-pressed={values[widget]} title={`${values[widget] ? "Remove" : "Assign"} ${label} status`}
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium shadow-sm transition disabled:cursor-not-allowed disabled:opacity-60 ${values[widget] ? activeClasses : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`}>
      <span aria-hidden>{icon}</span><span>{label}</span>
    </button>
  );

  return <div className="flex flex-wrap items-center gap-1.5" title={error ?? undefined}>
    {isVip ? <span title="Automatic: CHF 12,500 revenue or 10 visits in the last 12 months"
      className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 shadow-sm">
      <span aria-hidden>⭐</span><span>VIP</span>
    </span> : null}
    {button("is_member", "💎", "Mem", "border-violet-300 bg-violet-100 text-violet-800 hover:bg-violet-200")}
    {button("is_social_media", "📷", "Social", "border-pink-300 bg-pink-100 text-pink-700 hover:bg-pink-200")}
  </div>;
}
