"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseClient } from "@/lib/supabaseClient";
import { getAppointmentNotes, getAppointmentTitle, getAppointmentDisplayName } from "@/lib/appointmentUtils";
import { formatSwissAppointmentDateTime } from "@/lib/swissTimezone";

type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

type Appointment = {
  id: string;
  patient_id: string;
  provider_id: string | null;
  start_time: string;
  end_time: string | null;
  status: AppointmentStatus;
  reason: string | null;
  title?: string | null;
  notes?: string | null;
  location: string | null;
  provider: {
    id: string;
    name: string | null;
  } | null;
};

type FilterMode = "future" | "all";
type WorkflowStatus = "pending" | "approved" | "rescheduled" | "cancelled";

type SortField = "start_time" | "status" | "location" | "provider";
type SortOrder = "asc" | "desc";

const CLINIC_LOCATION_OPTIONS = ["Rhône", "Champel", "Gstaad", "Montreux"];
const CONSULTATION_DURATION_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "60 minutes" },
  { value: 90, label: "90 minutes" },
  { value: 120, label: "120 minutes" },
];

const APPOINTMENT_CATEGORY_OPTIONS = [
  "No selection",
  "Mesotherapy",
  "Dermomask",
  "1ère consultation",
  "Administration",
  "Cavitation",
  "CO2",
  "Control",
  "Emla Cream",
  "Cryotherapy",
  "Discussion",
  "EMSCULPT",
  "Cutera laser hair removal",
  "Epilation laser Gentel",
  "Electrolysis hair removal",
  "HIFU",
  "Injection (botox; Acide hyaluronic)",
  "Important",
  "IPL",
  "Meso Anti-age",
  "Meso Anti-cellulite",
  "Meso Anti-tache",
  "Microdermabrasion",
  "MORPHEUS8",
  "Radio frequency",
  "Meeting",
  "OP Surgery",
  "Breaks/Change of Location",
  "PRP",
  "Tatoo removal",
  "TCA",
  "Treatment",
  "Caviar treatment",
  "Vacation/Leave",
  "Visia",
];

const BOOKING_STATUS_OPTIONS = [
  "Aucune sélection",
  "Vidéo conférence / appel",
  "Bon/Solde/Voucher",
  "CONTROLE INFOS PATIENT",
  "PAIEMENT PARTIEL",
  "FACTURATION TARMED",
  "PAYE",
  "FACTURE ENVOYEE",
  "CB",
  "Salle d'attente",
  "Chez le médecin/dans la salle de consult.",
  "Patient parti, hors du cabinet",
  "à faire",
  "fait",
  "Attention",
  "Annulé",
  "Téléphone",
  "N'est pas venu",
  "en retard",
  "à payer",
  "Urgent",
  "Déplacé",
  "MANQUE",
  "NUIT",
  "ESPECES",
];

function appointmentStatusToWorkflow(status: AppointmentStatus): WorkflowStatus {
  if (status === "confirmed") return "approved";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

function workflowToAppointmentStatus(status: WorkflowStatus): AppointmentStatus {
  if (status === "approved") return "confirmed";
  if (status === "cancelled") return "cancelled";
  return "scheduled";
}

function getNotesFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Notes:\s*(.+?)\s*]/);
  if (!match) return null;
  return match[1].trim() || null;
}

const STATUS_COLORS: Record<AppointmentStatus, string> = {
  scheduled: "bg-sky-100 text-sky-800 border-sky-200",
  confirmed: "bg-emerald-100 text-emerald-800 border-emerald-200",
  completed: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-rose-100 text-rose-800 border-rose-200",
  no_show: "bg-amber-100 text-amber-800 border-amber-200",
};

const STATUS_LABELS: Record<AppointmentStatus, string> = {
  scheduled: "Scheduled",
  confirmed: "Confirmed",
  completed: "Completed",
  cancelled: "Cancelled",
  no_show: "No Show",
};

function getServiceFromReason(reason: string | null): string {
  if (!reason) return "Appointment";
  const firstBracketIndex = reason.indexOf("[");
  const servicePart =
    firstBracketIndex === -1 ? reason : reason.slice(0, firstBracketIndex);
  return servicePart.trim() || "Appointment";
}

function getDoctorFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Doctor:\s*(.+?)\s*]/);
  if (!match) return null;
  return match[1].trim() || null;
}

function getCategoryFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Category:\s*(.+?)\s*]/);
  if (!match) return null;
  return match[1].trim() || null;
}

function getStatusFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Status:\s*(.+?)\s*]/);
  if (!match) return null;
  return match[1].trim() || null;
}

function formatDateTime(dateStr: string): { date: string; time: string } {
  return formatSwissAppointmentDateTime(dateStr);
}

function formatDuration(startTime: string, endTime: string | null): string {
  const start = new Date(startTime);
  if (!endTime) return "—";
  const end = new Date(endTime);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "—";
  const diffMs = end.getTime() - start.getTime();
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) return `${diffMins} min`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

export default function PatientRendezvousTab({
  patientId,
}: {
  patientId: string;
}) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<FilterMode>("future");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortField, setSortField] = useState<SortField>("start_time");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [statusFilter, setStatusFilter] = useState<AppointmentStatus | "all">("all");
  const [locationFilter, setLocationFilter] = useState<string>("all");
  
  // Edit modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [editWorkflowStatus, setEditWorkflowStatus] = useState<WorkflowStatus>("pending");
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editConsultationDuration, setEditConsultationDuration] = useState(15);
  const [editLocation, setEditLocation] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editBookingStatus, setEditBookingStatus] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      try {
        setLoading(true);
        setError(null);

        const { data, error: queryError } = await supabaseClient
          .from("appointments")
          .select(
            "id, patient_id, provider_id, start_time, end_time, status, reason, title, notes, location, provider:providers(id, name)"
          )
          .eq("patient_id", patientId)
          .order("start_time", { ascending: false });

        if (!isMounted) return;

        if (queryError || !data) {
          setError(queryError?.message ?? "Failed to load appointments.");
          setAppointments([]);
        } else {
          setAppointments(data as unknown as Appointment[]);
        }
        setLoading(false);
      } catch {
        if (!isMounted) return;
        setError("Failed to load appointments.");
        setAppointments([]);
        setLoading(false);
      }
    }

    void loadAppointments();

    return () => {
      isMounted = false;
    };
  }, [patientId]);

  const uniqueLocations = useMemo(() => {
    const locs = new Set<string>();
    appointments.forEach((appt) => {
      if (appt.location) locs.add(appt.location);
    });
    return Array.from(locs).sort();
  }, [appointments]);

  const filteredAndSortedAppointments = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    let filtered = appointments.filter((appt) => {
      // Filter by future/all
      if (filterMode === "future") {
        const startDate = new Date(appt.start_time);
        if (startDate < todayStart) return false;
      }

      // Filter by status
      if (statusFilter !== "all" && appt.status !== statusFilter) {
        return false;
      }

      // Filter by location
      if (locationFilter !== "all" && appt.location !== locationFilter) {
        return false;
      }

      // Search filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const service = getServiceFromReason(appt.reason).toLowerCase();
        const doctor = (getDoctorFromReason(appt.reason) ?? appt.provider?.name ?? "").toLowerCase();
        const category = (getCategoryFromReason(appt.reason) ?? "").toLowerCase();
        const location = (appt.location ?? "").toLowerCase();
        const status = (appt.status ?? "").toLowerCase();
        const bookingStatus = (getStatusFromReason(appt.reason) ?? "").toLowerCase();
        const { date, time } = formatDateTime(appt.start_time);

        const searchable = `${service} ${doctor} ${category} ${location} ${status} ${bookingStatus} ${date} ${time}`;
        if (!searchable.includes(query)) return false;
      }

      return true;
    });

    // Sort
    filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortField) {
        case "start_time":
          comparison = new Date(a.start_time).getTime() - new Date(b.start_time).getTime();
          break;
        case "status":
          comparison = (a.status ?? "").localeCompare(b.status ?? "");
          break;
        case "location":
          comparison = (a.location ?? "").localeCompare(b.location ?? "");
          break;
        case "provider":
          const provA = getDoctorFromReason(a.reason) ?? a.provider?.name ?? "";
          const provB = getDoctorFromReason(b.reason) ?? b.provider?.name ?? "";
          comparison = provA.localeCompare(provB);
          break;
      }

      return sortOrder === "asc" ? comparison : -comparison;
    });

    return filtered;
  }, [appointments, filterMode, searchQuery, sortField, sortOrder, statusFilter, locationFilter]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) {
      return (
        <svg className="h-3 w-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      );
    }
    return sortOrder === "asc" ? (
      <svg className="h-3 w-3 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="h-3 w-3 text-sky-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    );
  };

  function openEditModal(appt: Appointment) {
    setEditingAppointment(appt);
    setEditError(null);
    setSavingEdit(false);

    const workflow = appointmentStatusToWorkflow(appt.status);
    setEditWorkflowStatus(workflow);

    const start = new Date(appt.start_time);
    const end = appt.end_time ? new Date(appt.end_time) : null;

    if (!Number.isNaN(start.getTime())) {
      const year = start.getFullYear();
      const month = `${start.getMonth() + 1}`.padStart(2, "0");
      const day = `${start.getDate()}`.padStart(2, "0");
      const hours = `${start.getHours()}`.padStart(2, "0");
      const minutes = `${start.getMinutes()}`.padStart(2, "0");
      setEditDate(`${year}-${month}-${day}`);
      setEditTime(`${hours}:${minutes}`);
    } else {
      setEditDate("");
      setEditTime("");
    }

    let durationMinutes = 15;
    if (!Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
      const diffMinutes = Math.max((end.getTime() - start.getTime()) / (60 * 1000), 15);
      durationMinutes = diffMinutes >= 45 ? 45 : 15;
    }
    setEditConsultationDuration(durationMinutes);

    setEditLocation(appt.location ?? "");

    const categoryFromReason = getCategoryFromReason(appt.reason);
    setEditCategory(categoryFromReason ?? "");

    const statusFromReason = getStatusFromReason(appt.reason);
    setEditBookingStatus(statusFromReason ?? "");

    const notes = getNotesFromReason(appt.reason);
    setEditNotes(notes ?? "");

    setEditModalOpen(true);
  }

  async function handleSaveEditAppointment() {
    if (!editingAppointment || savingEdit) return;

    setEditError(null);

    if (!editDate || !editTime) {
      setEditError("Please select a date and time.");
      return;
    }

    const startLocal = new Date(`${editDate}T${editTime}:00`);
    if (Number.isNaN(startLocal.getTime())) {
      setEditError("Invalid date or time.");
      return;
    }

    const durationMinutes = editConsultationDuration || 15;
    const endLocal = new Date(startLocal.getTime() + durationMinutes * 60 * 1000);

    const startIso = startLocal.toISOString();
    const endIso = endLocal.toISOString();
    const nextStatus = workflowToAppointmentStatus(editWorkflowStatus);

    try {
      setSavingEdit(true);

      // Build updated reason string
      const existingReason = editingAppointment.reason ?? "";
      const service = getServiceFromReason(existingReason);
      const doctorName = getDoctorFromReason(existingReason);
      
      let updatedReason = service || "Appointment";
      if (doctorName) updatedReason += ` [Doctor: ${doctorName}]`;
      if (editCategory && editCategory !== "No selection") updatedReason += ` [Category: ${editCategory}]`;
      if (editNotes) updatedReason += ` [Notes: ${editNotes}]`;
      if (editBookingStatus && editBookingStatus !== "Aucune sélection") updatedReason += ` [Status: ${editBookingStatus}]`;

      const { data, error } = await supabaseClient
        .from("appointments")
        .update({
          status: nextStatus,
          start_time: startIso,
          end_time: endIso,
          location: editLocation || null,
          reason: updatedReason,
        })
        .eq("id", editingAppointment.id)
        .select(
          "id, patient_id, provider_id, start_time, end_time, status, reason, title, notes, location, provider:providers(id, name)"
        )
        .single();

      if (error || !data) {
        setEditError(error?.message ?? "Failed to update appointment.");
        setSavingEdit(false);
        return;
      }

      const updated = data as unknown as Appointment;

      setAppointments((prev) => {
        if (updated.status === "cancelled") {
          return prev.filter((appt) => appt.id !== updated.id);
        }
        return prev.map((appt) => (appt.id === updated.id ? updated : appt));
      });

      setSavingEdit(false);
      setEditModalOpen(false);
      setEditingAppointment(null);
    } catch {
      setEditError("Failed to update appointment.");
      setSavingEdit(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200/80 bg-white/90 p-4 text-sm shadow-[0_16px_40px_rgba(15,23,42,0.08)]">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-slate-900">Rendezvous</h3>
        
        {/* Filter Toggle */}
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-full border border-slate-200/80 bg-white/80 p-0.5 text-xs shadow-sm">
            <button
              type="button"
              onClick={() => setFilterMode("future")}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                filterMode === "future"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "bg-transparent text-slate-700 hover:bg-slate-100/80"
              }`}
            >
              Future Appointments
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("all")}
              className={`rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
                filterMode === "all"
                  ? "bg-sky-500 text-white shadow-sm"
                  : "bg-transparent text-slate-700 hover:bg-slate-100/80"
              }`}
            >
              All Appointments
            </button>
          </div>
        </div>
      </div>

      {/* Smart Filters Row */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
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
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by service, doctor, category, location, date..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Status Filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AppointmentStatus | "all")}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="all">All Status</option>
          <option value="scheduled">Scheduled</option>
          <option value="confirmed">Confirmed</option>
          <option value="completed">Completed</option>
          <option value="cancelled">Cancelled</option>
          <option value="no_show">No Show</option>
        </select>

        {/* Location Filter */}
        <select
          value={locationFilter}
          onChange={(e) => setLocationFilter(e.target.value)}
          className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 focus:border-sky-300 focus:outline-none focus:ring-2 focus:ring-sky-100"
        >
          <option value="all">All Locations</option>
          {uniqueLocations.map((loc) => (
            <option key={loc} value={loc}>
              {loc}
            </option>
          ))}
        </select>

        {/* Results count */}
        <span className="text-[11px] text-slate-500">
          {filteredAndSortedAppointments.length} appointment{filteredAndSortedAppointments.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-sky-500"></div>
          <span className="ml-2 text-xs text-slate-500">Loading appointments...</span>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700">
          {error}
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && filteredAndSortedAppointments.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <svg
            className="mb-3 h-12 w-12 text-slate-300"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={1.5}
              d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-sm font-medium text-slate-600">No appointments found</p>
          <p className="mt-1 text-xs text-slate-500">
            {filterMode === "future"
              ? "No upcoming appointments for this patient."
              : "This patient has no appointments yet."}
          </p>
        </div>
      )}

      {/* Appointments Table */}
      {!loading && !error && filteredAndSortedAppointments.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-100">
                <th className="pb-2 pr-4">
                  <button
                    type="button"
                    onClick={() => handleSort("start_time")}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Date & Time
                    <SortIcon field="start_time" />
                  </button>
                </th>
                <th className="pb-2 pr-4 font-semibold text-slate-600">Service</th>
                <th className="pb-2 pr-4">
                  <button
                    type="button"
                    onClick={() => handleSort("provider")}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Doctor
                    <SortIcon field="provider" />
                  </button>
                </th>
                <th className="pb-2 pr-4">
                  <button
                    type="button"
                    onClick={() => handleSort("location")}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Location
                    <SortIcon field="location" />
                  </button>
                </th>
                <th className="pb-2 pr-4 font-semibold text-slate-600">Duration</th>
                <th className="pb-2 pr-4">
                  <button
                    type="button"
                    onClick={() => handleSort("status")}
                    className="inline-flex items-center gap-1 font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Status
                    <SortIcon field="status" />
                  </button>
                </th>
                <th className="pb-2 pr-4 font-semibold text-slate-600">Category</th>
                <th className="pb-2 font-semibold text-slate-600">Booking Status</th>
                <th className="pb-2 font-semibold text-slate-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredAndSortedAppointments.map((appt) => {
                const { date, time } = formatDateTime(appt.start_time);
                const service = getServiceFromReason(appt.reason);
                const doctor = getDoctorFromReason(appt.reason) ?? appt.provider?.name ?? "—";
                const category = getCategoryFromReason(appt.reason) ?? "—";
                const bookingStatus = getStatusFromReason(appt.reason) ?? "—";
                const duration = formatDuration(appt.start_time, appt.end_time);
                const isPast = new Date(appt.start_time) < new Date();

                return (
                  <tr
                    key={appt.id}
                    className={`border-b border-slate-50 transition-colors hover:bg-slate-50/50 ${
                      isPast ? "opacity-70" : ""
                    }`}
                  >
                    <td className="py-3 pr-4">
                      <div className="font-medium text-slate-900">{date}</div>
                      <div className="text-slate-500">{time}</div>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="font-medium text-slate-900">{service}</span>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{doctor}</td>
                    <td className="py-3 pr-4">
                      {appt.location ? (
                        <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700">
                          {appt.location}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-slate-700">{duration}</td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                          STATUS_COLORS[appt.status] ?? "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {STATUS_LABELS[appt.status] ?? appt.status}
                      </span>
                    </td>
                    <td className="py-3 pr-4">
                      {category !== "—" ? (
                        <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-medium text-violet-700">
                          {category}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      {bookingStatus !== "—" ? (
                        <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                          {bookingStatus}
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-3">
                      <button
                        type="button"
                        onClick={() => openEditModal(appt)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        Edit
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit Appointment Modal */}
      {editModalOpen && editingAppointment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50"
          onClick={(e) => {
            if (e.target === e.currentTarget && !savingEdit) {
              setEditModalOpen(false);
            }
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between gap-2 mb-4">
              <h2 className="text-base font-semibold text-slate-900">Edit appointment</h2>
              <button
                type="button"
                onClick={() => !savingEdit && setEditModalOpen(false)}
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
              >
                <svg className="h-3 w-3" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 5l10 10" />
                  <path d="M15 5L5 15" />
                </svg>
              </button>
            </div>

            {/* Patient Info Card */}
            <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-[10px] font-medium text-slate-500 mb-1">Patient Information</p>
              <p className="text-xs text-slate-700">Current Patient</p>
            </div>

            {/* Appointment Details Card */}
            <div className="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-3">
              <p className="text-[10px] font-medium text-sky-600">Appointment Details</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-[10px] text-slate-500">Service</p>
                  <p className="text-xs font-medium text-slate-900">{getServiceFromReason(editingAppointment.reason)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500">Doctor</p>
                  <p className="text-xs font-medium text-slate-900">{getDoctorFromReason(editingAppointment.reason) ?? editingAppointment.provider?.name ?? "—"}</p>
                </div>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-1">Category</p>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">Search category...</option>
                  {APPOINTMENT_CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-1">Status/Channel</p>
                <select
                  value={editBookingStatus}
                  onChange={(e) => setEditBookingStatus(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                >
                  <option value="">Search status...</option>
                  {BOOKING_STATUS_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              </div>

              <div>
                <p className="text-[10px] text-slate-500 mb-1">Notes</p>
                <textarea
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none resize-none"
                  placeholder="Add notes..."
                />
              </div>
            </div>

            {/* Workflow Status */}
            <div className="mb-4">
              <p className="text-[10px] font-medium text-slate-500 mb-2">Workflow status</p>
              <div className="flex flex-wrap gap-2">
                {(["pending", "approved", "rescheduled", "cancelled"] as WorkflowStatus[]).map((ws) => (
                  <button
                    key={ws}
                    type="button"
                    onClick={() => setEditWorkflowStatus(ws)}
                    className={`px-3 py-1 rounded-full text-[10px] font-medium border transition-colors ${
                      editWorkflowStatus === ws
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {ws.charAt(0).toUpperCase() + ws.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Date & Time */}
            <div className="mb-4">
              <p className="text-[10px] font-medium text-slate-500 mb-2">Date & time</p>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="date"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
                <input
                  type="time"
                  value={editTime}
                  onChange={(e) => setEditTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
                />
              </div>
            </div>

            {/* Duration */}
            <div className="mb-4">
              <p className="text-[10px] font-medium text-slate-500 mb-2">Consultation duration</p>
              <select
                value={editConsultationDuration}
                onChange={(e) => setEditConsultationDuration(parseInt(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                {CONSULTATION_DURATION_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* Location */}
            <div className="mb-4">
              <p className="text-[10px] font-medium text-slate-500 mb-2">Location</p>
              <select
                value={editLocation}
                onChange={(e) => setEditLocation(e.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-500 focus:outline-none"
              >
                <option value="">Select location</option>
                {CLINIC_LOCATION_OPTIONS.map((loc) => (
                  <option key={loc} value={loc}>{loc}</option>
                ))}
              </select>
            </div>

            {editError && (
              <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700">
                {editError}
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => !savingEdit && setEditModalOpen(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleSaveEditAppointment}
                disabled={savingEdit}
                className="px-4 py-2 rounded-lg bg-sky-600 text-xs font-medium text-white hover:bg-sky-700 transition-colors disabled:opacity-50"
              >
                {savingEdit ? "Saving..." : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
