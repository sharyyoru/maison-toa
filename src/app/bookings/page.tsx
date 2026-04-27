"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { supabaseClient } from "@/lib/supabaseClient";

type BookingPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type Booking = {
  id: string;
  patient_id: string;
  start_time: string;
  end_time: string;
  status: string;
  reason: string | null;
  location: string | null;
  created_at: string;
  patient: BookingPatient | null;
};

type FilterStatus = "all" | "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case "confirmed":
      return "bg-emerald-100 text-emerald-800";
    case "scheduled":
      return "bg-sky-100 text-sky-800";
    case "completed":
      return "bg-slate-100 text-slate-600";
    case "cancelled":
      return "bg-rose-100 text-rose-800";
    case "no_show":
      return "bg-amber-100 text-amber-800";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("en-GB", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function extractSourceKey(reason: string | null): string {
  if (!reason) return "unknownPatient";
  if (reason.includes("[Online Booking]")) return "sourceOnline";
  if (reason.includes("[Intake Form]")) return "sourceIntake";
  return "sourceManual";
}

function extractDoctor(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Doctor: ([^\]]+)\]/);
  return match ? match[1] : null;
}

export default function BookingsPage() {
  const t = useTranslations("bookingsPage");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<FilterStatus>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [dateRange, setDateRange] = useState<"all" | "today" | "week" | "month">("all");

  useEffect(() => {
    async function fetchBookings() {
      try {
        setLoading(true);
        setError(null);

        let query = supabaseClient
          .from("appointments")
          .select(
            "id, patient_id, start_time, end_time, status, reason, location, created_at, patient:patients(id, first_name, last_name, email, phone)"
          )
          .order("created_at", { ascending: false });

        // Filter by online bookings (from intake or public booking form)
        query = query.or("reason.ilike.%[Online Booking]%,reason.ilike.%[Intake Form]%");

        // Apply date range filter
        if (dateRange !== "all") {
          const now = new Date();
          let startDate: Date;
          
          if (dateRange === "today") {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          } else if (dateRange === "week") {
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          } else {
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          }
          
          query = query.gte("created_at", startDate.toISOString());
        }

        // Apply status filter
        if (filterStatus !== "all") {
          query = query.eq("status", filterStatus);
        }

        const { data, error: queryError } = await query;

        if (queryError) {
          throw queryError;
        }

        setBookings((data as unknown as Booking[]) || []);
      } catch (err) {
        console.error("Error fetching bookings:", err);
        setError(err instanceof Error ? err.message : t("errorLoadFailed"));
      } finally {
        setLoading(false);
      }
    }

    fetchBookings();
  }, [filterStatus, dateRange]);

  // Filter bookings by search query
  const filteredBookings = bookings.filter((booking) => {
    if (!searchQuery) return true;
    
    const query = searchQuery.toLowerCase();
    const patientName = `${booking.patient?.first_name || ""} ${booking.patient?.last_name || ""}`.toLowerCase();
    const patientEmail = (booking.patient?.email || "").toLowerCase();
    const patientPhone = (booking.patient?.phone || "").toLowerCase();
    const reason = (booking.reason || "").toLowerCase();
    
    return (
      patientName.includes(query) ||
      patientEmail.includes(query) ||
      patientPhone.includes(query) ||
      reason.includes(query)
    );
  });

  // Stats
  const stats = {
    total: bookings.length,
    scheduled: bookings.filter((b) => b.status === "scheduled").length,
    confirmed: bookings.filter((b) => b.status === "confirmed").length,
    completed: bookings.filter((b) => b.status === "completed").length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
  };

  return (
    <main className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">{t("title")}</h1>
            <p className="text-slate-600 mt-1">
              {t("subtitle")}
            </p>
          </div>
          <Link
            href="/appointments"
            className="inline-flex items-center px-4 py-2 bg-slate-900 text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
            {t("fullCalendar")}
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-8">
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="text-2xl font-bold text-slate-900">{stats.total}</div>
            <div className="text-sm text-slate-600">{t("totalBookings")}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-sky-200">
            <div className="text-2xl font-bold text-sky-600">{stats.scheduled}</div>
            <div className="text-sm text-slate-600">{t("scheduled")}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-emerald-200">
            <div className="text-2xl font-bold text-emerald-600">{stats.confirmed}</div>
            <div className="text-sm text-slate-600">{t("confirmed")}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-200">
            <div className="text-2xl font-bold text-slate-600">{stats.completed}</div>
            <div className="text-sm text-slate-600">{t("completed")}</div>
          </div>
          <div className="bg-white rounded-xl p-4 shadow-sm border border-rose-200">
            <div className="text-2xl font-bold text-rose-600">{stats.cancelled}</div>
            <div className="text-sm text-slate-600">{t("cancelled")}</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* Search */}
            <div className="flex-1">
              <div className="relative">
                <svg
                  className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                <input
                  type="text"
                  placeholder={t("searchPlaceholder")}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200"
                />
              </div>
            </div>

            {/* Date Range */}
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as typeof dateRange)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">{t("allTime")}</option>
              <option value="today">{t("today")}</option>
              <option value="week">{t("last7Days")}</option>
              <option value="month">{t("last30Days")}</option>
            </select>

            {/* Status Filter */}
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value as FilterStatus)}
              className="px-4 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-slate-200"
            >
              <option value="all">{t("allStatuses")}</option>
              <option value="scheduled">{t("scheduled")}</option>
              <option value="confirmed">{t("confirmed")}</option>
              <option value="completed">{t("completed")}</option>
              <option value="cancelled">{t("cancelled")}</option>
              <option value="no_show">{t("noShow")}</option>
            </select>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-6">
            <p className="text-rose-800">{error}</p>
          </div>
        )}

        {/* Loading State */}
        {loading ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-slate-300 border-t-slate-600 rounded-full mx-auto mb-4"></div>
            <p className="text-slate-600">{t("loading")}</p>
          </div>
        ) : filteredBookings.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
            <svg
              className="w-12 h-12 text-slate-300 mx-auto mb-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <p className="text-slate-600 mb-2">{t("noBookings")}</p>
            <p className="text-sm text-slate-500">
              {searchQuery
                ? t("noBookingsSearchHint")
                : t("noBookingsHint")}
            </p>
          </div>
        ) : (
          /* Bookings Table */
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.patient")}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.appointment")}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.doctor")}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.source")}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.status")}
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.bookedOn")}
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-medium text-slate-500 uppercase tracking-wider">
                      {t("columns.actions")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredBookings.map((booking) => {
                    const patientName = booking.patient
                      ? `${booking.patient.first_name || ""} ${booking.patient.last_name || ""}`.trim() || t("unknownPatient")
                      : t("unknownPatient");
                    const doctor = extractDoctor(booking.reason);
                    const sourceKey = extractSourceKey(booking.reason);
                    const source = t(sourceKey);

                    return (
                      <tr key={booking.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="flex items-center">
                            <div className="w-10 h-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 font-medium mr-3">
                              {patientName.charAt(0).toUpperCase()}
                            </div>
                            <div>
                              <div className="font-medium text-slate-900">{patientName}</div>
                              <div className="text-sm text-slate-500">
                                {booking.patient?.email || booking.patient?.phone || t("noContact")}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-900">{formatDateTime(booking.start_time)}</div>
                          <div className="text-sm text-slate-500">{booking.location || t("noLocation")}</div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="text-slate-900">{doctor || t("notSpecified")}</div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                              sourceKey === "sourceOnline"
                                ? "bg-blue-100 text-blue-800"
                                : sourceKey === "sourceIntake"
                                ? "bg-purple-100 text-purple-800"
                                : "bg-slate-100 text-slate-800"
                            }`}
                          >
                            {source}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClasses(
                              booking.status
                            )}`}
                          >
                            {booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-500">
                          {formatDateTime(booking.created_at)}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Link
                            href={`/patients/${booking.patient_id}`}
                            className="text-slate-600 hover:text-slate-900 font-medium text-sm"
                          >
                            {t("viewPatient")}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
