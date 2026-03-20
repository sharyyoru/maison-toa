"use client";

import { useEffect, useState, useMemo } from "react";

type PlatformUser = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type AvailabilityEntry = {
  id: string;
  user_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  is_available: boolean;
  location: string;
};

type DaySchedule = {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  isAvailable: boolean;
};

const DAYS_OF_WEEK = [
  { value: 0, label: "Sunday", short: "Sun" },
  { value: 1, label: "Monday", short: "Mon" },
  { value: 2, label: "Tuesday", short: "Tue" },
  { value: 3, label: "Wednesday", short: "Wed" },
  { value: 4, label: "Thursday", short: "Thu" },
  { value: 5, label: "Friday", short: "Fri" },
  { value: 6, label: "Saturday", short: "Sat" },
];

const TIME_OPTIONS = [
  "06:00", "06:30", "07:00", "07:30", "08:00", "08:30", "09:00", "09:30",
  "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30",
  "18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00", "21:30", "22:00",
];

const LOCATIONS = ["Rhône", "Champel", "Gstaad", "Montreux"];

const DEFAULT_SCHEDULE: DaySchedule[] = [
  { dayOfWeek: 0, startTime: "08:00", endTime: "19:00", isAvailable: false },
  { dayOfWeek: 1, startTime: "08:00", endTime: "19:00", isAvailable: true },
  { dayOfWeek: 2, startTime: "08:00", endTime: "19:00", isAvailable: true },
  { dayOfWeek: 3, startTime: "08:00", endTime: "19:00", isAvailable: true },
  { dayOfWeek: 4, startTime: "08:00", endTime: "19:00", isAvailable: true },
  { dayOfWeek: 5, startTime: "08:00", endTime: "19:00", isAvailable: true },
  { dayOfWeek: 6, startTime: "08:00", endTime: "19:00", isAvailable: false },
];

function formatTime(time: string): string {
  const [hours, minutes] = time.split(":");
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  const displayHour = hour % 12 || 12;
  return `${displayHour}:${minutes} ${ampm}`;
}

