"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatSwissDateWithWeekday, formatSwissTimeAmPm, formatSwissYmd, formatSwissDate, formatSwissTime } from "@/lib/swissTimezone";

type BookingStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
};

type Provider = {
  id: string;
  name: string | null;
};

type Booking = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: BookingStatus;
  reason: string | null;
  location: string | null;
  created_at: string;
  provider_id: string | null;
  patient: Patient | null;
  provider: Provider | null;
};

// Known treatment/package names that should stay in the service column
const TREATMENT_NAMES = [
  "Glass Skin",
  "Rituel collagène glow",
  "Rituel collagene glow",
];

function parseReason(reason: string | null): { service: string; doctor: string; notes: string } {
  if (!reason) return { service: "", doctor: "", notes: "" };
  const doctorMatch = reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
  const doctor = doctorMatch ? doctorMatch[1] : "";
  // Remove markers from the reason to get service + notes
  let clean = reason
    .replace(/\s*\[Doctor:[^\]]*\]/gi, "")
    .replace(/\s*\[Online Booking\]/gi, "")
    .trim();

  // Find if any treatment name appears in the string
  let foundTreatment = "";
  for (const treatment of TREATMENT_NAMES) {
    const idx = clean.toLowerCase().indexOf(treatment.toLowerCase());
    if (idx > -1) {
      foundTreatment = clean.slice(idx, idx + treatment.length);
      break;
    }
  }

  // Split on " - " to separate service from notes
  const dashIdx = clean.indexOf(" - ");
  if (dashIdx > -1) {
    let servicePart = clean.slice(0, dashIdx).trim();
    let notesPart = clean.slice(dashIdx + 3).trim();

    // If we found a treatment name in the notes part, move it to service
    if (foundTreatment && notesPart.toLowerCase().startsWith(foundTreatment.toLowerCase())) {
      // Extract just the treatment name from the beginning of notes
      servicePart = `${servicePart} ${foundTreatment}`;
      notesPart = notesPart.slice(foundTreatment.length).trim();
      // Clean up leading dash or space
      if (notesPart.startsWith("- ")) {
        notesPart = notesPart.slice(2).trim();
      }
    }

    return { service: servicePart, doctor, notes: notesPart };
  }

  return { service: clean, doctor, notes: "" };
}

const PAGE_SIZE = 50;

