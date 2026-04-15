"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatSwissDateWithWeekday, formatSwissTimeAmPm } from "@/lib/swissTimezone";

type BookingStatus = "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

type Patient = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  source: string | null;
};

type Booking = {
  id: string;
  start_time: string;
  end_time: string | null;
  status: BookingStatus;
  reason: string | null;
  location: string | null;
  created_at: string;
  patient: Patient | null;
};

const STATUS_LABELS: Record<BookingStatus, string> = {
  scheduled: "Pending",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

const STATUS_COLORS: Record<BookingStatus, string> = {
  scheduled: "bg-amber-100 text-amber-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  completed: "bg-sky-100 text-sky-800",
  cancelled: "bg-red-100 text-red-700",
  no_show: "bg-slate-100 text-slate-600",
};

function parseReason(reason: string | null): { service: string; doctor: string; notes: string } {
  if (!reason) return { service: "", doctor: "", notes: "" };
  const doctorMatch = reason.match(/\[Doctor:\s*(.+?)\s*\]/i);
  const doctor = doctorMatch ? doctorMatch[1] : "";
  // Remove markers from the reason to get service + notes
  const clean = reason
    .replace(/\s*\[Doctor:[^\]]*\]/gi, "")
    .replace(/\s*\[Online Booking\]/gi, "")
    .trim();
  const dashIdx = clean.indexOf(" - ");
  const service = dashIdx > -1 ? clean.slice(0, dashIdx).trim() : clean;
  const notes = dashIdx > -1 ? clean.slice(dashIdx + 3).trim() : "";
  return { service, doctor, notes };
}

const PAGE_SIZE = 50;

export default function OnlineBookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const [statusFilter, setStatusFilter] = useState<"all" | BookingStatus>("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const [updatingId, setUpdatingId] = useState<string | null>(null);

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
        status: statusFilter,
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
  }, [page, statusFilter, debouncedSearch]);

  useEffect(() => {
    fetchBookings();
  }, [fetchBookings]);

  async function updateStatus(id: string, status: BookingStatus) {
    setUpdatingId(id);
    try {
      const res = await fetch("/api/online-bookings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      setBookings((prev) =>
        prev.map((b) => (b.id === id ? { ...b, status } : b))
      );
    } catch {
      alert("Failed to update booking status.");
    } finally {
      setUpdatingId(null);
    }
  }

  const totalPages = Math.ceil(total / PAGE_SIZE);

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
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setPage(1); }}
          className="h-9 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 focus:border-slate-400 focus:outline-none"
        >
          <option value="all">All Statuses</option>
          <option value="scheduled">Pending</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>
        <span className="ml-auto text-sm text-slate-500">{total} booking{total !== 1 ? "s" : ""}</span>
      </div>

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
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
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Type</th>
              <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
                  <svg className="mx-auto h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </td>
              </tr>
            )}
            {!loading && bookings.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-slate-400">
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
                    {notes && (
                      <div className="max-w-[160px] truncate text-xs text-slate-400" title={notes}>{notes}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-700">{doctor || "—"}</td>
                  <td className="px-4 py-3 text-slate-700 whitespace-nowrap">
                    <div>{formatSwissDateWithWeekday(apptDate)}</div>
                    <div className="text-xs text-slate-400">{formatSwissTimeAmPm(apptDate)}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${isNew ? "bg-purple-100 text-purple-700" : "bg-slate-100 text-slate-600"}`}>
                      {isNew ? "New Patient" : "Existing"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_COLORS[booking.status]}`}>
                      {STATUS_LABELS[booking.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {booking.status === "scheduled" && (
                        <button
                          onClick={() => updateStatus(booking.id, "confirmed")}
                          disabled={updatingId === booking.id}
                          className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                        >
                          Confirm
                        </button>
                      )}
                      {booking.status === "confirmed" && (
                        <button
                          onClick={() => updateStatus(booking.id, "completed")}
                          disabled={updatingId === booking.id}
                          className="rounded-lg bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700 hover:bg-sky-100 disabled:opacity-50"
                        >
                          Complete
                        </button>
                      )}
                      {(booking.status === "scheduled" || booking.status === "confirmed") && (
                        <button
                          onClick={() => {
                            if (confirm("Cancel this booking?")) updateStatus(booking.id, "cancelled");
                          }}
                          disabled={updatingId === booking.id}
                          className="rounded-lg bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-100 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      <Link
                        href={`/appointments?patient=${booking.patient?.id || ""}`}
                        className="rounded-lg bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
                      >
                        View
                      </Link>
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
    </div>
  );
}
