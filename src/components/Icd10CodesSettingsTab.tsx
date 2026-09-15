"use client";

import { useCallback, useEffect, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

export type Icd10CodeOption = {
  id: string;
  code: string;
  label: string;
  display_order: number;
};

const ICD_10_CODE_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/;

function formatIcd10Code(value: string): string {
  return value.trim().toUpperCase();
}

function isValidIcd10Code(code: string): boolean {
  return ICD_10_CODE_PATTERN.test(formatIcd10Code(code));
}

export default function Icd10CodesSettingsTab() {
  const [codes, setCodes] = useState<Icd10CodeOption[]>([]);
  const [newCode, setNewCode] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseClient
      .from("icd10_code_options")
      .select("id, code, label, display_order")
      .eq("is_active", true)
      .order("display_order", { ascending: true });
    if (error) setMessage({ error: true, text: "Could not load ICD-10 codes." });
    else setCodes(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addCode() {
    const code = formatIcd10Code(newCode);
    const label = newLabel.trim();
    if (!code || !label) return;
    if (!isValidIcd10Code(code)) {
      setMessage({ error: true, text: "Code must be a valid ICD-10 format (e.g. L91.0)." });
      return;
    }
    setSaving(true);
    const nextDisplayOrder =
      codes.length === 0 ? 0 : Math.max(...codes.map((c) => c.display_order)) + 1;
    const { error } = await supabaseClient.from("icd10_code_options").insert({
      code,
      label,
      display_order: nextDisplayOrder,
    });
    setSaving(false);
    if (error) {
      setMessage({
        error: true,
        text: error.code === "23505" ? "That code already exists." : "Could not add code.",
      });
      return;
    }
    setNewCode("");
    setNewLabel("");
    setMessage({ error: false, text: "Code added." });
    await load();
  }

  async function updateCode(option: Icd10CodeOption, value: string) {
    const code = formatIcd10Code(value);
    if (code === option.code) return;
    if (!code || !isValidIcd10Code(code)) {
      setMessage({ error: true, text: "Invalid ICD-10 code format." });
      await load();
      return;
    }
    const { error } = await supabaseClient
      .from("icd10_code_options")
      .update({ code, updated_at: new Date().toISOString() })
      .eq("id", option.id);
    setMessage(error
      ? { error: true, text: error.code === "23505" ? "That code already exists." : "Could not update code." }
      : { error: false, text: "Code updated." });
    await load();
  }

  async function updateLabel(option: Icd10CodeOption, value: string) {
    const label = value.trim();
    if (label === option.label) return;
    if (!label) {
      await load();
      return;
    }
    const { error } = await supabaseClient
      .from("icd10_code_options")
      .update({ label, updated_at: new Date().toISOString() })
      .eq("id", option.id);
    setMessage(error
      ? { error: true, text: "Could not update label." }
      : { error: false, text: "Label updated." });
    await load();
  }

  async function removeCode(option: Icd10CodeOption) {
    if (!window.confirm(`Remove "${option.code}" from the available ICD-10 codes? Existing records will keep their current value.`)) return;
    const { error } = await supabaseClient
      .from("icd10_code_options")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", option.id);
    setMessage(error
      ? { error: true, text: "Could not remove code." }
      : { error: false, text: "Code removed." });
    await load();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= codes.length) return;
    const reordered = [...codes];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setCodes(reordered);
    const updates = reordered.map((code, display_order) =>
      supabaseClient.from("icd10_code_options").update({ display_order }).eq("id", code.id)
    );
    const results = await Promise.all(updates);
    if (results.some(({ error }) => error)) {
      setMessage({ error: true, text: "Could not save the new order." });
      await load();
    }
  }

  return (
    <div className="max-w-3xl rounded-2xl border border-slate-200/80 bg-white shadow-sm">
      <div className="border-b border-slate-200 px-6 py-4">
        <h2 className="text-sm font-semibold text-slate-800">ICD-10 Codes</h2>
        <p className="mt-1 text-xs text-slate-500">
          Add, edit, remove, and reorder the diagnosis codes shown in the dropdown.
        </p>
      </div>

      <div className="p-6">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            value={newCode}
            onChange={(event) => setNewCode(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && document.getElementById("icd10-new-label")?.focus()}
            placeholder="Code (e.g. L91.0)"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <input
            id="icd10-new-label"
            value={newLabel}
            onChange={(event) => setNewLabel(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void addCode()}
            placeholder="Label"
            className="flex-[2] rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="button"
            disabled={saving || !newCode.trim() || !newLabel.trim()}
            onClick={() => void addCode()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Add code
          </button>
        </div>

        {message && (
          <p className={`mt-3 text-xs ${message.error ? "text-red-600" : "text-emerald-600"}`}>{message.text}</p>
        )}

        {loading ? (
          <p className="py-10 text-center text-sm text-slate-400">Loading…</p>
        ) : (
          <div className="mt-5 divide-y divide-slate-100 rounded-xl border border-slate-200">
            <div className="flex items-center gap-2 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              <span className="w-7">Order</span>
              <span className="w-28">Code</span>
              <span className="flex-1">Label</span>
              <span className="w-36" />
            </div>
            {codes.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-slate-400">
                No ICD-10 codes configured.
              </div>
            ) : (
              codes.map((option, index) => (
                <div key={option.id} className="flex items-center gap-2 px-3 py-2">
                  <span className="w-7 text-center text-xs text-slate-400">{index + 1}</span>
                  <input
                    defaultValue={option.code}
                    onBlur={(event) => void updateCode(option, event.currentTarget.value)}
                    onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                    className="w-28 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:outline-none"
                    aria-label={`Code for ${option.label}`}
                  />
                  <input
                    defaultValue={option.label}
                    onBlur={(event) => void updateLabel(option, event.currentTarget.value)}
                    onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                    className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:outline-none"
                    aria-label={`Label for ${option.code}`}
                  />
                  <button type="button" disabled={index === 0} onClick={() => void move(index, -1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" aria-label="Move up">↑</button>
                  <button type="button" disabled={index === codes.length - 1} onClick={() => void move(index, 1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" aria-label="Move down">↓</button>
                  <button type="button" onClick={() => void removeCode(option)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Remove</button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
