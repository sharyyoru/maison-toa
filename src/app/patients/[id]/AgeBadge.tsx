"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";

type AgeBadgeProps = {
  patientId: string;
  dob: string | null;
  age: number | null;
};

export default function AgeBadge({ patientId, dob, age }: AgeBadgeProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDob, setEditDob] = useState(dob || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Format DOB for display
  const formattedDob = dob
    ? new Date(dob).toLocaleDateString("fr-CH", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "Not set";

  // Close popover when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(event.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
        setIsEditing(false);
        setError(null);
      }
    }

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const handleSave = async () => {
    if (!editDob) {
      setError("Please enter a valid date");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const { error: updateError } = await supabaseClient
        .from("patients")
        .update({ dob: editDob })
        .eq("id", patientId);

      if (updateError) throw updateError;

      setIsEditing(false);
      setIsOpen(false);
      router.refresh();
    } catch (err) {
      console.error("Error updating DOB:", err);
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          setIsOpen(!isOpen);
          setIsEditing(false);
          setEditDob(dob || "");
          setError(null);
        }}
        className="inline-flex items-center rounded-full bg-slate-900 px-2 py-0.5 text-[11px] font-medium text-slate-50 hover:bg-slate-800 transition-colors cursor-pointer"
        title="Click to view/edit date of birth"
      >
        <span className="opacity-80">Age</span>
        <span className="ml-1 font-semibold">{age ?? "?"}</span>
      </button>

      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-0 top-full mt-2 z-50 w-64 rounded-xl border border-slate-200 bg-white p-3 shadow-xl"
        >
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-700">Date of Birth</h4>
              {!isEditing && (
                <button
                  type="button"
                  onClick={() => setIsEditing(true)}
                  className="text-[10px] font-medium text-emerald-600 hover:text-emerald-700"
                >
                  Edit
                </button>
              )}
            </div>

            {isEditing ? (
              <div className="space-y-2">
                <input
                  type="date"
                  value={editDob}
                  onChange={(e) => setEditDob(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                {error && (
                  <p className="text-xs text-red-600">{error}</p>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsEditing(false);
                      setEditDob(dob || "");
                      setError(null);
                    }}
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={saving}
                    className="flex-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <p className="text-sm font-medium text-slate-900">{formattedDob}</p>
                {age !== null && (
                  <p className="text-xs text-slate-500">{age} years old</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
