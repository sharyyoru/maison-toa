"use client";

import { useState, useEffect, useRef } from "react";
import { supabaseClient } from "@/lib/supabaseClient";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type AppointmentType = "appointment" | "operation";

type AppointmentModalProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: AppointmentData) => Promise<void>;
  onSuccess?: () => void;
  patientId: string;
  patientName: string;
  dealId?: string | null;
  dealTitle?: string | null;
  defaultType?: AppointmentType;
};

export type AppointmentData = {
  patientId: string;
  dealId?: string | null;
  providerId?: string | null;
  title: string;
  appointmentDate: string;
  durationMinutes: number;
  location: string;
  notes: string;
  sendPatientEmail: boolean;
  sendUserEmail: boolean;
  scheduleReminder: boolean;
  appointmentType: AppointmentType;
};

function formatDateTimeLocal(date: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6; // Sunday = 0, Saturday = 6
}

function getNextWeekday(date: Date): Date {
  const result = new Date(date);
  while (isWeekend(result)) {
    result.setDate(result.getDate() + 1);
  }
  return result;
}

export default function AppointmentModal({
  open,
  onClose,
  onSubmit,
  onSuccess,
  patientId,
  patientName,
  dealId,
  dealTitle,
  defaultType = "appointment",
}: AppointmentModalProps) {
  const [title, setTitle] = useState("");
  const [appointmentDate, setAppointmentDate] = useState("");
  const [durationMinutes, setDurationMinutes] = useState("15");
  const [location, setLocation] = useState("Rhône");
  const [appointmentType, setAppointmentType] = useState<AppointmentType>(defaultType);
  const [notes, setNotes] = useState("");
  const [sendPatientEmail, setSendPatientEmail] = useState(true);
  const [sendUserEmail, setSendUserEmail] = useState(true);
  const [scheduleReminder, setScheduleReminder] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  // User selection state
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [userSearch, setUserSearch] = useState("");
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const userDropdownRef = useRef<HTMLDivElement>(null);

  // Load platform users on mount
  useEffect(() => {
    async function loadUsers() {
      try {
        const response = await fetch("/api/users/list");
        if (response.ok) {
          const data = await response.json();
          setUsers(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        console.error("Failed to load users:", err);
      }
    }
    loadUsers();
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userDropdownRef.current && !userDropdownRef.current.contains(event.target as Node)) {
        setUserDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Filter users based on search
  const filteredUsers = users.filter((user) => {
    if (!userSearch.trim()) return true;
    const search = userSearch.toLowerCase();
    return (
      (user.full_name?.toLowerCase() || "").includes(search) ||
      (user.email?.toLowerCase() || "").includes(search)
    );
  });

  function handleUserSelect(user: PlatformUser) {
    setAssignedUserId(user.id);
    setUserSearch(user.full_name || user.email || "");
    setUserDropdownOpen(false);
  }

  function clearUser() {
    setAssignedUserId("");
    setUserSearch("");
  }

  useEffect(() => {
    if (open) {
      // Set default date to tomorrow at 10:00 AM, but skip weekends
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(10, 0, 0, 0);
      const nextWeekday = getNextWeekday(tomorrow);
      setAppointmentDate(formatDateTimeLocal(nextWeekday));
      setAppointmentType(defaultType);
      setDurationMinutes(defaultType === "operation" ? "60" : "15");
      setTitle(`${defaultType === "operation" ? "Operation" : "Appointment"} with ${patientName}`);
      setError(null);
      setAssignedUserId("");
      setUserSearch("");
    }
  }, [open, patientName, defaultType]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!appointmentDate) {
      setError("Please select a date and time for the appointment.");
      return;
    }

    const appointmentDateObj = new Date(appointmentDate);

    // Internal users can book on weekends and past dates - no restrictions
    // External users (via magic link) have restrictions handled in the public API

    try {
      setSaving(true);
      setError(null);

      await onSubmit({
        patientId,
        dealId,
        providerId: assignedUserId || null,
        title: title.trim() || `${appointmentType === "operation" ? "Operation" : "Appointment"} with ${patientName}`,
        appointmentDate,
        durationMinutes: parseInt(durationMinutes, 10) || 60,
        location: location.trim(),
        notes: notes.trim(),
        sendPatientEmail,
        sendUserEmail,
        scheduleReminder,
        appointmentType,
      });

      // Show success message
      setSuccess(true);
      
      // Call onSuccess callback (to prevent stage revert)
      if (onSuccess) {
        onSuccess();
      }
      
      // Auto-close after showing success message
      setTimeout(() => {
        // Reset form
        setTitle("");
        setAppointmentDate("");
        setDurationMinutes("15");
        setLocation("Rhône");
        setNotes("");
        setSendPatientEmail(true);
        setSendUserEmail(true);
        setScheduleReminder(true);
        setAssignedUserId("");
        setUserSearch("");
        setSuccess(false);
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create appointment.");
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-start justify-center bg-slate-900/50 px-4 pt-16 pb-6 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Schedule Appointment</h2>
            <p className="text-sm text-slate-500">
              {dealTitle ? `For deal: ${dealTitle}` : `Patient: ${patientName}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex h-8 w-8 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {success && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-4 text-center">
              <div className="flex justify-center mb-2">
                <svg className="h-8 w-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="text-sm font-medium text-emerald-700">Appointment Booked Successfully!</p>
              <p className="text-xs text-emerald-600 mt-1">Redirecting...</p>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Appointment Type Selection */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Type <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setAppointmentType("appointment");
                  setTitle(`Appointment with ${patientName}`);
                  setDurationMinutes("15");
                }}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                  appointmentType === "appointment"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg">📅</span>
                  <span>Appointment</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Regular consultation</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setAppointmentType("operation");
                  setTitle(`Operation with ${patientName}`);
                  setDurationMinutes("60");
                }}
                className={`flex-1 rounded-lg border-2 px-4 py-3 text-sm font-medium transition-colors ${
                  appointmentType === "operation"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <span className="text-lg">🏥</span>
                  <span>Operation</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">Surgical procedure</p>
              </button>
            </div>
          </div>

          {/* User/Doctor Selection */}
          <div className="space-y-2" ref={userDropdownRef}>
            <label className="block text-sm font-medium text-slate-700">
              Assign to Doctor <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <input
                type="text"
                value={userSearch}
                onChange={(e) => {
                  setUserSearch(e.target.value);
                  setUserDropdownOpen(true);
                  if (!e.target.value.trim()) {
                    setAssignedUserId("");
                  }
                }}
                onFocus={() => setUserDropdownOpen(true)}
                placeholder="Search for a doctor..."
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
              {assignedUserId && (
                <button
                  type="button"
                  onClick={clearUser}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
              {userDropdownOpen && filteredUsers.length > 0 && (
                <div className="absolute z-10 mt-1 w-full max-h-48 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                  {filteredUsers.map((user) => (
                    <button
                      key={user.id}
                      type="button"
                      onClick={() => handleUserSelect(user)}
                      className={`w-full px-4 py-2.5 text-left text-sm hover:bg-emerald-50 ${
                        assignedUserId === user.id ? "bg-emerald-50 text-emerald-700" : "text-slate-700"
                      }`}
                    >
                      <div className="font-medium">{user.full_name || "Unnamed"}</div>
                      {user.email && (
                        <div className="text-xs text-slate-500">{user.email}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {userDropdownOpen && filteredUsers.length === 0 && userSearch.trim() && (
                <div className="absolute z-10 mt-1 w-full rounded-lg border border-slate-200 bg-white p-3 text-sm text-slate-500 shadow-lg">
                  No doctors found
                </div>
              )}
            </div>
            {!assignedUserId && (
              <p className="text-xs text-slate-500">
                Select which doctor&apos;s calendar this appointment will be added to
              </p>
            )}
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Appointment Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Appointment with ${patientName}`}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Date & Time <span className="text-red-500">*</span>
              </label>
              <input
                type="datetime-local"
                value={appointmentDate}
                onChange={(e) => setAppointmentDate(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Duration
              </label>
              {appointmentType === "operation" ? (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="15"
                    step="15"
                    value={durationMinutes}
                    onChange={(e) => setDurationMinutes(e.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-slate-500 whitespace-nowrap">minutes</span>
                </div>
              ) : (
                <select
                  value={durationMinutes}
                  onChange={(e) => setDurationMinutes(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="15">15 minutes</option>
                  <option value="30">30 minutes</option>
                  <option value="45">45 minutes</option>
                  <option value="60">60 minutes</option>
                </select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="Rhône">Rhône</option>
              <option value="Champel">Champel</option>
              <option value="Gstaad">Gstaad</option>
              <option value="Montreux">Montreux</option>
              <option value="Video Call">Video Call</option>
              <option value="Phone Call">Phone Call</option>
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-700">
              Notes
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="Add any notes about this appointment..."
              className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">Email Notifications</p>
            <div className="space-y-2">
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={sendPatientEmail}
                  onChange={(e) => setSendPatientEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">
                  Send confirmation email to patient
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={sendUserEmail}
                  onChange={(e) => setSendUserEmail(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">
                  Send notification email to me
                </span>
              </label>
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={scheduleReminder}
                  onChange={(e) => setScheduleReminder(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span className="text-sm text-slate-700">
                  Send reminder 1 day before appointment
                </span>
              </label>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-full border border-slate-200 bg-white px-5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full border border-emerald-500 bg-emerald-600 px-5 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? "Creating..." : "Create Appointment"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