export default function ControllersPage() {
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [selectedLocation, setSelectedLocation] = useState<string>("Rhône");
  const [availability, setAvailability] = useState<AvailabilityEntry[]>([]);
  const [schedule, setSchedule] = useState<DaySchedule[]>(DEFAULT_SCHEDULE);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState("");

  // Load users
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

  // Load availability when user or location changes
  useEffect(() => {
    if (!selectedUserId) {
      setSchedule(DEFAULT_SCHEDULE);
      return;
    }

    async function loadAvailability() {
      try {
        setLoading(true);
        setError(null);
        
        const response = await fetch(`/api/controllers/availability?userId=${selectedUserId}`);
        if (!response.ok) {
          throw new Error("Failed to load availability");
        }
        
        const data = await response.json();
        const entries = (data.availability || []) as AvailabilityEntry[];
        setAvailability(entries);
        
        // Filter for current location and build schedule
        const locationEntries = entries.filter(e => e.location === selectedLocation);
        
        const newSchedule = DEFAULT_SCHEDULE.map(defaultDay => {
          const entry = locationEntries.find(e => e.day_of_week === defaultDay.dayOfWeek);
          if (entry) {
            return {
              dayOfWeek: entry.day_of_week,
              startTime: entry.start_time.slice(0, 5),
              endTime: entry.end_time.slice(0, 5),
              isAvailable: entry.is_available,
            };
          }
          return defaultDay;
        });
        
        setSchedule(newSchedule);
      } catch (err) {
        console.error("Error loading availability:", err);
        setError("Failed to load availability schedule");
      } finally {
        setLoading(false);
      }
    }
    
    loadAvailability();
  }, [selectedUserId, selectedLocation]);

  const filteredUsers = useMemo(() => {
    if (!userSearch.trim()) return users;
    const search = userSearch.toLowerCase();
    return users.filter(user => 
      (user.full_name?.toLowerCase() || "").includes(search) ||
      (user.email?.toLowerCase() || "").includes(search)
    );
  }, [users, userSearch]);

  const selectedUser = users.find(u => u.id === selectedUserId);

  function handleDayToggle(dayOfWeek: number) {
    setSchedule(prev => prev.map(day => 
      day.dayOfWeek === dayOfWeek 
        ? { ...day, isAvailable: !day.isAvailable }
        : day
    ));
  }

  function handleTimeChange(dayOfWeek: number, field: "startTime" | "endTime", value: string) {
    setSchedule(prev => prev.map(day => 
      day.dayOfWeek === dayOfWeek 
        ? { ...day, [field]: value }
        : day
    ));
  }

  async function handleSaveSchedule() {
    if (!selectedUserId) {
      setError("Please select a user first");
      return;
    }

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);

      // Save each day's schedule
      for (const day of schedule) {
        const response = await fetch("/api/controllers/availability", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: selectedUserId,
            dayOfWeek: day.dayOfWeek,
            startTime: day.startTime,
            endTime: day.endTime,
            isAvailable: day.isAvailable,
            location: selectedLocation,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to save ${DAYS_OF_WEEK[day.dayOfWeek].label}`);
        }
      }

      setSuccess("Schedule saved successfully!");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      console.error("Error saving schedule:", err);
      setError(err instanceof Error ? err.message : "Failed to save schedule");
    } finally {
      setSaving(false);
    }
  }

  function handleCopyToAllDays(sourceDayOfWeek: number) {
    const sourceDay = schedule.find(d => d.dayOfWeek === sourceDayOfWeek);
    if (!sourceDay) return;

    setSchedule(prev => prev.map(day => ({
      ...day,
      startTime: sourceDay.startTime,
      endTime: sourceDay.endTime,
      isAvailable: day.dayOfWeek === 0 || day.dayOfWeek === 6 ? day.isAvailable : sourceDay.isAvailable,
    })));
  }

  function handleSetDefaultHours() {
    setSchedule(DEFAULT_SCHEDULE);
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-center">
        <div className="w-full max-w-5xl space-y-6">
          {/* Header */}
          <div className="flex items-baseline justify-between gap-3">
            <div>
              <h1 className="text-xl font-semibold text-slate-900">Controllers</h1>
              <p className="text-sm text-slate-500">
                Manage user availability schedules and working hours for appointments.
              </p>
            </div>
          </div>

          {/* Main Card */}
          <div className="rounded-2xl border border-slate-200/80 bg-white/95 shadow-xl overflow-hidden">
            {/* User Selection Header */}
            <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-6 py-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Select User / Doctor
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      value={selectedUser ? (selectedUser.full_name || selectedUser.email || "") : userSearch}
                      onChange={(e) => {
                        setUserSearch(e.target.value);
                        if (selectedUserId) setSelectedUserId("");
                      }}
                      placeholder="Search for a user..."
                      className="w-full rounded-xl border-0 bg-white/10 backdrop-blur px-4 py-3 text-white placeholder-slate-400 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/50 transition-all"
                    />
                    {!selectedUserId && userSearch && filteredUsers.length > 0 && (
                      <div className="absolute z-20 mt-2 w-full rounded-xl bg-white shadow-2xl border border-slate-200 max-h-64 overflow-y-auto">
                        {filteredUsers.map(user => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => {
                              setSelectedUserId(user.id);
                              setUserSearch("");
                            }}
                            className="w-full px-4 py-3 text-left hover:bg-slate-50 transition-colors border-b border-slate-100 last:border-b-0"
                          >
                            <div className="font-medium text-slate-900">{user.full_name || "Unnamed"}</div>
                            <div className="text-xs text-slate-500">{user.email}</div>
                          </button>
                        ))}
                      </div>
                    )}
                    {selectedUserId && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedUserId("");
                          setUserSearch("");
                        }}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors"
                      >
                        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
                <div className="sm:w-48">
                  <label className="block text-xs font-medium text-slate-300 mb-2">
                    Location
                  </label>
                  <select
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="w-full rounded-xl border-0 bg-white/10 backdrop-blur px-4 py-3 text-white focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-sky-400/50 transition-all appearance-none cursor-pointer"
                  >
                    {LOCATIONS.map(loc => (
                      <option key={loc} value={loc} className="text-slate-900">{loc}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Schedule Grid */}
            <div className="p-6">
              {error && (
                <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 flex items-center gap-2">
                  <svg className="h-5 w-5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {success}
                </div>
              )}

              {!selectedUserId ? (
                <div className="text-center py-16">
                  <div className="inline-flex h-20 w-20 items-center justify-center rounded-full bg-slate-100 mb-4">
                    <svg className="h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-medium text-slate-900 mb-2">Select a User</h3>
                  <p className="text-sm text-slate-500 max-w-sm mx-auto">
                    Choose a user from the dropdown above to view and edit their availability schedule.
                  </p>
                </div>
              ) : loading ? (
                <div className="text-center py-16">
                  <div className="inline-flex h-12 w-12 items-center justify-center">
                    <svg className="animate-spin h-8 w-8 text-sky-600" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                  </div>
                  <p className="mt-3 text-sm text-slate-500">Loading schedule...</p>
                </div>
              ) : (
                <>
                  {/* Quick Actions */}
                  <div className="flex flex-wrap gap-2 mb-6">
                    <button
                      type="button"
                      onClick={handleSetDefaultHours}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                      </svg>
                      Reset to Default (8 AM - 7 PM)
                    </button>
                  </div>

                  {/* Schedule Table */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="bg-slate-50">
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Day</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Available</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Start Time</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">End Time</th>
                          <th className="px-4 py-3 text-center text-xs font-semibold text-slate-600 uppercase tracking-wider">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {schedule.map(day => {
                          const dayInfo = DAYS_OF_WEEK[day.dayOfWeek];
                          const isWeekend = day.dayOfWeek === 0 || day.dayOfWeek === 6;
                          
                          return (
                            <tr 
                              key={day.dayOfWeek} 
                              className={`transition-colors ${
                                day.isAvailable 
                                  ? "bg-white hover:bg-slate-50" 
                                  : "bg-slate-50/50"
                              }`}
                            >
                              <td className="px-4 py-4">
                                <div className="flex items-center gap-3">
                                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-semibold text-sm ${
                                    day.isAvailable 
                                      ? "bg-emerald-100 text-emerald-700" 
                                      : "bg-slate-100 text-slate-400"
                                  }`}>
                                    {dayInfo.short}
                                  </div>
                                  <div>
                                    <div className={`font-medium ${day.isAvailable ? "text-slate-900" : "text-slate-400"}`}>
                                      {dayInfo.label}
                                    </div>
                                    {isWeekend && (
                                      <div className="text-xs text-slate-400">Weekend</div>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-4 text-center">
                                <button
                                  type="button"
                                  onClick={() => handleDayToggle(day.dayOfWeek)}
                                  className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-sky-500 ${
                                    day.isAvailable ? "bg-emerald-500" : "bg-slate-200"
                                  }`}
                                >
                                  <span
                                    className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-lg transition-transform ${
                                      day.isAvailable ? "translate-x-8" : "translate-x-1"
                                    }`}
                                  />
                                </button>
                              </td>
                              <td className="px-4 py-4">
                                <select
                                  value={day.startTime}
                                  onChange={(e) => handleTimeChange(day.dayOfWeek, "startTime", e.target.value)}
                                  disabled={!day.isAvailable}
                                  className={`rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors ${
                                    day.isAvailable 
                                      ? "border-slate-200 bg-white text-slate-900" 
                                      : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                                  }`}
                                >
                                  {TIME_OPTIONS.map(time => (
                                    <option key={time} value={time}>{formatTime(time)}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-4">
                                <select
                                  value={day.endTime}
                                  onChange={(e) => handleTimeChange(day.dayOfWeek, "endTime", e.target.value)}
                                  disabled={!day.isAvailable}
                                  className={`rounded-lg border px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 transition-colors ${
                                    day.isAvailable 
                                      ? "border-slate-200 bg-white text-slate-900" 
                                      : "border-slate-100 bg-slate-50 text-slate-400 cursor-not-allowed"
                                  }`}
                                >
                                  {TIME_OPTIONS.map(time => (
                                    <option key={time} value={time}>{formatTime(time)}</option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-4 py-4 text-center">
                                {day.isAvailable && (
                                  <button
                                    type="button"
                                    onClick={() => handleCopyToAllDays(day.dayOfWeek)}
                                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 hover:border-slate-300 transition-colors"
                                    title="Copy times to all weekdays"
                                  >
                                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                    </svg>
                                    Copy to All
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Summary */}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-emerald-100/50 border border-emerald-200/50 p-4">
                      <div className="text-xs font-medium text-emerald-600 mb-1">Working Days</div>
                      <div className="text-2xl font-bold text-emerald-700">
                        {schedule.filter(d => d.isAvailable).length}
                      </div>
                      <div className="text-xs text-emerald-600/70">days per week</div>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-sky-50 to-sky-100/50 border border-sky-200/50 p-4">
                      <div className="text-xs font-medium text-sky-600 mb-1">Typical Hours</div>
                      <div className="text-2xl font-bold text-sky-700">
                        {schedule.filter(d => d.isAvailable).length > 0 
                          ? `${formatTime(schedule.find(d => d.isAvailable)?.startTime || "08:00")} - ${formatTime(schedule.find(d => d.isAvailable)?.endTime || "19:00")}`
                          : "N/A"
                        }
                      </div>
                      <div className="text-xs text-sky-600/70">working hours</div>
                    </div>
                    <div className="rounded-xl bg-gradient-to-br from-violet-50 to-violet-100/50 border border-violet-200/50 p-4">
                      <div className="text-xs font-medium text-violet-600 mb-1">Location</div>
                      <div className="text-2xl font-bold text-violet-700">{selectedLocation}</div>
                      <div className="text-xs text-violet-600/70">clinic branch</div>
                    </div>
                  </div>

                  {/* Save Button */}
                  <div className="mt-8 flex items-center justify-end gap-4">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedUserId("");
                        setUserSearch("");
                      }}
                      className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveSchedule}
                      disabled={saving}
                      className="rounded-xl bg-gradient-to-r from-sky-600 to-sky-700 px-8 py-3 text-sm font-medium text-white hover:from-sky-700 hover:to-sky-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg shadow-sky-500/25 hover:shadow-xl hover:shadow-sky-500/30 flex items-center gap-2"
                    >
                      {saving ? (
                        <>
                          <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                          </svg>
                          Saving...
                        </>
                      ) : (
                        <>
                          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Save Schedule
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Info Card */}
          <div className="rounded-xl border border-slate-200/80 bg-gradient-to-br from-slate-50 to-white p-6">
            <h3 className="text-sm font-semibold text-slate-900 mb-3 flex items-center gap-2">
              <svg className="h-5 w-5 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              About User Availability
            </h3>
            <div className="text-sm text-slate-600 space-y-2">
              <p>
                This controller allows you to set the working hours for each user/doctor per day of the week.
                The availability schedule is used to:
              </p>
              <ul className="list-disc list-inside space-y-1 text-slate-500">
                <li>Show available time slots when booking appointments</li>
                <li>Validate appointment times against user schedules</li>
                <li>Display availability warnings in the appointment modal</li>
                <li>Filter calendar views by doctor availability</li>
              </ul>
              <p className="text-xs text-slate-400 mt-3">
                Note: Changes take effect immediately after saving.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