export default function OnlineBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Delete modal state
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deletingBooking, setDeletingBooking] = useState<Booking | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState(30);
  const [editLoading, setEditLoading] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [emailLanguage, setEmailLanguage] = useState<"fr" | "en">("fr");


  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const fetchBookings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(page),
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
      });
      const res = await fetch(`/api/online-bookings?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to fetch");
      setBookings(data.bookings);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load bookings");
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  const totalPages = Math.ceil(total / PAGE_SIZE);

  const openDeleteModal = (booking: Booking) => {
    setDeletingBooking(booking);
    setDeleteModalOpen(true);
    setDeleteError(null);
  };

  const closeDeleteModal = () => {
    if (deleteLoading) return;
    setDeleteModalOpen(false);
    setDeletingBooking(null);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!deletingBooking || deleteLoading) return;

    setDeleteLoading(true);
    setDeleteError(null);

    try {
      const res = await fetch(`/api/online-bookings?id=${deletingBooking.id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete booking");
      }

      // Remove from list
      setBookings((prev) => prev.filter((b) => b.id !== deletingBooking.id));
      setTotal((prev) => Math.max(0, prev - 1));

      closeDeleteModal();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete booking");
    } finally {
      setDeleteLoading(false);
    }
  };

  const openEditModal = (booking: Booking) => {
    setEditingBooking(booking);
    const date = new Date(booking.start_time);
    setEditDate(formatSwissYmd(date));
    setEditTime(formatSwissTime(date));
    
    // Calculate duration from start and end times
    if (booking.end_time) {
      const start = new Date(booking.start_time);
      const end = new Date(booking.end_time);
      const durationMinutes = Math.round((end.getTime() - start.getTime()) / (1000 * 60));
      setEditDuration(durationMinutes > 0 ? durationMinutes : 30);
    } else {
      setEditDuration(30);
    }
    
    setEditModalOpen(true);
    setEditError(null);
  };

  const closeEditModal = () => {
    if (editLoading) return;
    setEditModalOpen(false);
    setEditingBooking(null);
    setEditError(null);
  };

  const handleEditSave = async () => {
    if (!editingBooking || editLoading) return;

    if (!editDate || !editTime) {
      setEditError("Please select both date and time");
      return;
    }

    setEditLoading(true);
    setEditError(null);

    try {
      const startLocal = new Date(`${editDate}T${editTime}:00`);
      const endLocal = new Date(startLocal.getTime() + editDuration * 60 * 1000);

      const res = await fetch("/api/online-bookings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingBooking.id,
          start_time: startLocal.toISOString(),
          end_time: endLocal.toISOString(),
          language: emailLanguage,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to update booking");
      }

      // Update the booking in the list
      setBookings((prev) =>
        prev.map((b) =>
          b.id === editingBooking.id
            ? { ...b, start_time: startLocal.toISOString(), end_time: endLocal.toISOString() }
            : b
        )
      );

      closeEditModal();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to update booking");
    } finally {
      setEditLoading(false);
    }
  };

  const durationOptions = [
    { value: 15, label: "15 minutes" },
    { value: 30, label: "30 minutes" },
    { value: 45, label: "45 minutes" },
    { value: 60, label: "1 hour" },
    { value: 90, label: "1.5 hours" },
    { value: 120, label: "2 hours" },
    { value: 180, label: "3 hours" },
    { value: 240, label: "4 hours" },
  ];

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Online Bookings</h1>
          <p className="mt-1 text-sm text-slate-500">
            Appointments submitted through the public booking portal
          </p>
        </div>
        <Link
          href="/book-appointment"
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
        >
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
          </svg>
          View Booking Page
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by service or doctor…"
          className="h-9 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
        />
        <span className="ml-auto text-sm text-slate-500">{total} booking{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        {error && (
          <div className="p-4 text-sm text-red-600">{error}</div>
        )}
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Patient</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Contact</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Service</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Doctor</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Date & Time</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Created</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  <svg className="mx-auto h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td>
              </tr>
            )}
            {!loading && bookings.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                  No online bookings found
                </td>
              </tr>
            )}
            {!loading && bookings.map((booking) => {
              const { service, doctor, notes } = parseReason(booking.reason);
              const apptDate = new Date(booking.start_time);
              const isNew = booking.patient?.source === "online_booking";

              return (
                <tr key={booking.id} className="hover:bg-slate-50/60">
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {booking.patient ? (
                      <Link
                        href={`/patients/${booking.patient.id}`}
                        className="hover:underline hover:text-sky-600"
                      >
                        {booking.patient.first_name} {booking.patient.last_name}
                      </Link>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <div>{booking.patient?.email || "—"}</div>
                    {booking.patient?.phone && (
                      <div className="text-xs text-slate-400">{booking.patient.phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <div className="max-w-[160px] truncate" title={service}>{service || "—"}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{doctor || "—"}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    <div>{formatSwissDateWithWeekday(apptDate)}</div>
                    <div className="text-xs text-slate-400">{formatSwissTimeAmPm(apptDate)}</div>
                  </td>
                  <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                    <div className="text-sm">{formatSwissDateWithWeekday(new Date(booking.created_at))}</div>
                    <div className="text-xs text-slate-400">{formatSwissTimeAmPm(new Date(booking.created_at))}</div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <Link
                        href={`/appointments?date=${formatSwissYmd(new Date(booking.start_time))}${doctor ? `&doctorName=${encodeURIComponent(doctor)}` : ''}`}
                        className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        View
                      </Link>
                      <button
                        onClick={() => openEditModal(booking)}
                        className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-600 hover:bg-sky-100"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => openDeleteModal(booking)}
                        className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <p className="text-sm text-slate-500">
            Page {page} of {totalPages}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && deletingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Delete Booking</h3>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to delete this booking for{" "}
              <strong>
                {deletingBooking.patient?.first_name} {deletingBooking.patient?.last_name}
              </strong>
              ?
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {formatSwissDateWithWeekday(new Date(deletingBooking.start_time))} at{" "}
              {formatSwissTimeAmPm(new Date(deletingBooking.start_time))}
            </p>
            {deleteError && (
              <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{deleteError}</div>
            )}
            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={closeDeleteModal}
                disabled={deleteLoading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleteLoading}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Date/Time Modal */}
      {editModalOpen && editingBooking && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
            <h3 className="text-lg font-semibold text-slate-900">Edit Booking Date & Time</h3>

            {editError && (
              <div className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-600">{editError}</div>
            )}

            {/* Read-only booking details */}
            <div className="mt-4 rounded-lg bg-slate-50 p-4 space-y-2">
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase">Patient</span>
                <span className="text-sm text-slate-900">
                  {editingBooking.patient?.first_name} {editingBooking.patient?.last_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase">Service</span>
                <span className="text-sm text-slate-900 text-right max-w-[200px]">
                  {parseReason(editingBooking.reason).service}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase">Doctor</span>
                <span className="text-sm text-slate-900">{parseReason(editingBooking.reason).doctor || "—"}</span>
              </div>
              {parseReason(editingBooking.reason).notes && (
                <div className="flex justify-between">
                  <span className="text-xs font-medium text-slate-500 uppercase">Patient Note</span>
                  <span className="text-sm text-slate-900 text-right max-w-[200px]">
                    {parseReason(editingBooking.reason).notes}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-xs font-medium text-slate-500 uppercase">Created</span>
                <span className="text-sm text-slate-900">
                  {formatSwissDateWithWeekday(new Date(editingBooking.created_at))} {formatSwissTimeAmPm(new Date(editingBooking.created_at))}
                </span>
              </div>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700">Date</label>
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Time</label>
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700">Duration</label>
                <select
                  value={editDuration}
                  onChange={(e) => setEditDuration(Number(e.target.value))}
                  className="mt-1 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-sky-500 focus:outline-none"
                >
                  {durationOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Email language selector */}
            <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="mb-2 text-xs font-medium text-slate-500 uppercase tracking-wide">
                Notification email language
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setEmailLanguage("fr")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
                    emailLanguage === "fr"
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  🇫🇷 FR
                </button>
                <button
                  onClick={() => setEmailLanguage("en")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium border transition-colors ${
                    emailLanguage === "en"
                      ? "bg-slate-800 text-white border-slate-800"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
                  }`}
                >
                  🇬🇧 EN
                </button>
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-3">
              <button
                onClick={closeEditModal}
                disabled={editLoading}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleEditSave}
                disabled={editLoading}
                className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
              >
                {editLoading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
