"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import type { AppointmentStatusOption } from "@/lib/appointmentStatuses";

type EmojiClickEvent = CustomEvent<{ unicode: string }>;

function EmojiPicker({
  onSelect,
  onClose,
}: {
  onSelect: (emoji: string) => void;
  onClose: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let picker: HTMLElement | null = null;
    let cancelled = false;

    const handleSelect = (event: Event) => {
      const emoji = (event as EmojiClickEvent).detail.unicode;
      if (emoji) onSelect(emoji);
    };

    void import("emoji-picker-element").then(() => {
      if (cancelled || !hostRef.current) return;
      picker = document.createElement("emoji-picker");
      picker.style.setProperty("--num-columns", "8");
      picker.style.setProperty("--emoji-size", "1.25rem");
      picker.style.setProperty("--emoji-padding", "0.4rem");
      picker.addEventListener("emoji-click", handleSelect);
      hostRef.current.appendChild(picker);
    });

    const handleOutsideClick = (event: MouseEvent) => {
      if (!hostRef.current?.parentElement?.contains(event.target as Node)) onClose();
    };
    document.addEventListener("mousedown", handleOutsideClick);

    return () => {
      cancelled = true;
      document.removeEventListener("mousedown", handleOutsideClick);
      picker?.removeEventListener("emoji-click", handleSelect);
      picker?.remove();
    };
  }, [onClose, onSelect]);

  return (
    <div className="absolute left-0 top-full z-50 mt-2 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
      <div ref={hostRef} />
    </div>
  );
}

export default function AppointmentStatusesSettingsTab() {
  const [statuses, setStatuses] = useState<AppointmentStatusOption[]>([]);
  const [newName, setNewName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pickerStatusId, setPickerStatusId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabaseClient
      .from("appointment_status_options")
      .select("id, name, emoji, display_order")
      .eq("is_active", true)
      .order("display_order");
    if (error) setMessage({ error: true, text: "Could not load appointment statuses." });
    else setStatuses(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function addStatus() {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    const { error } = await supabaseClient.from("appointment_status_options").insert({
      name,
      display_order: statuses.length,
    });
    setSaving(false);
    if (error) {
      setMessage({ error: true, text: error.code === "23505" ? "That status already exists." : "Could not add status." });
      return;
    }
    setNewName("");
    setMessage({ error: false, text: "Status added." });
    await load();
  }

  async function renameStatus(status: AppointmentStatusOption, name: string) {
    const trimmed = name.trim();
    if (!trimmed || trimmed === status.name) {
      await load();
      return;
    }
    const { error } = await supabaseClient
      .from("appointment_status_options")
      .update({ name: trimmed, updated_at: new Date().toISOString() })
      .eq("id", status.id);
    setMessage(error
      ? { error: true, text: "Could not rename status." }
      : { error: false, text: "Status renamed." });
    await load();
  }

  async function updateEmoji(status: AppointmentStatusOption, emoji: string) {
    const { error } = await supabaseClient
      .from("appointment_status_options")
      .update({ emoji: emoji.trim(), updated_at: new Date().toISOString() })
      .eq("id", status.id);
    setMessage(error
      ? { error: true, text: "Could not update emoji." }
      : { error: false, text: "Emoji updated." });
    await load();
  }

  async function removeStatus(status: AppointmentStatusOption) {
    if (!window.confirm(`Remove "${status.name}" from the available appointment statuses? Existing appointments will keep their current value.`)) return;
    const { error } = await supabaseClient
      .from("appointment_status_options")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("id", status.id);
    setMessage(error
      ? { error: true, text: "Could not remove status." }
      : { error: false, text: "Status removed." });
    await load();
  }

  async function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= statuses.length) return;
    const reordered = [...statuses];
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    setStatuses(reordered);
    const updates = reordered.map((status, display_order) =>
      supabaseClient.from("appointment_status_options").update({ display_order }).eq("id", status.id)
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
        <h2 className="text-sm font-semibold text-slate-800">Appointment Statuses</h2>
        <p className="mt-1 text-xs text-slate-500">
          Add, rename, remove, and reorder the statuses shown in appointment forms.
        </p>
      </div>

      <div className="p-6">
        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && void addStatus()}
            placeholder="New status name"
            className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-sky-500 focus:ring-1 focus:ring-sky-500"
          />
          <button
            type="button"
            disabled={saving || !newName.trim()}
            onClick={() => void addStatus()}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            Add status
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
              <span className="w-20">Emoji</span>
              <span className="flex-1">Status name — click to edit</span>
              <span className="w-36" />
            </div>
            {statuses.map((status, index) => (
              <div key={status.id} className="flex items-center gap-2 px-3 py-2">
                <span className="w-7 text-center text-xs text-slate-400">{index + 1}</span>
                <div className="relative flex w-20 items-center rounded-md border border-slate-200 focus-within:border-sky-500">
                  <input
                    key={`${status.id}-${status.emoji}`}
                    defaultValue={status.emoji}
                    onBlur={(event) => void updateEmoji(status, event.currentTarget.value)}
                    onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                    placeholder="😀"
                    maxLength={12}
                    className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-center text-lg focus:outline-none"
                    aria-label={`Emoji for ${status.name}`}
                  />
                  <button
                    type="button"
                    onClick={() => setPickerStatusId((current) => current === status.id ? null : status.id)}
                    className="border-l border-slate-200 px-1.5 py-2 text-xs text-slate-500 hover:bg-slate-50"
                    aria-label={`Choose emoji for ${status.name}`}
                    aria-expanded={pickerStatusId === status.id}
                  >
                    ▾
                  </button>
                  {pickerStatusId === status.id && (
                    <EmojiPicker
                      onClose={() => setPickerStatusId(null)}
                      onSelect={(emoji) => {
                        setPickerStatusId(null);
                        void updateEmoji(status, emoji);
                      }}
                    />
                  )}
                </div>
                <input
                  key={`${status.id}-${status.name}`}
                  defaultValue={status.name}
                  onBlur={(event) => void renameStatus(status, event.currentTarget.value)}
                  onKeyDown={(event) => event.key === "Enter" && event.currentTarget.blur()}
                  className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1.5 text-sm text-slate-700 focus:border-sky-500 focus:outline-none"
                  aria-label={`Rename ${status.name}`}
                />
                <button type="button" disabled={index === 0} onClick={() => void move(index, -1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" aria-label="Move up">↑</button>
                <button type="button" disabled={index === statuses.length - 1} onClick={() => void move(index, 1)} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 disabled:opacity-25" aria-label="Move down">↓</button>
                <button type="button" onClick={() => void removeStatus(status)} className="rounded px-2 py-1 text-xs text-red-600 hover:bg-red-50">Remove</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
