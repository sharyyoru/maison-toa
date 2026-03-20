"use client";

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import Link from "next/link";
import { supabaseClient } from "@/lib/supabaseClient";
import { getAppointmentNotes, getAppointmentTitle, getAppointmentDisplayName } from "@/lib/appointmentUtils";
import {
  formatSwissMonthYear,
  formatSwissYmd,
  formatSwissTime,
  formatSwissTimeRange,
  formatSwissDate,
  SWISS_TIMEZONE,
  SWISS_LOCALE,
  getSwissHourMinute,
} from "@/lib/swissTimezone";

type AppointmentStatus =
  | "scheduled"
  | "confirmed"
  | "completed"
  | "cancelled"
  | "no_show";

type WorkflowStatus = "pending" | "approved" | "rescheduled" | "cancelled";

function appointmentStatusToWorkflow(status: AppointmentStatus): WorkflowStatus {
  if (status === "confirmed") return "approved";
  if (status === "cancelled") return "cancelled";
  return "pending";
}

function workflowToAppointmentStatus(status: WorkflowStatus): AppointmentStatus {
  if (status === "approved") return "confirmed";
  if (status === "cancelled") return "cancelled";
  // Treat rescheduled as a scheduled (pending) appointment in the DB
  return "scheduled";
}

function getAppointmentStatusColorClasses(status: AppointmentStatus): string {
  switch (status) {
    case "confirmed":
      return "border border-emerald-400";
    case "cancelled":
      return "border border-rose-400";
    case "completed":
      return "border border-slate-300 opacity-70";
    default:
      return "border border-sky-100";
  }
}

type AppointmentPatient = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type AppointmentPatientSuggestion = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
};

type ServiceOption = {
  id: string;
  name: string;
};

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

const CATEGORY_COLORS: Record<string, string> = {
  // French names (from Axenita) - using lighter/opacity variants for readability
  "Aucune sélection": "bg-sky-100/80",
  "Mésothérapie": "bg-purple-300/70",
  "Mesotherapie": "bg-purple-300/70",
  "Dermomask": "bg-lime-300/70",
  "1ère consultation": "bg-yellow-200/70",
  "1ere consultation": "bg-yellow-200/70",
  "Administration": "bg-slate-300/70",
  "Cavitation": "bg-green-300/70",
  "CO2": "bg-pink-200/70",
  "Contrôle": "bg-teal-300/70",
  "Controle": "bg-teal-300/70",
  "Crème Emla": "bg-teal-200/70",
  "Creme Emla": "bg-teal-200/70",
  "Cryothérapie": "bg-purple-300/70",
  "Cryotherapie": "bg-purple-300/70",
  "Discussion": "bg-sky-200/70",
  "EMSCULPT": "bg-teal-300/70",
  "Épilation laser Cutera": "bg-slate-300/70",
  "Epilation laser Cutera": "bg-slate-300/70",
  "Epilation laser Gentel": "bg-green-300/70",
  "Épilation éléctrique": "bg-indigo-300/70",
  "Epilation electrique": "bg-indigo-300/70",
  "Epilation éléctrique": "bg-indigo-300/70",
  "HIFU": "bg-pink-200/70",
  "Injection (botox; Acide hyaluronic)": "bg-sky-200/70",
  "Injection (botox; Aci": "bg-sky-200/70",
  "Important": "bg-red-300/70",
  "IPL": "bg-purple-200/70",
  "Meso Anti-age": "bg-amber-300/70",
  "Meso Anti-cellulite": "bg-amber-300/70",
  "Meso Anti-tache": "bg-amber-300/70",
  "Microdermabrasion": "bg-blue-300/70",
  "MORPHEUS8": "bg-amber-400/70",
  "Radio-fréquence": "bg-lime-200/70",
  "Radio-frequence": "bg-lime-200/70",
  "Radio frequency": "bg-lime-200/70",
  "Réunion": "bg-pink-200/70",
  "Reunion": "bg-pink-200/70",
  "OP Chirurgie": "bg-green-300/70",
  "Pauses/Changement de salle/lieu": "bg-purple-300/70",
  "Pauses/Changeme": "bg-purple-300/70",
  "PRP": "bg-orange-300/70",
  "Tatoo removal": "bg-amber-300/70",
  "TCA": "bg-purple-200/70",
  "Traitement": "bg-purple-200/70",
  "Traitement caviar": "bg-indigo-200/70",
  "Vacances/Congés": "bg-lime-200/70",
  "Vacances/Conges": "bg-lime-200/70",
  "Visia": "bg-yellow-200/70",
  // English fallbacks
  "No selection": "bg-sky-100/80",
  "Mesotherapy": "bg-purple-300/70",
  "Control": "bg-teal-300/70",
  "Emla Cream": "bg-teal-200/70",
  "Cryotherapy": "bg-purple-300/70",
  "Cutera laser hair removal": "bg-slate-300/70",
  "Electrolysis hair removal": "bg-indigo-300/70",
  "Meeting": "bg-pink-200/70",
  "OP Surgery": "bg-green-300/70",
  "Breaks/Change of Location": "bg-purple-300/70",
  "Treatment": "bg-purple-200/70",
  "Caviar treatment": "bg-indigo-200/70",
  "Vacation/Leave": "bg-lime-200/70",
};

const STATUS_ICONS: Record<string, string> = {
  "Aucune sélection": "",
  "Vidéo conférence / appel": "📹",
  "Bon/Solde/Voucher": "🅱️",
  "CONTROLE INFOS PATIENT": "📋",
  "PAIEMENT PARTIEL": "💳",
  "FACTURATION TARMED": "🇹",
  "PAYE": "✓",
  "FACTURE ENVOYEE": "📧",
  "CB": "💳",
  "Salle d'attente": "🪑",
  "Chez le médecin/dans la salle de consult.": "🩺",
  "Patient parti, hors du cabinet": "🚶",
  "à faire": "☐",
  "fait": "☑",
  "Attention": "⚠️",
  "Annulé": "✗",
  "Téléphone": "📞",
  "N'est pas venu": "∅",
  "en retard": "⏱️",
  "à payer": "💰",
  "Urgent": "🔥",
  "Déplacé": "↔️",
  "MANQUE": "📖",
  "NUIT": "🌙",
  "ESPECES": "💵",
};

function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove accents
    .trim();
}

function getCategoryColor(category: string | null): string {
  if (!category) return "bg-slate-100";
  
  // Direct match first
  if (CATEGORY_COLORS[category]) {
    return CATEGORY_COLORS[category];
  }
  
  // Normalized match (case-insensitive, accent-insensitive)
  const normalizedCategory = normalizeString(category);
  for (const [key, value] of Object.entries(CATEGORY_COLORS)) {
    if (normalizeString(key) === normalizedCategory) {
      return value;
    }
  }
  
  // Partial match (for truncated category names)
  for (const [key, value] of Object.entries(CATEGORY_COLORS)) {
    const normalizedKey = normalizeString(key);
    if (normalizedKey.startsWith(normalizedCategory) || normalizedCategory.startsWith(normalizedKey)) {
      return value;
    }
  }
  
  return "bg-slate-100";
}

function getStatusIcon(status: string | null): string {
  if (!status) return "";
  return STATUS_ICONS[status] ?? "";
}

const CLINIC_LOCATION_OPTIONS = ["Rhône", "Champel", "Gstaad", "Montreux"];

const CONSULTATION_DURATION_OPTIONS = [
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 45, label: "45 minutes" },
  { value: 60, label: "1 hour" },
  { value: 90, label: "1.5 hours" },
  { value: 120, label: "2 hours" },
  { value: 150, label: "2.5 hours" },
  { value: 180, label: "3 hours" },
  { value: 210, label: "3.5 hours" },
  { value: 240, label: "4 hours" },
  { value: 300, label: "5 hours" },
  { value: 360, label: "6 hours" },
  { value: 420, label: "7 hours" },
  { value: 480, label: "8 hours" },
  { value: 540, label: "9 hours" },
  { value: 600, label: "10 hours" },
  { value: 660, label: "11 hours" },
  { value: 720, label: "12 hours" },
  { value: 780, label: "13 hours" },
  { value: 840, label: "14 hours" },
  { value: 900, label: "15 hours" },
  { value: 960, label: "16 hours" },
  { value: 1020, label: "17 hours" },
  { value: 1080, label: "18 hours" },
  { value: 1140, label: "19 hours" },
  { value: 1200, label: "20 hours" },
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

type CalendarAppointment = {
  id: string;
  patient_id: string;
  provider_id: string | null;
  start_time: string;
  end_time: string | null;
  status: AppointmentStatus;
  reason: string | null;
  location: string | null;
  temporary_text: string | null;
  patient: AppointmentPatient | null;
  provider: {
    id: string;
    name: string | null;
  } | null;
};

type CalendarView = "month" | "day" | "range";

const DAY_VIEW_START_MINUTES = 6 * 60;
const DAY_VIEW_END_MINUTES = 20 * 60; // 8 PM
const DAY_VIEW_SLOT_MINUTES = 15;
const DAY_VIEW_SLOT_HEIGHT = 28;

// Priority doctors to show first in the list
const PRIORITY_DOCTOR_NAMES = [
  "xavier tenorio",
  "cesar rodrigues",
  "cezar rodrigues",
  "yulia raspertova",
  "burbuqe fazliu",
  "laser",
  "monia khedir",
  "lily radionova",
];

type ProviderOption = {
  id: string;
  name: string | null;
};

type DoctorSchedulingConfig = {
  provider_id: string;
  time_interval_minutes: number;
  default_duration_minutes: number;
};

type DoctorCalendar = {
  id: string;
  providerId: string;
  name: string;
  color: string;
  selected: boolean;
};

const CALENDAR_COLOR_CLASSES = [
  "bg-slate-400",
];

function getCalendarColorForIndex(index: number): string {
  return "bg-slate-400";
}

function formatMonthYear(date: Date) {
  return formatSwissMonthYear(date);
}

function formatYmd(date: Date) {
  return formatSwissYmd(date);
}

function formatTimeRangeLabel(start: Date, end: Date | null): string {
  return formatSwissTimeRange(start, end, DAY_VIEW_SLOT_MINUTES);
}

function getServiceAndStatusFromReason(reason: string | null): {
  serviceLabel: string;
  statusLabel: string | null;
} {
  let serviceLabel = "Appointment";
  let statusLabel: string | null = null;

  if (!reason) {
    return { serviceLabel, statusLabel };
  }

  const firstBracketIndex = reason.indexOf("[");
  const servicePart =
    firstBracketIndex === -1 ? reason : reason.slice(0, firstBracketIndex);
  if (servicePart.trim()) {
    serviceLabel = servicePart.trim();
  }

  const statusMatch = reason.match(/\[Status:\s*(.+?)\s*]/);
  if (statusMatch) {
    const rawStatus = statusMatch[1].trim();
    if (rawStatus) statusLabel = rawStatus;
  }

  return { serviceLabel, statusLabel };
}

function getDoctorNameFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Doctor:\s*(.+?)\s*]/);
  if (!match) return null;
  const raw = match[1].trim();
  return raw || null;
}

function getCategoryFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Category:\s*(.+?)\s*]/);
  if (!match) return null;
  const raw = match[1].trim();
  return raw || null;
}

function getNotesFromReason(reason: string | null): string | null {
  if (!reason) return null;
  const match = reason.match(/\[Notes:\s*(.+?)\s*]/);
  if (!match) return null;
  const raw = match[1].trim();
  return raw || null;
}

type AppointmentOverlapInfo = {
  id: string;
  columnIndex: number;
  totalColumns: number;
};

function calculateOverlapPositions(
  appointments: { id: string; start_time: string; end_time: string | null }[]
): Map<string, AppointmentOverlapInfo> {
  const result = new Map<string, AppointmentOverlapInfo>();
  
  if (appointments.length === 0) return result;

  const parsed = appointments.map((appt) => {
    const start = new Date(appt.start_time);
    const end = appt.end_time ? new Date(appt.end_time) : new Date(start.getTime() + 30 * 60 * 1000);
    
    // Use Swiss timezone for consistent display regardless of user's browser location
    const { hour: startH, minute: startM } = getSwissHourMinute(start);
    const { hour: endH, minute: endM } = getSwissHourMinute(end);
    let startMinutes = startH * 60 + startM;
    let endMinutes = endH * 60 + endM;
    
    // Handle appointments spanning midnight or with invalid end times
    if (endMinutes <= startMinutes) {
      endMinutes = DAY_VIEW_END_MINUTES;
    }
    
    // Clamp to day view bounds
    startMinutes = Math.max(startMinutes, DAY_VIEW_START_MINUTES);
    endMinutes = Math.min(endMinutes, DAY_VIEW_END_MINUTES);
    
    // Ensure minimum duration for overlap detection
    if (endMinutes <= startMinutes) {
      endMinutes = startMinutes + DAY_VIEW_SLOT_MINUTES;
    }
    
    return {
      id: appt.id,
      startMinutes,
      endMinutes,
    };
  }).sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);

  // Helper to check if two appointments overlap
  const overlaps = (a: typeof parsed[0], b: typeof parsed[0]) => {
    return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
  };

  // Group overlapping appointments together
  const groups: (typeof parsed[0])[][] = [];
  
  for (const appt of parsed) {
    let addedToGroup = false;
    
    for (const group of groups) {
      // Check if this appointment overlaps with any appointment in the group
      const overlapsWithGroup = group.some((member) => overlaps(appt, member));
      if (overlapsWithGroup) {
        group.push(appt);
        addedToGroup = true;
        break;
      }
    }
    
    if (!addedToGroup) {
      groups.push([appt]);
    }
  }

  // Merge groups that overlap (in case an appointment bridges two groups)
  let merged = true;
  while (merged) {
    merged = false;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        const groupOverlaps = groups[i].some((a) => 
          groups[j].some((b) => overlaps(a, b))
        );
        if (groupOverlaps) {
          groups[i] = [...groups[i], ...groups[j]];
          groups.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  // Assign column positions within each group
  for (const group of groups) {
    // Sort group by start time
    group.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
    
    const columns: { endMinutes: number; ids: string[] }[] = [];
    
    for (const appt of group) {
      let placed = false;
      for (let col = 0; col < columns.length; col++) {
        if (columns[col].endMinutes <= appt.startMinutes) {
          columns[col].endMinutes = appt.endMinutes;
          columns[col].ids.push(appt.id);
          result.set(appt.id, { id: appt.id, columnIndex: col, totalColumns: 0 });
          placed = true;
          break;
        }
      }
      if (!placed) {
        result.set(appt.id, { id: appt.id, columnIndex: columns.length, totalColumns: 0 });
        columns.push({ endMinutes: appt.endMinutes, ids: [appt.id] });
      }
    }
    
    // Set totalColumns for this group
    const totalCols = columns.length;
    for (const appt of group) {
      const info = result.get(appt.id);
      if (info) {
        info.totalColumns = totalCols;
      }
    }
  }

  return result;
}

async function sendAppointmentConfirmationEmail(
  appointment: CalendarAppointment,
): Promise<void> {
  const patientEmail = appointment.patient?.email ?? null;
  if (!patientEmail) return;

  try {
    const { data: authData } = await supabaseClient.auth.getUser();
    const authUser = authData?.user ?? null;
    const fromAddress = authUser?.email ?? null;

    const start = new Date(appointment.start_time);
    const end = appointment.end_time ? new Date(appointment.end_time) : null;

    const dateLabel = formatSwissDate(start);
    const timeLabel = formatTimeRangeLabel(start, end);
    const dateTimeLabel = `${dateLabel} ${timeLabel}`;

    const patientName = `${appointment.patient?.first_name ?? ""} ${appointment
      .patient?.last_name ?? ""}`
      .trim()
      .replace(/\s+/g, " ");

    const doctorName =
      getDoctorNameFromReason(appointment.reason) ??
      appointment.provider?.name ??
      "your doctor";

    const location = appointment.location ?? "the clinic";

    const { serviceLabel } = getServiceAndStatusFromReason(appointment.reason);

    const preConsultationUrl = "https://aestheticclinic.vercel.app/intake";

    const subject = `Appointment confirmation - ${dateLabel} ${timeLabel}`;

    const htmlBody = `
      <p>Dear ${patientName || "patient"},</p>
      <p>Your appointment has been booked with ${doctorName}.</p>
      <p>
        <strong>Date:</strong> ${dateLabel}<br />
        <strong>Time:</strong> ${timeLabel}<br />
        <strong>Location:</strong> ${location}
      </p>
      <p>
        If you need to reschedule or cancel, please contact the clinic or reply to this email.
      </p>
      <p>
        <strong>Complete Your Pre-Consultation Form</strong><br />
        <a href="${preConsultationUrl}">Pre Consultation Link</a>
      </p>
      <p>
        <strong>Aesthetics Clinic</strong><br />
        <strong>GENEVE</strong><br />
        Chemin Rieu 18,1208, Switzerland<br />
        Rue du Rhône 17, 1204 <br />
        📞 0227322223 ✉️ info@aesthetics-ge.ch<br /><br />
        <strong>GSTAAD</strong><br />
        Gsteigstrasse 70, 3780, Switzerland<br />
        📞 +41 337 483 437 ✉️ info@aesthetics-ge.ch<br /><br />
        <strong>MONTREUX</strong><br />
        Av Calud Nobs 2, 1820, Switzerland<br />
        📞 +41 21 991 98 98 ✉️ info@thebeautybooth.shop
      </p>
    `;

    const nowIso = new Date().toISOString();

    const { data, error } = await supabaseClient
      .from("emails")
      .insert({
        patient_id: appointment.patient_id,
        deal_id: null,
        to_address: patientEmail,
        from_address: fromAddress,
        subject,
        body: htmlBody,
        direction: "outbound",
        status: "sent",
        sent_at: nowIso,
      })
      .select("id")
      .single();

    if (error || !data) {
      console.error("Failed to insert appointment confirmation email", error);
      return;
    }

    try {
      await fetch("/api/emails/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: patientEmail,
          subject,
          html: htmlBody,
          fromUserEmail: fromAddress,
          emailId: (data as any).id as string,
        }),
      });
    } catch (error) {
      console.error(
        "Appointment confirmation email saved but failed to send via provider",
        error,
      );
    }

    const patientPhone = appointment.patient?.phone ?? null;
    if (patientPhone && patientPhone.trim().length > 0) {
      const whatsappText = `Appointment confirmation on ${dateTimeLabel} for ${serviceLabel} with ${doctorName} at ${location}`;

      try {
        await fetch("/api/whatsapp/queue", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            toPhone: patientPhone,
            messageBody: whatsappText,
            patientId: appointment.patient_id,
          }),
        });
      } catch (error) {
        console.error("Failed to enqueue WhatsApp appointment notification", error);
      }
    }
  } catch (error) {
    console.error("Failed to prepare appointment confirmation email", error);
  }
}

export default function CalendarPage() {
  const [visibleMonth, setVisibleMonth] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [appointments, setAppointments] = useState<CalendarAppointment[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const [providers, setProviders] = useState<ProviderOption[]>([]);
  const [providersLoading, setProvidersLoading] = useState(false);
  const [providersError, setProvidersError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [isSystemUser, setIsSystemUser] = useState(false);
  const [doctorCalendars, setDoctorCalendars] = useState<DoctorCalendar[]>([]);
  const [doctorSchedulingSettings, setDoctorSchedulingSettings] = useState<DoctorSchedulingConfig[]>([]);
  const [showAllDoctors, setShowAllDoctors] = useState(false);
  const [activeDoctorTabId, setActiveDoctorTabId] = useState<string | null>(null);
  const [isCreatingCalendar, setIsCreatingCalendar] = useState(false);
  const [newCalendarProviderId, setNewCalendarProviderId] = useState("");
  const [view, setView] = useState<CalendarView>("day");
  const [viewMenuOpen, setViewMenuOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | null>(new Date());
  const [rangeEndDate, setRangeEndDate] = useState<Date | null>(null);
  const [isDraggingRange, setIsDraggingRange] = useState(false);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  
  // Drag-to-create appointment state
  const [isDraggingCreate, setIsDraggingCreate] = useState(false);
  const [dragStartMinutes, setDragStartMinutes] = useState<number | null>(null);
  const [dragEndMinutes, setDragEndMinutes] = useState<number | null>(null);
  const [dragDate, setDragDate] = useState<Date | null>(null);
  const [dragDoctorCalendarId, setDragDoctorCalendarId] = useState<string | null>(null);
  
  // Refs for touch event handling on iPad/tablets
  const dayViewContainerRef = useRef<HTMLDivElement>(null);
  const touchDragInfoRef = useRef<{
    date: Date;
    doctorCalendarId: string | null;
    containerTop: number;
    slotHeight: number;
    startMinutesOffset: number;
  } | null>(null);
  
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [draftDate, setDraftDate] = useState("");
  const [draftTime, setDraftTime] = useState("");
  const [draftLocation, setDraftLocation] = useState("");
  const [draftDescription, setDraftDescription] = useState("");
  const [savingCreate, setSavingCreate] = useState(false);
  const [createPatientSearch, setCreatePatientSearch] = useState("");
  const [showCreatePatientSuggestions, setShowCreatePatientSuggestions] =
    useState(false);
  const [createPatientId, setCreatePatientId] = useState<string | null>(null);
  const [createPatientName, setCreatePatientName] = useState("");
  const [consultationDuration, setConsultationDuration] = useState(15);
  const [patientOptions, setPatientOptions] = useState<
    AppointmentPatientSuggestion[]
  >([]);
  const [patientOptionsLoading, setPatientOptionsLoading] = useState(false);
  const [patientOptionsError, setPatientOptionsError] = useState<string | null>(
    null,
  );
  const [newPatientModalOpen, setNewPatientModalOpen] = useState(false);
  const [newPatientFirstName, setNewPatientFirstName] = useState("");
  const [newPatientLastName, setNewPatientLastName] = useState("");
  const [newPatientEmail, setNewPatientEmail] = useState("");
  const [newPatientPhone, setNewPatientPhone] = useState("");
  const [newPatientGender, setNewPatientGender] = useState("");
  const [newPatientSource, setNewPatientSource] = useState("manual");
  const [savingNewPatient, setSavingNewPatient] = useState(false);
  const [newPatientError, setNewPatientError] = useState<string | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [serviceOptions, setServiceOptions] = useState<ServiceOption[]>([]);
  const [serviceOptionsLoading, setServiceOptionsLoading] = useState(false);
  const [serviceOptionsError, setServiceOptionsError] = useState<string | null>(
    null,
  );
  const [selectedServiceId, setSelectedServiceId] = useState("");
  const [serviceSearch, setServiceSearch] = useState("");
  const [serviceDropdownOpen, setServiceDropdownOpen] = useState(false);
  const [bookingStatus, setBookingStatus] = useState("");
  const [statusSearch, setStatusSearch] = useState("");
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [appointmentCategory, setAppointmentCategory] = useState("");
  const [categorySearch, setCategorySearch] = useState("");
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState("");
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const [durationSearch, setDurationSearch] = useState("");
  const [durationDropdownOpen, setDurationDropdownOpen] = useState(false);
  const [timeSearch, setTimeSearch] = useState("");
  const [timeDropdownOpen, setTimeDropdownOpen] = useState(false);
  const [createDoctorCalendarId, setCreateDoctorCalendarId] = useState("");

  const closeAllCreateDropdowns = (except?: string) => {
    if (except !== "patient") setShowCreatePatientSuggestions(false);
    if (except !== "service") setServiceDropdownOpen(false);
    if (except !== "status") setStatusDropdownOpen(false);
    if (except !== "category") setCategoryDropdownOpen(false);
    if (except !== "location") setLocationDropdownOpen(false);
    if (except !== "duration") setDurationDropdownOpen(false);
    if (except !== "time") setTimeDropdownOpen(false);
  };
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] =
    useState<CalendarAppointment | null>(null);
  const [editWorkflowStatus, setEditWorkflowStatus] =
    useState<WorkflowStatus>("pending");
  const [copiedAppointment, setCopiedAppointment] = useState<CalendarAppointment | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editConsultationDuration, setEditConsultationDuration] = useState(15);
  const [editDurationSearch, setEditDurationSearch] = useState("");
  const [editDurationDropdownOpen, setEditDurationDropdownOpen] = useState(false);
  const [editBookingStatus, setEditBookingStatus] = useState("");
  const [editBookingStatusSearch, setEditBookingStatusSearch] = useState("");
  const [editBookingStatusDropdownOpen, setEditBookingStatusDropdownOpen] = useState(false);
  const [editCategory, setEditCategory] = useState("");
  const [editCategorySearch, setEditCategorySearch] = useState("");
  const [editCategoryDropdownOpen, setEditCategoryDropdownOpen] = useState(false);
  const [editLocation, setEditLocation] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingAppointment, setDeletingAppointment] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Helper to close all edit modal dropdowns
  const closeEditModalDropdowns = () => {
    setEditCategoryDropdownOpen(false);
    setEditBookingStatusDropdownOpen(false);
  };

  // Helper to close edit modal and reset state
  const closeEditModal = () => {
    if (savingEdit || deletingAppointment) return;
    setEditModalOpen(false);
    setEditingAppointment(null);
    setShowDeleteConfirm(false);
    closeEditModalDropdowns();
  };

  const monthStart = useMemo(() => {
    return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth(), 1);
  }, [visibleMonth]);

  const monthEnd = useMemo(() => {
    return new Date(visibleMonth.getFullYear(), visibleMonth.getMonth() + 1, 0, 23, 59, 59, 999);
  }, [visibleMonth]);

  useEffect(() => {
    let isMounted = true;

    async function loadAppointments() {
      try {
        setLoading(true);
        setError(null);

        const fromIso = monthStart.toISOString();
        const toIso = monthEnd.toISOString();

        const { data, error } = await supabaseClient
          .from("appointments")
          .select(
            "id, patient_id, provider_id, start_time, end_time, status, reason, title, notes, location, temporary_text, patient:patients(id, first_name, last_name, email, phone), provider:providers(id, name)",
          )
          .neq("status", "cancelled")
          .gte("start_time", fromIso)
          .lte("start_time", toIso)
          .order("start_time", { ascending: true });

        if (!isMounted) return;

        if (error || !data) {
          setError(error?.message ?? "Failed to load appointments.");
          setAppointments([]);
          setLoading(false);
          return;
        }

        setAppointments(data as unknown as CalendarAppointment[]);
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
  }, [monthStart, monthEnd]);

  useEffect(() => {
    let isMounted = true;

    async function loadCurrentUser() {
      try {
        const { data, error } = await supabaseClient.auth.getUser();
        if (!isMounted) return;
        if (!error && data?.user) {
          setCurrentUserId(data.user.id);
          // Check if user is a system user (has access to users table)
          const { data: userData } = await supabaseClient
            .from("users")
            .select("id")
            .eq("id", data.user.id)
            .single();
          setIsSystemUser(!!userData);
        } else {
          setCurrentUserId(null);
          setIsSystemUser(false);
        }
      } catch {
        if (!isMounted) return;
        setCurrentUserId(null);
        setIsSystemUser(false);
      }
    }

    void loadCurrentUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadProviders() {
      try {
        setProvidersLoading(true);
        setProvidersError(null);

        // Load from users table (has all doctors)
        const { data, error } = await supabaseClient
          .from("users")
          .select("id, full_name, email")
          .order("full_name", { ascending: true });

        if (!isMounted) return;

        if (error || !data) {
          setProviders([]);
          setProvidersError(error?.message ?? "Failed to load users.");
        } else {
          setProviders(
            (data as any[]).map((row) => {
              const fullName = (row.full_name as string | null) ?? null;
              const email = (row.email as string | null) ?? null;
              const rawName = fullName && fullName.trim().length > 0 ? fullName : email;
              const name = rawName && rawName.trim().length > 0 ? rawName : null;
              return {
                id: row.id as string,
                name,
              };
            }),
          );
        }

        setProvidersLoading(false);
      } catch {
        if (!isMounted) return;
        setProviders([]);
        setProvidersError("Failed to load users.");
        setProvidersLoading(false);
      }
    }

    void loadProviders();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update current time every minute for the time indicator
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 60000); // Update every minute
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (providers.length === 0) return;

    setDoctorCalendars((prev) => {
      if (prev.length > 0) return prev;

      // Normalize name for deduplication - remove prefixes, normalize spelling
      function normalizeName(name: string): string {
        return name
          .toLowerCase()
          .replace(/^(mme|mr|mrs|ms|dr|prof)\.?\s*/i, "") // Remove common prefixes
          .replace(/[éèêë]/g, "e")
          .replace(/[àâä]/g, "a")
          .replace(/[ùûü]/g, "u")
          .replace(/[îï]/g, "i")
          .replace(/[ôö]/g, "o")
          .replace(/[ç]/g, "c")
          .replace(/z/g, "s") // Cesar/Cezar normalization
          .replace(/\s+/g, " ")
          .trim();
      }

      // Load saved calendar selections from localStorage
      let savedSelectedIds: string[] | null = null;
      try {
        const saved = localStorage.getItem("appointments_selected_calendars");
        if (saved) {
          savedSelectedIds = JSON.parse(saved) as string[];
        }
      } catch {}

      // Deduplicate providers by normalized name
      const seenNormalizedNames = new Map<string, typeof providers[0]>();
      const uniqueProviders = providers.filter((provider) => {
        const rawName = provider.name ?? "Unnamed doctor";
        const normalized = normalizeName(rawName);
        
        if (seenNormalizedNames.has(normalized)) {
          return false; // Skip duplicate
        }
        seenNormalizedNames.set(normalized, provider);
        return true;
      });

      const baseCalendars: DoctorCalendar[] = uniqueProviders.map((provider, index) => {
        const rawName = provider.name ?? "Unnamed doctor";
        const trimmedName = rawName.trim() || "Unnamed doctor";

        // Use saved selection if available, otherwise fall back to default logic
        let selected: boolean;
        if (savedSelectedIds !== null) {
          selected = savedSelectedIds.includes(provider.id);
        } else if (currentUserId) {
          selected = provider.id === currentUserId;
        } else {
          selected = true;
        }

        return {
          id: provider.id,
          providerId: provider.id,
          name: trimmedName,
          color: getCalendarColorForIndex(index),
          selected,
        };
      });

      // Only apply fallback logic if no saved selections exist
      if (savedSelectedIds === null && currentUserId) {
        const anySelected = baseCalendars.some((calendar) => calendar.selected);
        if (!anySelected && baseCalendars.length > 0) {
          baseCalendars[0] = {
            ...baseCalendars[0],
            selected: true,
          };
        }
      }

      const xavierIndex = baseCalendars.findIndex((calendar) => {
        const value = calendar.name.toLowerCase();
        return value.includes("xavier") && value.includes("tenorio");
      });

      if (xavierIndex > 0) {
        const [xavier] = baseCalendars.splice(xavierIndex, 1);
        baseCalendars.unshift(xavier);
      }

      return baseCalendars;
    });
  }, [providers, currentUserId]);

  useEffect(() => {
    let isMounted = true;

    async function loadServices() {
      try {
        setServiceOptionsLoading(true);
        setServiceOptionsError(null);

        const { data, error } = await supabaseClient
          .from("services")
          .select("id, name, is_active")
          .eq("is_active", true)
          .order("name", { ascending: true });

        if (!isMounted) return;

        if (error || !data) {
          setServiceOptions([]);
          setServiceOptionsError(error?.message ?? "Failed to load services.");
        } else {
          setServiceOptions(
            (data as any[]).map((row) => ({
              id: row.id as string,
              name: (row.name as string) ?? "Unnamed service",
            })),
          );
        }

        setServiceOptionsLoading(false);
      } catch {
        if (!isMounted) return;
        setServiceOptions([]);
        setServiceOptionsError("Failed to load services.");
        setServiceOptionsLoading(false);
      }
    }

    void loadServices();

    return () => {
      isMounted = false;
    };
  }, []);

  // Load per-doctor scheduling settings
  useEffect(() => {
    let isMounted = true;
    async function loadSchedulingSettings() {
      try {
        const res = await fetch("/api/settings/doctor-scheduling");
        if (!isMounted) return;
        if (res.ok) {
          const data = await res.json();
          setDoctorSchedulingSettings(
            (data.settings || []).map((s: any) => ({
              provider_id: s.provider_id,
              time_interval_minutes: s.time_interval_minutes,
              default_duration_minutes: s.default_duration_minutes,
            }))
          );
        }
      } catch {
        if (!isMounted) return;
      }
    }
    void loadSchedulingSettings();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadPatientsForCreate() {
      try {
        setPatientOptionsLoading(true);
        setPatientOptionsError(null);

        const { data, error } = await supabaseClient
          .from("patients")
          .select("id, first_name, last_name, email, phone")
          .order("created_at", { ascending: false });

        if (!isMounted) return;

        if (error || !data) {
          setPatientOptions([]);
          setPatientOptionsError(error?.message ?? "Failed to load patients.");
        } else {
          setPatientOptions(data as AppointmentPatientSuggestion[]);
        }

        setPatientOptionsLoading(false);
      } catch {
        if (!isMounted) return;
        setPatientOptions([]);
        setPatientOptionsError("Failed to load patients.");
        setPatientOptionsLoading(false);
      }
    }

    void loadPatientsForCreate();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    if (!isDraggingRange) return;

    function handleMouseUp() {
      setIsDraggingRange(false);
    }

    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDraggingRange]);

  const appointmentsByDay = useMemo(() => {
    const map: Record<string, CalendarAppointment[]> = {};

    const search = patientSearch.trim().toLowerCase();
    const selectedCalendars = doctorCalendars.filter((calendar) => calendar.selected);
    const selectedProviderIds = selectedCalendars.map((c) => c.providerId).filter(Boolean);
    const selectedDoctorNames = selectedCalendars
      .map((calendar) => calendar.name.trim().toLowerCase())
      .filter((value) => value.length > 0);
    const hasAnyCalendars = doctorCalendars.length > 0;

    // Get active tab info if a specific doctor tab is selected
    const activeTabCalendar = activeDoctorTabId
      ? selectedCalendars.find((c) => c.id === activeDoctorTabId)
      : null;
    const activeTabProviderId = activeTabCalendar?.providerId ?? null;
    const activeTabDoctorName = activeTabCalendar?.name.trim().toLowerCase() ?? null;

    appointments.forEach((appt) => {
      if (hasAnyCalendars && selectedCalendars.length > 0) {
        const doctorFromReason = getDoctorNameFromReason(appt.reason);
        const providerName = (appt.provider?.name ?? "").trim().toLowerCase();
        const reasonLower = (appt.reason ?? "").toLowerCase();
        const doctorKey = (doctorFromReason ?? providerName).trim().toLowerCase();
        
        // Match by provider_id first (most reliable)
        const matchesByProviderId = appt.provider_id && selectedProviderIds.includes(appt.provider_id);
        
        // Match by doctor key (from [Doctor:] tag or provider.name)
        const matchesByDoctorKey = doctorKey && selectedDoctorNames.some((selectedName) => 
          doctorKey.includes(selectedName) || selectedName.includes(doctorKey)
        );
        
        // Also search the entire reason field for doctor name mentions
        const matchesByReasonText = selectedDoctorNames.some((selectedName) => {
          const nameParts = selectedName.split(/\s+/);
          return nameParts.some((part) => part.length > 2 && reasonLower.includes(part));
        });
        
        // Skip only if no match found by any method
        if (!matchesByProviderId && !matchesByDoctorKey && !matchesByReasonText) return;

        // Filter by active doctor tab if one is selected
        if (activeTabCalendar) {
          const matchesActiveTabById = appt.provider_id && appt.provider_id === activeTabProviderId;
          const matchesActiveTabByName = activeTabDoctorName && doctorKey && 
            (doctorKey.includes(activeTabDoctorName) || activeTabDoctorName.includes(doctorKey));
          const activeTabParts = (activeTabDoctorName ?? "").split(/\s+/);
          const matchesActiveTabByReason = activeTabParts.some((part) => part.length > 2 && reasonLower.includes(part));
          if (!matchesActiveTabById && !matchesActiveTabByName && !matchesActiveTabByReason) return;
        }
      }

      const startDate = appt.start_time ? new Date(appt.start_time) : null;
      const key = startDate && !Number.isNaN(startDate.getTime()) ? formatYmd(startDate) : null;
      if (!key) return;

      if (search) {
        const p = appt.patient;
        const name = `${p?.first_name ?? ""} ${p?.last_name ?? ""}`
          .trim()
          .toLowerCase();
        if (!name.includes(search)) return;
      }

      if (!map[key]) map[key] = [];
      map[key].push(appt);
    });

    return map;
  }, [appointments, patientSearch, doctorCalendars, activeDoctorTabId]);

  const gridDates = useMemo(() => {
    const dates: Date[] = [];
    const firstDayOfWeek = 1; // Monday
    const firstOfMonth = new Date(
      visibleMonth.getFullYear(),
      visibleMonth.getMonth(),
      1,
    );
    const startWeekday = firstOfMonth.getDay();
    const diff = (startWeekday - firstDayOfWeek + 7) % 7;
    const gridStart = new Date(
      firstOfMonth.getFullYear(),
      firstOfMonth.getMonth(),
      firstOfMonth.getDate() - diff,
    );

    for (let i = 0; i < 42; i += 1) {
      const d = new Date(
        gridStart.getFullYear(),
        gridStart.getMonth(),
        gridStart.getDate() + i,
      );
      dates.push(d);
    }

    return dates;
  }, [visibleMonth]);

  const todayYmd = formatYmd(new Date());
  const visibleMonthIndex = visibleMonth.getMonth();

  // Get selected doctor calendars for tabs
  const selectedDoctorCalendars = useMemo(() => {
    return doctorCalendars.filter((calendar) => calendar.selected);
  }, [doctorCalendars]);

  const activeRangeDates = useMemo(() => {
    if (!selectedDate) return [] as Date[];
    if (view === "day" || !rangeEndDate) {
      return [selectedDate];
    }

    const start = selectedDate < rangeEndDate ? selectedDate : rangeEndDate;
    const end = selectedDate < rangeEndDate ? rangeEndDate : selectedDate;

    const dates: Date[] = [];
    const current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    while (current <= end) {
      dates.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }, [view, selectedDate, rangeEndDate]);

  const timeSlots = useMemo(() => {
    const values: number[] = [];
    for (
      let minutes = DAY_VIEW_START_MINUTES;
      minutes < DAY_VIEW_END_MINUTES;
      minutes += DAY_VIEW_SLOT_MINUTES
    ) {
      values.push(minutes);
    }
    return values;
  }, []);

  // Get the scheduling config for the currently selected doctor in the create modal
  const activeCreateDoctorConfig = useMemo(() => {
    if (!createDoctorCalendarId) return null;
    return doctorSchedulingSettings.find((s) => s.provider_id === createDoctorCalendarId) ?? null;
  }, [createDoctorCalendarId, doctorSchedulingSettings]);

  const createTimeInterval = activeCreateDoctorConfig?.time_interval_minutes ?? DAY_VIEW_SLOT_MINUTES;

  const availableTimeOptions = useMemo(() => {
    if (!draftDate) return [] as { value: string; label: string }[];

    const dayAppointments = appointmentsByDay[draftDate] ?? [];
    const windowStart = DAY_VIEW_START_MINUTES;
    const windowEnd = DAY_VIEW_END_MINUTES;
    const desiredDuration = consultationDuration || createTimeInterval;

    const options: { value: string; label: string }[] = [];

    for (
      let minutes = windowStart;
      minutes <= windowEnd - desiredDuration;
      minutes += createTimeInterval
    ) {
      const slotStart = minutes;
      const slotEnd = minutes + desiredDuration;

      const overlaps = dayAppointments.some((appt) => {
        const start = new Date(appt.start_time);
        if (Number.isNaN(start.getTime())) return false;

        // Use Swiss timezone for consistent time calculations
        const { hour: startH, minute: startM } = getSwissHourMinute(start);
        const rawStartMinutes = startH * 60 + startM;
        let endMinutes = rawStartMinutes + 60;

        if (appt.end_time) {
          const end = new Date(appt.end_time);
          if (!Number.isNaN(end.getTime())) {
            const { hour: endH, minute: endM } = getSwissHourMinute(end);
            endMinutes = endH * 60 + endM;
          }
        }

        if (endMinutes <= rawStartMinutes) {
          endMinutes = rawStartMinutes + DAY_VIEW_SLOT_MINUTES * 2;
        }

        if (endMinutes > windowEnd) {
          endMinutes = windowEnd;
        }

        const apptStart = Math.max(rawStartMinutes, windowStart);
        const apptEnd = Math.max(
          apptStart + DAY_VIEW_SLOT_MINUTES,
          Math.min(endMinutes, windowEnd),
        );

        return apptStart < slotEnd && apptEnd > slotStart;
      });

      if (!overlaps) {
        const hours24 = Math.floor(minutes / 60);
        const mins = minutes % 60;
        const value = `${hours24.toString().padStart(2, "0")}:${mins
          .toString()
          .padStart(2, "0")}`;
        options.push({
          value,
          label: formatTimeOptionLabel(minutes),
        });
      }
    }

    return options;
  }, [draftDate, appointmentsByDay, consultationDuration, createTimeInterval]);

  // Filtered options for smart search dropdowns
  const filteredServiceOptions = useMemo(() => {
    const search = serviceSearch.trim().toLowerCase();
    if (!search) return serviceOptions;
    return serviceOptions.filter((opt) => opt.name.toLowerCase().includes(search));
  }, [serviceOptions, serviceSearch]);

  const filteredStatusOptions = useMemo(() => {
    const search = statusSearch.trim().toLowerCase();
    if (!search) return BOOKING_STATUS_OPTIONS;
    return BOOKING_STATUS_OPTIONS.filter((opt) => opt.toLowerCase().includes(search));
  }, [statusSearch]);

  const filteredCategoryOptions = useMemo(() => {
    const search = categorySearch.trim().toLowerCase();
    if (!search) return APPOINTMENT_CATEGORY_OPTIONS;
    return APPOINTMENT_CATEGORY_OPTIONS.filter((opt) => opt.toLowerCase().includes(search));
  }, [categorySearch]);

  const filteredLocationOptions = useMemo(() => {
    const search = locationSearch.trim().toLowerCase();
    if (!search) return CLINIC_LOCATION_OPTIONS;
    return CLINIC_LOCATION_OPTIONS.filter((opt) => opt.toLowerCase().includes(search));
  }, [locationSearch]);

  // Build duration options list, adding doctor's default duration if not in standard list
  const createDurationOptions = useMemo(() => {
    const base = [...CONSULTATION_DURATION_OPTIONS];
    if (activeCreateDoctorConfig) {
      const defaultDur = activeCreateDoctorConfig.default_duration_minutes;
      if (!base.some((opt) => opt.value === defaultDur)) {
        const label = defaultDur >= 60
          ? defaultDur % 60 === 0 ? `${defaultDur / 60} hour${defaultDur > 60 ? "s" : ""}` : `${defaultDur} minutes`
          : `${defaultDur} minutes`;
        base.push({ value: defaultDur, label });
        base.sort((a, b) => a.value - b.value);
      }
    }
    return base;
  }, [activeCreateDoctorConfig]);

  const filteredDurationOptions = useMemo(() => {
    const search = durationSearch.trim().toLowerCase();
    if (!search) return createDurationOptions;
    return createDurationOptions.filter((opt) => opt.label.toLowerCase().includes(search));
  }, [durationSearch, createDurationOptions]);

  // Build edit duration options, adding the current edit duration if non-standard
  const editDurationOptionsList = useMemo(() => {
    const base = [...CONSULTATION_DURATION_OPTIONS];
    if (editConsultationDuration > 0 && !base.some((opt) => opt.value === editConsultationDuration)) {
      const dur = editConsultationDuration;
      const label = dur >= 60
        ? dur % 60 === 0 ? `${dur / 60} hour${dur > 60 ? "s" : ""}` : `${dur} minutes`
        : `${dur} minutes`;
      base.push({ value: dur, label });
      base.sort((a, b) => a.value - b.value);
    }
    return base;
  }, [editConsultationDuration]);

  const filteredEditDurationOptions = useMemo(() => {
    const search = editDurationSearch.trim().toLowerCase();
    if (!search) return editDurationOptionsList;
    return editDurationOptionsList.filter((opt) => opt.label.toLowerCase().includes(search));
  }, [editDurationSearch, editDurationOptionsList]);

  // Generate all time options using the selected doctor's interval (or default 15 min)
  const allTimeOptions = useMemo(() => {
    const options: { value: string; label: string }[] = [];
    for (let minutes = DAY_VIEW_START_MINUTES; minutes < DAY_VIEW_END_MINUTES; minutes += createTimeInterval) {
      const hours24 = Math.floor(minutes / 60);
      const mins = minutes % 60;
      const value = `${hours24.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
      options.push({
        value,
        label: formatTimeOptionLabel(minutes),
      });
    }
    return options;
  }, [createTimeInterval]);

  // Filtered time options based on search
  const filteredTimeOptions = useMemo(() => {
    const search = timeSearch.trim().toLowerCase();
    if (!search) return allTimeOptions;
    return allTimeOptions.filter((opt) => 
      opt.label.toLowerCase().includes(search) || 
      opt.value.includes(search)
    );
  }, [timeSearch, allTimeOptions]);

  function handleSelectDayView() {
    const base = selectedDate ?? new Date();
    const day = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
    );
    setSelectedDate(day);
    setRangeEndDate(null);
    setView("day");
    setViewMenuOpen(false);
  }

  function handleSelectWeekView() {
    const base = selectedDate ?? new Date();
    const start = new Date(
      base.getFullYear(),
      base.getMonth(),
      base.getDate(),
    );
    const weekday = start.getDay();
    // Adjust to make Monday the first day of the week (0=Sunday, 1=Monday, ..., 6=Saturday)
    const adjustedWeekday = weekday === 0 ? 6 : weekday - 1;
    start.setDate(start.getDate() - adjustedWeekday);

    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    end.setDate(start.getDate() + 6);

    setSelectedDate(start);
    setRangeEndDate(end);
    setView("range");
    setViewMenuOpen(false);
  }

  function handleSelectMonthView() {
    const base = selectedDate ?? new Date();
    setVisibleMonth(new Date(base.getFullYear(), base.getMonth(), 1));
    setSelectedDate(null);
    setRangeEndDate(null);
    setView("month");
    setViewMenuOpen(false);
  }

  function handleToggleCalendarSelected(calendarId: string) {
    setDoctorCalendars((prev) => {
      const updated = prev.map((calendar) =>
        calendar.id === calendarId
          ? { ...calendar, selected: !calendar.selected }
          : calendar,
      );
      // Save selections to localStorage
      try {
        const selectedIds = updated.filter((c) => c.selected).map((c) => c.id);
        localStorage.setItem("appointments_selected_calendars", JSON.stringify(selectedIds));
      } catch {}
      return updated;
    });
  }

  function handleConfirmNewCalendar() {
    if (!newCalendarProviderId) {
      setIsCreatingCalendar(false);
      return;
    }

    const provider = providers.find((item) => item.id === newCalendarProviderId);
    if (!provider) {
      setIsCreatingCalendar(false);
      return;
    }

    setDoctorCalendars((prev) => {
      const exists = prev.some((calendar) => calendar.providerId === provider.id);
      if (exists) return prev;

      const rawName = provider.name ?? "Unnamed doctor";
      const trimmedName = rawName.trim() || "Unnamed doctor";

      const nextCalendar: DoctorCalendar = {
        id: provider.id,
        providerId: provider.id,
        name: trimmedName,
        color: getCalendarColorForIndex(prev.length),
        selected: true,
      };

      return [...prev, nextCalendar];
    });

    setIsCreatingCalendar(false);
    setNewCalendarProviderId("");
  }

  // Handle drag-to-create appointment
  function handleDragCreateStart(date: Date, totalMinutes: number, doctorCalendarId?: string | null) {
    setIsDraggingCreate(true);
    setDragDate(date);
    setDragStartMinutes(totalMinutes);
    setDragEndMinutes(totalMinutes + DAY_VIEW_SLOT_MINUTES);
    setDragDoctorCalendarId(doctorCalendarId ?? null);
  }

  function handleDragCreateMove(totalMinutes: number) {
    if (!isDraggingCreate || dragStartMinutes === null) return;
    setDragEndMinutes(totalMinutes + DAY_VIEW_SLOT_MINUTES);
  }

  function handleDragCreateEnd() {
    if (!isDraggingCreate || dragStartMinutes === null || dragEndMinutes === null || !dragDate) {
      setIsDraggingCreate(false);
      setDragStartMinutes(null);
      setDragEndMinutes(null);
      setDragDate(null);
      touchDragInfoRef.current = null;
      return;
    }

    const startMin = Math.min(dragStartMinutes, dragEndMinutes);
    const endMin = Math.max(dragStartMinutes, dragEndMinutes);
    const durationMinutes = endMin - startMin;

    // Use Swiss timezone for consistent date
    const dateStr = formatSwissYmd(dragDate);
    const hours = Math.floor(startMin / 60);
    const minutes = startMin % 60;
    const timeValue = `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;

    setDraftDate(dateStr);
    setDraftTime(timeValue);
    // Set time search to display label
    setTimeSearch(formatTimeOptionLabel(startMin));
    setDraftTitle("");
    setCreatePatientSearch("");
    setCreatePatientId(null);
    setCreatePatientName("");
    setConsultationDuration(durationMinutes);
    setSelectedServiceId("");
    setServiceSearch("");
    setBookingStatus("");
    setStatusSearch("");
    setAppointmentCategory("");
    setCategorySearch("");
    setDraftLocation(CLINIC_LOCATION_OPTIONS[0] ?? "");
    setLocationSearch(CLINIC_LOCATION_OPTIONS[0] ?? "");
    
    // Find matching duration label or use custom
    const durationOption = CONSULTATION_DURATION_OPTIONS.find(opt => opt.value === durationMinutes);
    setDurationSearch(durationOption ? durationOption.label : `${durationMinutes} minutes`);
    
    setDraftDescription("");
    // Use the doctor from the dragged column if available, otherwise default
    if (dragDoctorCalendarId) {
      setCreateDoctorCalendarId(dragDoctorCalendarId);
    } else {
      const defaultCalendar = doctorCalendars.find((calendar) => calendar.selected) || doctorCalendars[0] || null;
      setCreateDoctorCalendarId(defaultCalendar?.id ?? "");
    }
    setCreateModalOpen(true);

    // Reset drag state
    setIsDraggingCreate(false);
    setDragStartMinutes(null);
    setDragEndMinutes(null);
    setDragDate(null);
    setDragDoctorCalendarId(null);
    touchDragInfoRef.current = null;
  }

  // Touch event handlers for iPad/tablet drag-to-create
  const handleTouchStart = useCallback((
    e: React.TouchEvent,
    date: Date,
    totalMinutes: number,
    doctorCalendarId: string | null,
    slotElement: HTMLDivElement | null
  ) => {
    if (!slotElement) return;
    
    // Prevent default to avoid scroll while dragging
    e.preventDefault();
    
    const rect = slotElement.getBoundingClientRect();
    const containerRect = slotElement.parentElement?.getBoundingClientRect();
    
    touchDragInfoRef.current = {
      date,
      doctorCalendarId,
      containerTop: containerRect?.top ?? rect.top,
      slotHeight: DAY_VIEW_SLOT_HEIGHT,
      startMinutesOffset: DAY_VIEW_START_MINUTES,
    };
    
    handleDragCreateStart(date, totalMinutes, doctorCalendarId);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDraggingCreate || !touchDragInfoRef.current) return;
    
    e.preventDefault();
    
    const touch = e.touches[0];
    if (!touch) return;
    
    const { containerTop, slotHeight, startMinutesOffset } = touchDragInfoRef.current;
    
    // Calculate which time slot the touch is over
    const relativeY = touch.clientY - containerTop;
    const slotIndex = Math.floor(relativeY / slotHeight);
    const totalMinutes = startMinutesOffset + (slotIndex * DAY_VIEW_SLOT_MINUTES);
    
    // Clamp to valid range
    const clampedMinutes = Math.max(
      DAY_VIEW_START_MINUTES,
      Math.min(totalMinutes, DAY_VIEW_END_MINUTES - DAY_VIEW_SLOT_MINUTES)
    );
    
    handleDragCreateMove(clampedMinutes);
  }, [isDraggingCreate]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isDraggingCreate) return;
    e.preventDefault();
    handleDragCreateEnd();
  }, [isDraggingCreate, dragStartMinutes, dragEndMinutes, dragDate, dragDoctorCalendarId, doctorCalendars]);

  function formatTimeLabel(totalMinutes: number): string {
    if (totalMinutes === DAY_VIEW_END_MINUTES - DAY_VIEW_SLOT_MINUTES) {
      return "8:00 PM";
    }

    const minutes = totalMinutes % 60;
    if (minutes !== 0) return "";

    const hour = Math.floor(totalMinutes / 60);
    const suffix = hour >= 12 ? "PM" : "AM";
    let display = hour % 12;
    if (display === 0) display = 12;
    return `${display}:00 ${suffix}`;
  }

  function formatTimeOptionLabel(totalMinutes: number): string {
    const minutes = totalMinutes % 60;
    const hour = Math.floor(totalMinutes / 60);
    const suffix = hour >= 12 ? "PM" : "AM";
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;
    const minutePadded = minutes.toString().padStart(2, "0");
    return `${displayHour}:${minutePadded} ${suffix}`;
  }

  const filteredCreatePatientSuggestions = useMemo(() => {
    const term = createPatientSearch.trim().toLowerCase();
    if (!term) return patientOptions;

    return patientOptions.filter((p) => {
      const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`
        .trim()
        .toLowerCase();
      const email = (p.email ?? "").toLowerCase();
      const phone = (p.phone ?? "").toLowerCase();
      return (
        name.includes(term) || email.includes(term) || phone.includes(term)
      );
    });
  }, [createPatientSearch, patientOptions]);

  async function handleCreateNewPatient() {
    const firstName = newPatientFirstName.trim();
    const lastName = newPatientLastName.trim();
    const emailRaw = newPatientEmail.trim();
    const phoneRaw = newPatientPhone.trim();

    if (!firstName || !lastName || !emailRaw || !phoneRaw) {
      setNewPatientError(
        "First name, last name, email, and phone are required.",
      );
      return;
    }

    const countryCode = "+41";
    const phone = `${countryCode} ${phoneRaw.replace(/^0+/, "").replace(/\s+/g, " ")}`.trim();
    const normalizedEmail = emailRaw.toLowerCase();

    try {
      setSavingNewPatient(true);
      setNewPatientError(null);

      const { data: existing, error: existingError } = await supabaseClient
        .from("patients")
        .select("id")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (!existingError && existing) {
        setNewPatientError("A patient with this email already exists.");
        setSavingNewPatient(false);
        return;
      }

      const { data, error } = await supabaseClient
        .from("patients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: normalizedEmail,
          phone,
          gender: newPatientGender || null,
          source: (newPatientSource || "manual").toLowerCase(),
        })
        .select("id, first_name, last_name, email, phone")
        .single();

      if (error || !data) {
        setNewPatientError(error?.message ?? "Failed to create patient.");
        setSavingNewPatient(false);
        return;
      }

      const fullName =
        `${(data.first_name ?? "").toString()} ${(data.last_name ?? "").toString()}`
          .trim() || "Unnamed patient";

      const suggestion: AppointmentPatientSuggestion = {
        id: data.id as string,
        first_name: data.first_name as string | null,
        last_name: data.last_name as string | null,
        email: data.email as string | null,
        phone: data.phone as string | null,
      };

      setPatientOptions((prev) => {
        const exists = prev.some((p) => p.id === suggestion.id);
        if (exists) return prev;
        return [suggestion, ...prev];
      });

      setCreatePatientId(suggestion.id);
      setCreatePatientName(fullName);
      setCreatePatientSearch(fullName);
      setDraftTitle(`Consultation for ${fullName}`);
      setConsultationDuration(45);
      setNewPatientModalOpen(false);

      setNewPatientFirstName("");
      setNewPatientLastName("");
      setNewPatientEmail("");
      setNewPatientPhone("");
      setNewPatientGender("");
      setNewPatientSource("manual");
      setNewPatientError(null);
      setSavingNewPatient(false);
    } catch {
      setNewPatientError("Failed to create patient.");
      setSavingNewPatient(false);
    }
  }

  async function handleSaveAppointment() {
    if (savingCreate) return;

    setCreateError(null);

    if (!createPatientId) {
      setCreateError("Please select a patient.");
      return;
    }

    if (!selectedServiceId) {
      setCreateError("Please select a service.");
      return;
    }

    if (!bookingStatus) {
      setCreateError("Please select a status.");
      return;
    }

    if (doctorCalendars.length > 0 && !createDoctorCalendarId) {
      setCreateError("Please select a doctor calendar.");
      return;
    }

    if (!draftDate || !draftTime) {
      setCreateError("Please select a date and time.");
      return;
    }

    const startLocal = new Date(`${draftDate}T${draftTime}:00`);
    if (Number.isNaN(startLocal.getTime())) {
      setCreateError("Invalid date or time.");
      return;
    }

    // Check if the selected date is a weekend (skip for system users)
    if (!isSystemUser) {
      const dayOfWeek = startLocal.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        setCreateError("Weekend bookings are not available. Please select a weekday (Monday-Friday).");
        return;
      }
    }

    const durationMinutes = consultationDuration || DAY_VIEW_SLOT_MINUTES;
    const endLocal = new Date(
      startLocal.getTime() + durationMinutes * 60 * 1000,
    );

    const startIso = startLocal.toISOString();
    const endIso = endLocal.toISOString();

    try {
      setSavingCreate(true);

      const service = serviceOptions.find(
        (option) => option.id === selectedServiceId,
      );
      const serviceName = service?.name ?? "";
      const baseReason = serviceName || draftTitle || "Appointment";
      const selectedCalendar = doctorCalendars.find(
        (calendar) => calendar.id === createDoctorCalendarId,
      );
      const doctorName = selectedCalendar?.name?.trim() || "";
      const doctorTag = doctorName ? ` [Doctor: ${doctorName}]` : "";
      const categoryTag = appointmentCategory && appointmentCategory !== "No selection" 
        ? ` [Category: ${appointmentCategory}]` 
        : "";

      const notesTag = draftDescription.trim() 
        ? ` [Notes: ${draftDescription.trim()}]` 
        : "";

      const reason = bookingStatus
        ? `${baseReason}${doctorTag}${categoryTag}${notesTag} [Status: ${bookingStatus}]`
        : `${baseReason}${doctorTag}${categoryTag}${notesTag}`;

      // Don't set provider_id to avoid foreign key issues - doctor info is in [Doctor:] tag
      const { data, error } = await supabaseClient
        .from("appointments")
        .insert({
          patient_id: createPatientId,
          start_time: startIso,
          end_time: endIso,
          reason,
          title: draftTitle || baseReason || null,
          notes: draftDescription.trim() || null,
          location: draftLocation || null,
          source: "manual",
        })
        .select(
          "id, patient_id, provider_id, start_time, end_time, status, reason, title, notes, location, patient:patients(id, first_name, last_name, email, phone), provider:providers(id, name)",
        )
        .single();

      if (error || !data) {
        setCreateError(error?.message ?? "Failed to create appointment.");
        setSavingCreate(false);
        return;
      }

      const inserted = data as unknown as CalendarAppointment;

      // Focus calendar on the booked date so the new appointment is visible
      const insertedStart = new Date(inserted.start_time);
      if (!Number.isNaN(insertedStart.getTime())) {
        setSelectedDate(insertedStart);
        setRangeEndDate(null);
        setVisibleMonth(
          new Date(
            insertedStart.getFullYear(),
            insertedStart.getMonth(),
            1,
          ),
        );
      }

      void sendAppointmentConfirmationEmail(inserted);

      setAppointments((prev) => {
        const next = [...prev, inserted];
        next.sort((a, b) => {
          const aTime = new Date(a.start_time).getTime();
          const bTime = new Date(b.start_time).getTime();
          return aTime - bTime;
        });
        return next;
      });

      setSavingCreate(false);
      setCreateModalOpen(false);

      setDraftTitle("");
      setDraftDate("");
      setDraftTime("");
      setTimeSearch("");
      setDraftLocation("");
      setDraftDescription("");
      setCreatePatientSearch("");
      setCreatePatientId(null);
      setCreatePatientName("");
      setConsultationDuration(15);
      setSelectedServiceId("");
      setServiceSearch("");
      setBookingStatus("");
      setStatusSearch("");
      setAppointmentCategory("");
      setCategorySearch("");
      setLocationSearch("");
      setDurationSearch("");
      setCreateError(null);
      setCreateDoctorCalendarId("");
    } catch {
      setCreateError("Failed to create appointment.");
      setSavingCreate(false);
    }
  }

  function openEditModalForAppointment(appt: CalendarAppointment) {
    setEditingAppointment(appt);
    setEditError(null);
    setSavingEdit(false);

    const workflow = appointmentStatusToWorkflow(appt.status);
    setEditWorkflowStatus(workflow);

    const start = new Date(appt.start_time);
    const end = appt.end_time ? new Date(appt.end_time) : null;

    if (!Number.isNaN(start.getTime())) {
      // Use Swiss timezone for consistent display
      const swissDateStr = formatSwissYmd(start);
      const { hour, minute } = getSwissHourMinute(start);
      setEditDate(swissDateStr);
      setEditTime(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
    } else {
      setEditDate("");
      setEditTime("");
    }

    let durationMinutes = DAY_VIEW_SLOT_MINUTES;
    if (!Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
      durationMinutes = Math.max(
        Math.round((end.getTime() - start.getTime()) / (60 * 1000)),
        DAY_VIEW_SLOT_MINUTES,
      );
    }
    setEditConsultationDuration(durationMinutes);
    // Set duration search label
    const durationOption = CONSULTATION_DURATION_OPTIONS.find(opt => opt.value === durationMinutes);
    setEditDurationSearch(durationOption ? durationOption.label : `${durationMinutes} minutes`);

    setEditLocation(appt.location ?? "");

    const { statusLabel } = getServiceAndStatusFromReason(appt.reason);
    setEditBookingStatus(statusLabel ?? "");
    setEditBookingStatusSearch(statusLabel ?? "");

    const categoryFromReason = getCategoryFromReason(appt.reason);
    setEditCategory(categoryFromReason ?? "");
    setEditCategorySearch(categoryFromReason ?? "");

    setEditNotes(getAppointmentNotes(appt) || "");

    setEditModalOpen(true);
  }

  function handleCopyAppointment(appt: CalendarAppointment) {
    setCopiedAppointment(appt);
  }

  function handlePasteAppointment() {
    if (!copiedAppointment) return;

    // Extract data from copied appointment
    const { serviceLabel, statusLabel } = getServiceAndStatusFromReason(copiedAppointment.reason);
    const categoryFromReason = getCategoryFromReason(copiedAppointment.reason);

    // Find matching service
    const matchedService = serviceOptions.find(
      (s) => s.name.toLowerCase() === serviceLabel?.toLowerCase()
    );

    if (copiedAppointment.patient?.id) {
      const patientName = `${copiedAppointment.patient.first_name ?? ""} ${copiedAppointment.patient.last_name ?? ""}`.trim();
      setCreatePatientId(copiedAppointment.patient.id);
      setCreatePatientName(patientName);
      setCreatePatientSearch(patientName);
    }

    if (matchedService) {
      setSelectedServiceId(matchedService.id);
      setServiceSearch(matchedService.name);
    }

    setBookingStatus(statusLabel ?? "");
    setStatusSearch(statusLabel ?? "");
    setAppointmentCategory(categoryFromReason ?? "");
    setCategorySearch(categoryFromReason ?? "");
    setDraftLocation(copiedAppointment.location ?? "Rhône");
    setLocationSearch(copiedAppointment.location ?? "Rhône");

    // Set duration from copied appointment
    const start = new Date(copiedAppointment.start_time);
    const end = copiedAppointment.end_time ? new Date(copiedAppointment.end_time) : null;
    if (!Number.isNaN(start.getTime()) && end && !Number.isNaN(end.getTime())) {
      const diffMinutes = Math.round((end.getTime() - start.getTime()) / (60 * 1000));
      if (diffMinutes > 0) {
        setConsultationDuration(diffMinutes);
        setDurationSearch(String(diffMinutes));
      }
    }

    // Open the create modal
    setCreateModalOpen(true);
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

    // Check if the selected date is a weekend (skip for system users or when cancelling)
    const nextStatus = workflowToAppointmentStatus(editWorkflowStatus);
    if (!isSystemUser && nextStatus !== "cancelled") {
      const dayOfWeek = startLocal.getDay();
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        setEditError("Weekend bookings are not available. Please select a weekday (Monday-Friday).");
        return;
      }
    }

    const durationMinutes = editConsultationDuration || DAY_VIEW_SLOT_MINUTES;
    const endLocal = new Date(
      startLocal.getTime() + durationMinutes * 60 * 1000,
    );

    const startIso = startLocal.toISOString();
    const endIso = endLocal.toISOString();

    try {
      setSavingEdit(true);

      // Build updated reason string with category and status
      const existingReason = editingAppointment.reason ?? "";
      const { serviceLabel } = getServiceAndStatusFromReason(existingReason);
      const doctorName = getDoctorNameFromReason(existingReason);
      
      let updatedReason = serviceLabel || "Appointment";
      if (doctorName) updatedReason += ` [Doctor: ${doctorName}]`;
      if (editCategory && editCategory !== "No selection") updatedReason += ` [Category: ${editCategory}]`;
      if (editBookingStatus && editBookingStatus !== "Aucune sélection") updatedReason += ` [Status: ${editBookingStatus}]`;

      const { data, error } = await supabaseClient
        .from("appointments")
        .update({
          status: nextStatus,
          start_time: startIso,
          end_time: endIso,
          location: editLocation || null,
          reason: updatedReason,
          notes: editNotes.trim() || null,
        })
        .eq("id", editingAppointment.id)
        .select(
          "id, patient_id, provider_id, start_time, end_time, status, reason, title, notes, location, patient:patients(id, first_name, last_name, email, phone), provider:providers(id, name)",
        )
        .single();

      if (error || !data) {
        setEditError(error?.message ?? "Failed to update appointment.");
        setSavingEdit(false);
        return;
      }

      const updated = data as unknown as CalendarAppointment;

      setAppointments((prev) => {
        if (updated.status === "cancelled") {
          return prev.filter((appt) => appt.id !== updated.id);
        }

        const next = prev.map((appt) =>
          appt.id === updated.id ? updated : appt,
        );
        next.sort((a, b) => {
          const aTime = new Date(a.start_time).getTime();
          const bTime = new Date(b.start_time).getTime();
          return aTime - bTime;
        });
        return next;
      });

      setSavingEdit(false);
      setEditModalOpen(false);
      setEditingAppointment(null);
    } catch {
      setEditError("Failed to update appointment.");
      setSavingEdit(false);
    }
  }

  async function handleDeleteAppointment() {
    if (!editingAppointment || deletingAppointment) return;

    try {
      setDeletingAppointment(true);
      setEditError(null);

      const { error } = await supabaseClient
        .from("appointments")
        .delete()
        .eq("id", editingAppointment.id);

      if (error) {
        setEditError(error.message ?? "Failed to delete appointment.");
        setDeletingAppointment(false);
        return;
      }

      // Remove from local state
      setAppointments((prev) => prev.filter((a) => a.id !== editingAppointment.id));

      setDeletingAppointment(false);
      setShowDeleteConfirm(false);
      setEditModalOpen(false);
      setEditingAppointment(null);
    } catch {
      setEditError("Failed to delete appointment.");
      setDeletingAppointment(false);
    }
  }

  function goToToday() {
    const now = new Date();
    setVisibleMonth(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelectedDate(now);
    setRangeEndDate(null);
    setView("day");
  }

  function goPrevMonth() {
    setVisibleMonth((prev) =>
      new Date(prev.getFullYear(), prev.getMonth() - 1, 1),
    );
  }

  function goNextMonth() {
    setVisibleMonth((prev) =>
      new Date(prev.getFullYear(), prev.getMonth() + 1, 1),
    );
  }

  function handleMiniDayMouseDown(date: Date) {
    setSelectedDate(date);
    setRangeEndDate(null);
    setIsDraggingRange(true);
    setView("day");
  }

  function handleMiniDayMouseEnter(date: Date) {
    if (!isDraggingRange || !selectedDate) return;
    setRangeEndDate(date);
    setView("range");
  }

  function handleMonthDayClick(date: Date) {
    setVisibleMonth(new Date(date.getFullYear(), date.getMonth(), 1));
    setSelectedDate(date);
    setRangeEndDate(null);
    setView("day");
  }

  return (
    <div className="flex h-[calc(100vh-96px)] gap-4 px-0 pb-4 pt-2 sm:px-1 lg:px-2">
      {/* Left sidebar similar to Google Calendar */}
      <aside className="hidden w-64 flex-shrink-0 flex-col rounded-3xl border border-slate-200/80 bg-white/95 p-3 text-xs text-slate-700 shadow-[0_18px_40px_rgba(15,23,42,0.10)] md:flex">
        <div className="mb-3">
          <button
            type="button"
            onClick={() => {
              const baseDate = selectedDate ?? new Date();
              // Use Swiss timezone for consistent date
              setDraftDate(formatSwissYmd(baseDate));
              setDraftTime("");
              setTimeSearch("");
              setDraftTitle("");
              setCreatePatientSearch("");
              setCreatePatientId(null);
              setCreatePatientName("");
              setSelectedServiceId("");
              setServiceSearch("");
              setBookingStatus("");
              setStatusSearch("");
              setAppointmentCategory("");
              setCategorySearch("");
              setDraftLocation(CLINIC_LOCATION_OPTIONS[0] ?? "");
              setLocationSearch(CLINIC_LOCATION_OPTIONS[0] ?? "");
              setDraftDescription("");
              const defaultCalendar =
                doctorCalendars.find((calendar) => calendar.selected) ||
                doctorCalendars[0] ||
                null;
              const defaultCalId = defaultCalendar?.id ?? "";
              setCreateDoctorCalendarId(defaultCalId);
              // Apply doctor-specific scheduling defaults
              const docConfig = doctorSchedulingSettings.find((s) => s.provider_id === defaultCalId);
              if (docConfig) {
                setConsultationDuration(docConfig.default_duration_minutes);
                const durOpt = CONSULTATION_DURATION_OPTIONS.find((o) => o.value === docConfig.default_duration_minutes);
                setDurationSearch(durOpt ? durOpt.label : `${docConfig.default_duration_minutes} minutes`);
              } else {
                setConsultationDuration(15);
                setDurationSearch("15 minutes");
              }
              setCreateModalOpen(true);
            }}
            className="inline-flex w-full items-center justify-center rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-sky-700"
          >
            Create
          </button>
          {copiedAppointment && (
            <button
              type="button"
              onClick={handlePasteAppointment}
              className="inline-flex w-full items-center justify-center gap-1 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              title={`Paste: ${copiedAppointment.patient ? `${copiedAppointment.patient.first_name ?? ""} ${copiedAppointment.patient.last_name ?? ""}`.trim() : "Copied appointment"}`}
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              Paste
            </button>
          )}
        </div>
        {/* Mini month */}
        <div className="mb-4 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-2">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-slate-700">
            <button
              type="button"
              onClick={goPrevMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-slate-100"
              aria-label="Previous month"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 4 6 10l6 6" />
              </svg>
            </button>
            <span>{formatMonthYear(visibleMonth)}</span>
            <button
              type="button"
              onClick={goNextMonth}
              className="inline-flex h-6 w-6 items-center justify-center rounded-full hover:bg-slate-100"
              aria-label="Next month"
            >
              <svg
                className="h-3 w-3"
                viewBox="0 0 20 20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m8 4 6 6-6 6" />
              </svg>
            </button>
          </div>
          <div className="grid grid-cols-7 text-[9px] font-medium uppercase tracking-wide text-slate-500">
            {["M", "T", "W", "T", "F", "S", "S"].map((label, index) => (
              <div key={`${label}-${index}`} className="px-1 py-0.5 text-center">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 text-[10px]">
            {gridDates.map((date) => {
              const ymd = formatYmd(date);
              const isToday = ymd === todayYmd;
              const isCurrentMonth = date.getMonth() === visibleMonthIndex;

              // Highlight if inside selected range
              const inRange = (() => {
                if (!selectedDate) return false;
                if (!rangeEndDate || view === "day") {
                  return ymd === formatYmd(selectedDate);
                }
                const start = selectedDate < rangeEndDate ? selectedDate : rangeEndDate;
                const end = selectedDate < rangeEndDate ? rangeEndDate : selectedDate;
                const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
                return d >= start && d <= end;
              })();

              return (
                <button
                  key={ymd + "mini"}
                  type="button"
                  onMouseDown={() => handleMiniDayMouseDown(date)}
                  onMouseEnter={() => handleMiniDayMouseEnter(date)}
                  onTouchStart={() => handleMiniDayMouseDown(date)}
                  onTouchMove={(e) => {
                    if (!isDraggingRange) return;
                    const touch = e.touches[0];
                    if (!touch) return;
                    const element = document.elementFromPoint(touch.clientX, touch.clientY);
                    const dateAttr = element?.getAttribute('data-mini-date');
                    if (dateAttr) {
                      const [y, m, d] = dateAttr.split('-').map(Number);
                      if (y && m && d) {
                        handleMiniDayMouseEnter(new Date(y, m - 1, d));
                      }
                    }
                  }}
                  onTouchEnd={() => setIsDraggingRange(false)}
                  onClick={() =>
                    setVisibleMonth(
                      new Date(date.getFullYear(), date.getMonth(), 1),
                    )
                  }
                  data-mini-date={ymd}
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] ${
                    isCurrentMonth ? "text-slate-700" : "text-slate-400"
                  } ${
                    isToday
                      ? "bg-sky-600 text-white shadow-sm"
                      : inRange
                        ? "bg-sky-100 text-sky-800"
                        : "hover:bg-slate-100"
                  }`}
                >
                  {date.toLocaleDateString(SWISS_LOCALE, { day: "numeric", timeZone: SWISS_TIMEZONE })}
                </button>
              );
            })}
          </div>
        </div>

        {/* Search patient */}
        <div className="mb-4">
          <input
            type="text"
            value={patientSearch}
            onChange={(event) => setPatientSearch(event.target.value)}
            placeholder="Search patient"
            className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Doctor calendars */}
        <div className="space-y-2">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Doctor calendars
          </p>
          <div className="max-h-[280px] space-y-1 overflow-y-auto pr-1">
            {providersLoading ? (
              <p className="text-[10px] text-slate-400">Loading providers...</p>
            ) : providersError ? (
              <p className="text-[10px] text-red-600">{providersError}</p>
            ) : doctorCalendars.length === 0 ? (
              <p className="text-[10px] text-slate-400">No provider calendars yet.</p>
            ) : (() => {
              const activeCalendars = doctorCalendars.filter(
                (calendar) => !calendar.name.toLowerCase().includes("(deactivated")
              );
              const priorityCalendars = activeCalendars.filter((calendar) =>
                PRIORITY_DOCTOR_NAMES.some((name) =>
                  calendar.name.toLowerCase().includes(name)
                )
              );
              const otherCalendars = activeCalendars.filter((calendar) =>
                !PRIORITY_DOCTOR_NAMES.some((name) =>
                  calendar.name.toLowerCase().includes(name)
                )
              );
              const calendarsToShow = showAllDoctors
                ? [...priorityCalendars, ...otherCalendars]
                : priorityCalendars;

              return (
                <>
                  {calendarsToShow.map((calendar) => (
                    <label
                      key={calendar.id}
                      className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={calendar.selected}
                        onChange={() => handleToggleCalendarSelected(calendar.id)}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-sky-600 focus:ring-sky-500"
                      />
                      <span className="inline-flex items-center gap-1">
                        <span
                          className={`h-2 w-2 rounded-sm ${calendar.color}`}
                        />
                        <span className="truncate">{calendar.name}</span>
                      </span>
                    </label>
                  ))}
                  {otherCalendars.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowAllDoctors(!showAllDoctors)}
                      className="mt-1 text-[10px] font-medium text-sky-600 hover:text-sky-700"
                    >
                      {showAllDoctors ? `Hide ${otherCalendars.length} doctors` : `Show ${otherCalendars.length} more doctors`}
                    </button>
                  )}
                </>
              );
            })()}
          </div>
          <div className="pt-1">
            {isCreatingCalendar ? (
              <div className="space-y-1">
                <select
                  value={newCalendarProviderId}
                  onChange={(event) => setNewCalendarProviderId(event.target.value)}
                  className="w-full rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  <option value="">Select doctor</option>
                  {providers
                    .filter((provider) =>
                      !doctorCalendars.some(
                        (calendar) => calendar.providerId === provider.id,
                      ),
                    )
                    .map((provider) => {
                      const rawName = provider.name ?? "Unnamed doctor";
                      const trimmedName = rawName.trim() || "Unnamed doctor";
                      return (
                        <option key={provider.id} value={provider.id}>
                          {trimmedName}
                        </option>
                      );
                    })}
                </select>
                <div className="flex gap-1">
                  <button
                    type="button"
                    onClick={handleConfirmNewCalendar}
                    className="inline-flex flex-1 items-center justify-center rounded-full bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!newCalendarProviderId}
                  >
                    Add
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreatingCalendar(false);
                      setNewCalendarProviderId("");
                    }}
                    className="inline-flex flex-1 items-center justify-center rounded-full border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  const providerIdsWithCalendars = new Set(
                    doctorCalendars.map((calendar) => calendar.providerId),
                  );
                  const nextProvider = providers.find(
                    (provider) => !providerIdsWithCalendars.has(provider.id),
                  );
                  setNewCalendarProviderId(nextProvider?.id ?? "");
                  setIsCreatingCalendar(true);
                }}
                className="inline-flex items-center rounded-full border border-dashed border-sky-300 bg-sky-50 px-3 py-1.5 text-[11px] font-medium text-sky-700 hover:bg-sky-100"
              >
                + New calendar
              </button>
            )}
          </div>
        </div>

        {/* Booking pages / Other calendars placeholders */}
        <div className="mt-4 space-y-2 text-[10px] text-slate-500">
          <p className="font-semibold">Booking pages</p>
          <p className="text-slate-400">Coming soon</p>
        </div>
        <div className="mt-4 space-y-2 text-[10px] text-slate-500">
          <p className="font-semibold">Other calendars</p>
          <p className="text-slate-400">Coming soon</p>
        </div>
      </aside>

      {/* Main month view */}
      <div className="flex min-w-0 flex-1 flex-col space-y-4">
        {/* Calendar header controls */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-lg font-semibold text-slate-900">Calendar</h1>
            <button
              type="button"
              onClick={goToToday}
              className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              Today
            </button>
            <div className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-1 py-0.5 text-slate-600 shadow-sm">
              <button
                type="button"
                onClick={goPrevMonth}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-50"
                aria-label="Previous month"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 4 6 10l6 6" />
                </svg>
              </button>
              <button
                type="button"
                onClick={goNextMonth}
                className="inline-flex h-7 w-7 items-center justify-center rounded-full hover:bg-slate-50"
                aria-label="Next month"
              >
                <svg
                  className="h-3 w-3"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m8 4 6 6-6 6" />
                </svg>
              </button>
            </div>
            <span className="text-sm font-medium text-slate-800">
              {view === "month" && formatMonthYear(visibleMonth)}
              {view === "day" &&
                selectedDate &&
                selectedDate.toLocaleDateString(SWISS_LOCALE, {
                  weekday: "long",
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                  timeZone: SWISS_TIMEZONE,
                })}
              {view === "range" && activeRangeDates.length > 0 && (
                <>
                  {activeRangeDates[0].toLocaleDateString(SWISS_LOCALE, {
                    month: "short",
                    day: "numeric",
                    timeZone: SWISS_TIMEZONE,
                  })}
                  {" – "}
                  {activeRangeDates[activeRangeDates.length - 1].toLocaleDateString(
                    SWISS_LOCALE,
                    {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                      timeZone: SWISS_TIMEZONE,
                    },
                  )}
                </>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs text-slate-600">
            <div className="relative">
              <button
                type="button"
                onClick={() => setViewMenuOpen((prev) => !prev)}
                className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
              >
                {view === "month"
                  ? "Month"
                  : activeRangeDates.length === 1
                    ? "Day"
                    : "Week"}
                <svg
                  className="h-3 w-3 text-slate-500"
                  viewBox="0 0 20 20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.7"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m6 8 4 4 4-4" />
                </svg>
              </button>
              {viewMenuOpen ? (
                <div className="absolute right-0 z-20 mt-1 min-w-[120px] rounded-xl border border-slate-200 bg-white py-1 text-xs shadow-lg">
                  <button
                    type="button"
                    onClick={handleSelectDayView}
                    className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  >
                    Day
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectWeekView}
                    className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  >
                    Week
                  </button>
                  <button
                    type="button"
                    onClick={handleSelectMonthView}
                    className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                  >
                    Month
                  </button>
                </div>
              ) : null}
            </div>
            <Link
              href="/appointments/cancelled"
              className="inline-flex items-center rounded-full border border-rose-200/80 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 shadow-sm hover:bg-rose-50"
            >
              Cancelled
            </Link>
          </div>
        </div>
        {view === "month" ? (
          <div className="flex-1 flex flex-col overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 text-xs shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
            <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50/80 text-[11px] font-medium uppercase tracking-wide text-slate-500 sticky top-0 z-10">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((label) => (
                <div key={label} className="px-3 py-2">
                  {label}
                </div>
              ))}
            </div>
            <div className="grid flex-1 grid-cols-7 text-[11px] overflow-y-auto">
              {gridDates.map((date) => {
                const ymd = formatYmd(date);
                const isToday = ymd === todayYmd;
                const isCurrentMonth = date.getMonth() === visibleMonthIndex;

                // Highlight if inside selected range
                const inRange = activeRangeDates.some(
                  (rangeDate) => formatYmd(rangeDate) === ymd,
                );

                return (
                  <div
                    key={ymd}
                    onClick={() => handleMonthDayClick(date)}
                    onMouseDown={() => handleMiniDayMouseDown(date)}
                    onMouseEnter={() => handleMiniDayMouseEnter(date)}
                    onTouchStart={() => handleMiniDayMouseDown(date)}
                    onTouchEnd={() => setIsDraggingRange(false)}
                    data-month-date={ymd}
                    className={`flex min-h-[96px] flex-col border-b border-r border-slate-100 px-2 py-1 text-left last:border-r-0 ${
                      isCurrentMonth ? "bg-white" : "bg-slate-50/80 text-slate-400"
                    } ${inRange ? "bg-sky-50" : ""}`}
                  >
                    <div className="mb-1 flex items-center justify-between text-[11px]">
                      <span
                        className={`inline-flex h-5 w-5 items-center justify-center rounded-full ${
                          isToday ? "bg-sky-600 text-white" : "text-slate-700"
                        }`}
                      >
                        {date.toLocaleDateString(SWISS_LOCALE, { day: "numeric", timeZone: SWISS_TIMEZONE })}
                      </span>
                    </div>
                    <div className="space-y-0.5">
                      {appointmentsByDay[ymd] &&
                        appointmentsByDay[ymd].map((appt) => {
                          const start = new Date(appt.start_time);
                          const end = appt.end_time ? new Date(appt.end_time) : null;
                          const timeLabel = formatTimeRangeLabel(start, end);
                          const { serviceLabel } = getServiceAndStatusFromReason(
                            appt.reason,
                          );

                          const patientName = `${appt.patient?.first_name ?? ""} ${
                            appt.patient?.last_name ?? ""
                          }`
                            .trim()
                            .replace(/\s+/g, " ");

                          const doctorFromReason = getDoctorNameFromReason(appt.reason);
                          const providerName = (appt.provider?.name ?? "").trim().toLowerCase();
                          const doctorKey = (doctorFromReason ?? providerName).trim().toLowerCase();
                          const doctorCalendar = doctorCalendars.find(
                            (calendar) => {
                              const calName = calendar.name.trim().toLowerCase();
                              return calName === doctorKey || calName.includes(doctorKey) || doctorKey.includes(calName);
                            }
                          );
                          const doctorColor = doctorCalendar?.color ?? "";

                          const category = getCategoryFromReason(appt.reason);
                          const notes = getAppointmentNotes(appt);
                          const { statusLabel } = getServiceAndStatusFromReason(appt.reason);
                          const statusIcon = getStatusIcon(statusLabel);

                          return (
                            <button
                              key={appt.id}
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                openEditModalForAppointment(appt);
                              }}
                              className={`w-full rounded-md px-1 py-0.5 text-[10px] text-left ${getAppointmentStatusColorClasses(
                                appt.status,
                              )} ${getCategoryColor(category)}`}
                            >
                              <div className="flex items-center gap-1 truncate font-medium text-slate-800">
                                {statusIcon && <span className="flex-shrink-0">{statusIcon}</span>}
                                <span className="truncate">{patientName || serviceLabel}</span>
                              </div>
                              <div className="truncate text-[10px] text-slate-500">
                                {timeLabel} {serviceLabel ? `• ${serviceLabel}` : ""}
                              </div>
                              {category && (
                                <div className="truncate text-[9px] text-slate-400">
                                  {category}
                                </div>
                              )}
                              {notes && (
                                <div className="truncate text-[9px] text-slate-400 italic">
                                  {notes}
                                </div>
                              )}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 text-xs shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
            <div className="flex flex-col h-full">
              {/* Sticky header row with doctor columns when multiple selected */}
              <div className="flex border-b border-slate-100 bg-slate-50/80 text-[11px] font-medium text-slate-500 sticky top-0 z-10">
                {/* Empty cell for time axis column */}
                <div className="w-16 border-r border-slate-100 bg-slate-50/80 shrink-0" />
                {/* Day headers - show doctor sub-columns when multiple selected */}
                {activeRangeDates.map((date) => (
                  <div
                    key={formatYmd(date)}
                    className="flex-1 border-r border-slate-100 last:border-r-0"
                  >
                    {/* Date header */}
                    <div className="px-2 py-1 text-center border-b border-slate-100">
                      <div className="text-[10px] uppercase tracking-wide text-slate-500">
                        {date.toLocaleDateString(SWISS_LOCALE, { weekday: "short", timeZone: SWISS_TIMEZONE })}
                      </div>
                      <div className="text-sm font-semibold text-slate-800">
                        {date.toLocaleDateString(SWISS_LOCALE, { day: "numeric", timeZone: SWISS_TIMEZONE })}
                      </div>
                    </div>
                    {/* Doctor column headers - only show when multiple doctors selected */}
                    {selectedDoctorCalendars.length > 1 && (
                      <div className="flex">
                        {selectedDoctorCalendars.map((calendar, idx) => (
                          <div
                            key={calendar.id}
                            className={`flex-1 px-1 py-1.5 text-center text-[10px] font-semibold text-white truncate ${calendar.color || "bg-slate-500"} ${idx < selectedDoctorCalendars.length - 1 ? "border-r border-white/30" : ""}`}
                            title={calendar.name}
                          >
                            {calendar.name.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 3)}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {/* Scrollable content area with time axis and day columns */}
              <div className="flex-1 overflow-auto">
                <div className="flex">
                  {/* Time axis - scrolls with content */}
                  <div className="w-16 border-r border-slate-100 bg-slate-50/80 shrink-0">
                    {timeSlots.map((totalMinutes) => (
                      <div
                        key={totalMinutes}
                        className="flex items-start justify-end pr-2 text-[10px] text-slate-400"
                        style={{ height: DAY_VIEW_SLOT_HEIGHT }}
                      >
                        {formatTimeLabel(totalMinutes)}
                      </div>
                    ))}
                  </div>
                  {/* Day columns with appointments - side-by-side doctor columns when multiple selected */}
                  <div
                    className="flex flex-1 relative"
                    style={{
                      minHeight:
                        (DAY_VIEW_END_MINUTES - DAY_VIEW_START_MINUTES) *
                        (DAY_VIEW_SLOT_HEIGHT / DAY_VIEW_SLOT_MINUTES),
                    }}
                  >
                    {/* Current time indicator line */}
                    {(() => {
                      // Use Swiss timezone for consistent time display
                      const { hour: nowH, minute: nowM } = getSwissHourMinute(currentTime);
                      const nowMinutes = nowH * 60 + nowM;
                      const isToday = selectedDate && formatYmd(selectedDate) === formatYmd(currentTime);
                      const isInBounds = nowMinutes >= DAY_VIEW_START_MINUTES && nowMinutes <= DAY_VIEW_END_MINUTES;
                      
                      if (!isToday || !isInBounds) return null;
                      
                      const topPosition = ((nowMinutes - DAY_VIEW_START_MINUTES) / DAY_VIEW_SLOT_MINUTES) * DAY_VIEW_SLOT_HEIGHT;
                      
                      return (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                          style={{ top: topPosition }}
                        >
                          <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1 shrink-0" />
                          <div className="flex-1 h-0.5 bg-red-500" />
                        </div>
                      );
                    })()}
                    {activeRangeDates.map((date) => {
                      const ymd = formatYmd(date);
                      const dayAppointments = appointmentsByDay[ymd] ?? [];
                      
                      // Determine columns to render - either multiple doctors or single column
                      const doctorColumns = selectedDoctorCalendars.length > 1 
                        ? selectedDoctorCalendars 
                        : [null]; // null means show all appointments in single column

                      return (
                        <div
                          key={ymd}
                          className="relative flex-1 border-r border-slate-100 last:border-r-0 select-none flex"
                        >
                          {doctorColumns.map((doctorCol, colIdx) => {
                            // Filter appointments for this doctor column
                            const columnAppointments = doctorCol 
                              ? dayAppointments.filter((appt) => {
                                  const doctorFromReason = getDoctorNameFromReason(appt.reason);
                                  const providerName = (appt.provider?.name ?? "").trim().toLowerCase();
                                  const reasonLower = (appt.reason ?? "").toLowerCase();
                                  const doctorKey = (doctorFromReason ?? providerName).trim().toLowerCase();
                                  const calName = doctorCol.name.trim().toLowerCase();
                                  
                                  // Match by provider_id first
                                  if (appt.provider_id && doctorCol.providerId === appt.provider_id) return true;
                                  
                                  // Match by doctor key
                                  if (doctorKey && (doctorKey.includes(calName) || calName.includes(doctorKey))) return true;
                                  
                                  // Match by reason text
                                  const nameParts = calName.split(/\s+/);
                                  if (nameParts.some((part) => part.length > 2 && reasonLower.includes(part))) return true;
                                  
                                  return false;
                                })
                              : dayAppointments;

                            return (
                              <div
                                key={doctorCol?.id ?? "all"}
                                ref={dayViewContainerRef}
                                className={`relative flex-1 ${colIdx < doctorColumns.length - 1 ? "border-r border-slate-100" : ""}`}
                                style={{ touchAction: isDraggingCreate ? 'none' : 'auto' }}
                                onMouseLeave={() => {
                                  if (isDraggingCreate) handleDragCreateEnd();
                                }}
                                onMouseUp={() => {
                                  if (isDraggingCreate) handleDragCreateEnd();
                                }}
                                onTouchMove={handleTouchMove}
                                onTouchEnd={handleTouchEnd}
                                onTouchCancel={handleTouchEnd}
                              >
                                {/* Horizontal slot lines / draggable empty timeslots */}
                                {timeSlots.map((totalMinutes) => {
                                  const isInDragRange = isDraggingCreate && 
                                    dragDate && 
                                    formatYmd(dragDate) === ymd &&
                                    dragStartMinutes !== null && 
                                    dragEndMinutes !== null &&
                                    totalMinutes >= Math.min(dragStartMinutes, dragEndMinutes) &&
                                    totalMinutes < Math.max(dragStartMinutes, dragEndMinutes);

                                  return (
                                    <div
                                      key={totalMinutes}
                                      onMouseDown={(e) => {
                                        e.preventDefault();
                                        handleDragCreateStart(date, totalMinutes, doctorCol?.id);
                                      }}
                                      onMouseEnter={() => {
                                        if (isDraggingCreate && dragDate && formatYmd(dragDate) === ymd) {
                                          handleDragCreateMove(totalMinutes);
                                        }
                                      }}
                                      onTouchStart={(e) => {
                                        handleTouchStart(e, date, totalMinutes, doctorCol?.id ?? null, e.currentTarget);
                                      }}
                                      className={`block w-full border-t border-slate-100 cursor-pointer hover:bg-sky-50 transition-colors ${
                                        isInDragRange ? "bg-sky-100" : ""
                                      }`}
                                      style={{ height: DAY_VIEW_SLOT_HEIGHT, touchAction: 'none' }}
                                    />
                                  );
                                })}

                                {/* Appointments for this doctor column */}
                                {(() => {
                                  const overlapMap = calculateOverlapPositions(columnAppointments);
                                  return columnAppointments.map((appt) => {
                                    const start = new Date(appt.start_time);
                                    if (Number.isNaN(start.getTime())) return null;

                                    // Use Swiss timezone for consistent display
                                    const { hour: startH, minute: startM } = getSwissHourMinute(start);
                                    const rawStartMinutes = startH * 60 + startM;
                                    const topMinutes = Math.max(rawStartMinutes - DAY_VIEW_START_MINUTES, 0);

                                    let end = appt.end_time ? new Date(appt.end_time) : null;
                                    let endMinutes = rawStartMinutes + DAY_VIEW_SLOT_MINUTES * 2;
                                    if (end && !Number.isNaN(end.getTime())) {
                                      const { hour: endH, minute: endM } = getSwissHourMinute(end);
                                      endMinutes = endH * 60 + endM;
                                    }

                                    // Handle appointments spanning midnight
                                    if (endMinutes <= rawStartMinutes) {
                                      endMinutes = DAY_VIEW_END_MINUTES;
                                    }

                                    endMinutes = Math.min(endMinutes, DAY_VIEW_END_MINUTES);
                                    const durationMinutes = Math.max(endMinutes - rawStartMinutes, DAY_VIEW_SLOT_MINUTES);

                                    const top = (topMinutes / DAY_VIEW_SLOT_MINUTES) * DAY_VIEW_SLOT_HEIGHT;
                                    const calculatedHeight = (durationMinutes / DAY_VIEW_SLOT_MINUTES) * DAY_VIEW_SLOT_HEIGHT;
                                    
                                    const overlapInfo = overlapMap.get(appt.id);
                                    const overlapColIndex = overlapInfo?.columnIndex ?? 0;
                                    const totalCols = overlapInfo?.totalColumns ?? 1;
                                    const maxWidthPercent = 80;
                                    const widthPercent = maxWidthPercent / totalCols;
                                    const leftPercent = overlapColIndex * widthPercent;
                                    
                                    const minHeight = totalCols > 1 ? 28 : 24;
                                    const height = Math.max(calculatedHeight, minHeight);

                                    const { serviceLabel } = getServiceAndStatusFromReason(appt.reason);
                                    const timeLabel = formatTimeRangeLabel(start, end && !Number.isNaN(end.getTime()) ? end : null);

                                    const category = getCategoryFromReason(appt.reason);
                                    const notes = getAppointmentNotes(appt);
                                    const { statusLabel: dayStatusLabel } = getServiceAndStatusFromReason(appt.reason);
                                    const dayStatusIcon = getStatusIcon(dayStatusLabel);

                                    const patientName = `${appt.patient?.first_name ?? ""} ${appt.patient?.last_name ?? ""}`.trim().replace(/\s+/g, " ");
                                    const patientPhone = appt.patient?.phone ?? null;
                                    const patientEmail = appt.patient?.email ?? null;
                                    const durationMins = end && !Number.isNaN(end.getTime()) 
                                      ? Math.round((end.getTime() - start.getTime()) / 60000) 
                                      : null;
                                    const durationLabel = durationMins ? `${String(Math.floor(durationMins / 60)).padStart(2, "0")}:${String(durationMins % 60).padStart(2, "0")}h` : "";

                                    // Determine if tooltip should appear on left (for right-side items)
                                    const isRightSide = colIdx >= doctorColumns.length / 2;
                                    const tooltipPositionClass = isRightSide 
                                      ? "right-full mr-2" 
                                      : "left-full ml-2";

                                    return (
                                      <div
                                        key={`${ymd}-${doctorCol?.id ?? "all"}-${appt.id}`}
                                        className="group absolute"
                                        style={{
                                          top,
                                          height,
                                          left: `calc(${leftPercent}% + 2px)`,
                                          width: `calc(${widthPercent}% - 4px)`,
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() => openEditModalForAppointment(appt)}
                                          className={`w-full h-full rounded-md px-1 py-0.5 text-[10px] text-left shadow-sm overflow-hidden ${getAppointmentStatusColorClasses(appt.status)} ${getCategoryColor(category)}`}
                                        >
                                          <div className="flex items-center gap-1 truncate font-medium text-slate-800">
                                            {dayStatusIcon && <span className="flex-shrink-0">{dayStatusIcon}</span>}
                                            <span className="truncate">{patientName || serviceLabel}</span>
                                          </div>
                                          <div className="truncate text-[9px] text-slate-600">
                                            {timeLabel} {serviceLabel ? `• ${serviceLabel}` : ""}
                                          </div>
                                          {notes && (
                                            <div className="truncate text-[9px] text-slate-500 italic">
                                              {notes}
                                            </div>
                                          )}
                                        </button>
                                        {/* Hover tooltip - position based on column location */}
                                        <div className={`pointer-events-none absolute top-0 z-[100] hidden min-w-[280px] rounded-lg border border-slate-200 bg-white p-3 text-[11px] shadow-xl group-hover:block ${tooltipPositionClass}`}>
                                          <div className="font-semibold text-slate-800 mb-1">
                                            {formatYmd(date)} {timeLabel} {durationLabel && `(${durationLabel})`}
                                          </div>
                                          <div className="text-slate-700 font-medium">{patientName || "No Patient"}</div>
                                          {serviceLabel && <div className="text-slate-600 mt-1">{serviceLabel}</div>}
                                          {category && <div className="text-slate-500">Catégorie: {category}</div>}
                                          {patientPhone && (
                                            <div className="text-slate-500 mt-1">
                                              <span className="text-slate-400">privé:</span> {patientPhone}
                                            </div>
                                          )}
                                          {patientEmail && (
                                            <div className="text-slate-500">
                                              <span className="text-slate-400">privé:</span> {patientEmail}
                                            </div>
                                          )}
                                          {appt.location && <div className="text-slate-500 mt-1">📍 {appt.location}</div>}
                                          {notes && <div className="text-slate-600 mt-1 italic border-t border-slate-100 pt-1">📝 {notes}</div>}
                                        </div>
                                      </div>
                                    );
                                  });
                                })()}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
        {editModalOpen && editingAppointment ? (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                closeEditModal();
              }
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.75)]" style={{ touchAction: 'auto' } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Edit appointment</h2>
                <button
                  type="button"
                  onClick={closeEditModal}
                  className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 5l10 10" />
                    <path d="M15 5L5 15" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {/* Patient Information */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-700">Patient Information</p>
                  <div className="space-y-1">
                    {editingAppointment.patient?.id ? (
                      <Link
                        href={`/patients/${editingAppointment.patient.id}`}
                        className="text-[11px] text-sky-600 font-bold hover:text-sky-700 hover:underline"
                      >
                        {`${editingAppointment.patient.first_name ?? ""} ${editingAppointment.patient.last_name ?? ""}`.trim() || "Unknown patient"}
                      </Link>
                    ) : (
                      <p className="text-[11px] text-slate-800 font-medium">
                        Unknown patient
                      </p>
                    )}
                    {editingAppointment.patient?.email && (
                      <p className="text-[10px] text-slate-500">
                        {editingAppointment.patient.email}
                      </p>
                    )}
                    {editingAppointment.patient?.phone && (
                      <p className="text-[10px] text-slate-500">
                        {editingAppointment.patient.phone}
                      </p>
                    )}
                  </div>
                </div>

                {/* Appointment Details */}
                <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 space-y-2">
                  <p className="text-[11px] font-semibold text-slate-700">Appointment Details</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <p className="text-[10px] text-slate-500">Service</p>
                      <p className="text-[11px] text-slate-800">
                        {getServiceAndStatusFromReason(editingAppointment.reason).serviceLabel || "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-slate-500">Doctor</p>
                      <p className="text-[11px] text-slate-800">
                        {getDoctorNameFromReason(editingAppointment.reason) || editingAppointment.provider?.name || "—"}
                      </p>
                    </div>
                    <div className="relative col-span-2">
                      <p className="text-[10px] text-slate-500 mb-1">Category</p>
                      <input
                        type="text"
                        value={editCategorySearch}
                        onChange={(e) => {
                          setEditCategorySearch(e.target.value);
                          setEditCategoryDropdownOpen(true);
                        }}
                        onFocus={() => setEditCategoryDropdownOpen(true)}
                        placeholder="Search category..."
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                      />
                      {editCategory && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditCategory("");
                            setEditCategorySearch("");
                          }}
                          className="absolute right-2 top-6 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ×
                        </button>
                      )}
                      {editCategoryDropdownOpen && (
                        <div className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {APPOINTMENT_CATEGORY_OPTIONS.filter((opt) =>
                            opt.toLowerCase().includes(editCategorySearch.toLowerCase())
                          ).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setEditCategory(opt);
                                setEditCategorySearch(opt);
                                setEditCategoryDropdownOpen(false);
                              }}
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
                            >
                              <span className={`h-3 w-3 rounded-sm ${getCategoryColor(opt)}`} />
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="relative col-span-2">
                      <p className="text-[10px] text-slate-500 mb-1">Status/Channel</p>
                      <input
                        type="text"
                        value={editBookingStatusSearch}
                        onChange={(e) => {
                          setEditBookingStatusSearch(e.target.value);
                          setEditBookingStatusDropdownOpen(true);
                        }}
                        onFocus={() => setEditBookingStatusDropdownOpen(true)}
                        placeholder="Search status..."
                        className="w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] text-slate-800 focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400"
                      />
                      {editBookingStatus && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditBookingStatus("");
                            setEditBookingStatusSearch("");
                          }}
                          className="absolute right-2 top-6 text-slate-400 hover:text-slate-600 text-xs"
                        >
                          ×
                        </button>
                      )}
                      {editBookingStatusDropdownOpen && (
                        <div className="absolute z-50 mt-1 max-h-40 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg">
                          {BOOKING_STATUS_OPTIONS.filter((opt) =>
                            opt.toLowerCase().includes(editBookingStatusSearch.toLowerCase())
                          ).map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => {
                                setEditBookingStatus(opt);
                                setEditBookingStatusSearch(opt);
                                setEditBookingStatusDropdownOpen(false);
                              }}
                              className="flex w-full items-center gap-2 px-2 py-1.5 text-left text-[11px] text-slate-700 hover:bg-slate-50"
                            >
                              <span className="w-4 text-center">{getStatusIcon(opt)}</span>
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-2 pt-2 border-t border-slate-200">
                    <p className="text-[10px] text-slate-500 mb-1">Notes</p>
                    <textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={3}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="Add notes for this appointment"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Workflow status</p>
                  <div className="inline-flex flex-wrap gap-1">
                    {(["pending", "approved", "rescheduled", "cancelled"] as WorkflowStatus[]).map(
                      (status) => (
                        <button
                          key={status}
                          type="button"
                          onClick={() => setEditWorkflowStatus(status)}
                          className={`inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-medium shadow-sm ${
                            editWorkflowStatus === status
                              ? "bg-sky-600 text-white"
                              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                          }`}
                        >
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </button>
                      ),
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Date &amp; time</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={editDate}
                      onChange={(event) => setEditDate(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <input
                      type="time"
                      value={editTime}
                      onChange={(event) => setEditTime(event.target.value)}
                      step={15 * 60}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Consultation duration</p>
                  <div className="relative">
                    <input
                      type="text"
                      value={editDurationSearch}
                      onChange={(e) => {
                        setEditDurationSearch(e.target.value);
                        setEditDurationDropdownOpen(true);
                      }}
                      onFocus={() => setEditDurationDropdownOpen(true)}
                      placeholder="Search duration..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {editConsultationDuration > 0 && editDurationSearch && (
                      <button
                        type="button"
                        onClick={() => { setEditConsultationDuration(15); setEditDurationSearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {editDurationDropdownOpen && filteredEditDurationOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {filteredEditDurationOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setEditConsultationDuration(opt.value);
                              setEditDurationSearch(opt.label);
                              setEditDurationDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left hover:bg-sky-50 ${editConsultationDuration === opt.value ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Location</p>
                  <select
                    value={editLocation}
                    onChange={(event) => setEditLocation(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">
                      {CLINIC_LOCATION_OPTIONS.length === 0
                        ? "No locations available"
                        : "Select location"}
                    </option>
                    {CLINIC_LOCATION_OPTIONS.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              {editError ? (
                <p className="mt-2 text-[11px] text-red-600">{editError}</p>
              ) : null}
              
              {/* Delete confirmation */}
              {showDeleteConfirm && (
                <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <p className="text-[11px] font-medium text-red-800 mb-2">
                    Are you sure you want to delete this appointment? This action cannot be undone.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void handleDeleteAppointment()}
                      disabled={deletingAppointment}
                      className="inline-flex items-center rounded-full border border-red-500/80 bg-red-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {deletingAppointment ? "Deleting..." : "Yes, delete"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={deletingAppointment}
                      className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-60"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
              
              <div className="mt-4 flex items-center justify-between">
                {/* Delete button on left */}
                <button
                  type="button"
                  onClick={() => setShowDeleteConfirm(true)}
                  disabled={savingEdit || deletingAppointment || showDeleteConfirm}
                  className="inline-flex items-center gap-1 rounded-full border border-red-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-red-600 shadow-sm hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  Delete
                </button>
                
                {/* Other buttons on right */}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (editingAppointment) {
                        handleCopyAppointment(editingAppointment);
                        closeEditModal();
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    Copy
                  </button>
                  <button
                    type="button"
                    onClick={closeEditModal}
                    className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Close
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveEditAppointment()}
                    disabled={savingEdit}
                    className="inline-flex items-center rounded-full border border-sky-500/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {createModalOpen ? (
          <div 
            className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            onClick={(e) => {
              if (e.target === e.currentTarget && !savingCreate) {
                setCreateModalOpen(false);
              }
            }}
          >
            <div 
              className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.65)]" 
              style={{ touchAction: 'auto' } as React.CSSProperties}
              onClick={(e) => {
                // Close dropdowns only if clicking on the modal background, not on inputs
                if ((e.target as HTMLElement).tagName !== 'INPUT' && 
                    (e.target as HTMLElement).tagName !== 'TEXTAREA' &&
                    (e.target as HTMLElement).tagName !== 'SELECT' &&
                    (e.target as HTMLElement).tagName !== 'BUTTON') {
                  closeAllCreateDropdowns();
                }
              }}
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">Add appointment</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (savingCreate) return;
                    setCreateModalOpen(false);
                  }}
                  className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 5l10 10" />
                    <path d="M15 5L5 15" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 space-y-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-[11px] font-medium text-slate-600">Patient</p>
                    <button
                      type="button"
                      onClick={() => {
                        setNewPatientFirstName("");
                        setNewPatientLastName("");
                        setNewPatientEmail("");
                        setNewPatientPhone("");
                        setNewPatientGender("");
                        setNewPatientSource("manual");
                        setNewPatientError(null);
                        setSavingNewPatient(false);
                        setNewPatientModalOpen(true);
                      }}
                      className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 text-emerald-600 shadow-sm hover:bg-emerald-100"
                    >
                      <svg
                        className="h-3 w-3"
                        viewBox="0 0 20 20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M10 4v12" />
                        <path d="M4 10h12" />
                      </svg>
                    </button>
                  </div>
                  <div className="relative">
                    <input
                      type="text"
                      value={createPatientSearch}
                      onChange={(event) => {
                        setCreatePatientSearch(event.target.value);
                        setShowCreatePatientSuggestions(true);
                        setCreatePatientId(null);
                        setCreatePatientName("");
                      }}
                      onFocus={() => { closeAllCreateDropdowns("patient"); setShowCreatePatientSuggestions(true); }}
                      placeholder="Select patient"
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {showCreatePatientSuggestions ? (
                      <div className="absolute z-20 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {patientOptionsLoading ? (
                          <div className="px-3 py-1.5 text-[11px] text-slate-500">
                            Loading patients...
                          </div>
                        ) : filteredCreatePatientSuggestions.length === 0 ? (
                          <div className="px-3 py-1.5 text-[11px] text-slate-500">
                            No patients found
                          </div>
                        ) : (
                          filteredCreatePatientSuggestions.map((p) => {
                            const name = `${p.first_name ?? ""} ${p.last_name ?? ""}`
                              .trim() || "Unnamed patient";
                            const details =
                              p.email || p.phone || "No contact details";
                            return (
                              <button
                                key={p.id}
                                type="button"
                                className="flex w-full flex-col items-start px-3 py-1.5 text-left hover:bg-slate-50"
                                onClick={() => {
                                  setCreatePatientId(p.id);
                                  setCreatePatientName(name);
                                  setCreatePatientSearch(name);
                                  setShowCreatePatientSuggestions(false);
                                  setDraftTitle(`Consultation for ${name}`);
                                }}
                              >
                                <span className="text-[11px] font-medium text-slate-800">
                                  {name}
                                </span>
                                <span className="text-[10px] text-slate-500">
                                  {details}
                                </span>
                              </button>
                            );
                          })
                        )}
                      </div>
                    ) : null}
                  </div>
                  {patientOptionsError ? (
                    <p className="text-[10px] text-red-600">
                      {patientOptionsError}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <input
                    type="text"
                    value={draftTitle}
                    onChange={(event) => setDraftTitle(event.target.value)}
                    className="w-full border-b border-slate-200 bg-transparent px-0 pb-1 text-sm font-semibold text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none"
                    placeholder="Add title"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Doctor calendar</p>
                  <select
                    value={createDoctorCalendarId}
                    onChange={(event) => {
                      const newId = event.target.value;
                      setCreateDoctorCalendarId(newId);
                      // Apply doctor-specific scheduling defaults
                      const config = doctorSchedulingSettings.find((s) => s.provider_id === newId);
                      if (config) {
                        setConsultationDuration(config.default_duration_minutes);
                        const durOpt = CONSULTATION_DURATION_OPTIONS.find((o) => o.value === config.default_duration_minutes);
                        setDurationSearch(durOpt ? durOpt.label : `${config.default_duration_minutes} minutes`);
                      } else {
                        setConsultationDuration(15);
                        setDurationSearch("15 minutes");
                      }
                      // Reset time selection since interval may have changed
                      setDraftTime("");
                      setTimeSearch("");
                    }}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  >
                    <option value="">
                      {doctorCalendars.length === 0
                        ? "No doctor calendars available"
                        : "Select doctor"}
                    </option>
                    {doctorCalendars.map((calendar) => (
                      <option key={calendar.id} value={calendar.id}>
                        {calendar.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Date &amp; time</p>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="date"
                      value={draftDate}
                      onChange={(event) => {
                        setDraftDate(event.target.value);
                        setDraftTime("");
                        setTimeSearch("");
                      }}
                      min={isSystemUser ? undefined : new Date().toISOString().split('T')[0]}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    <div className="relative">
                      <input
                        type="text"
                        value={timeSearch}
                        onChange={(e) => {
                          setTimeSearch(e.target.value);
                          setTimeDropdownOpen(true);
                          if (!e.target.value.trim()) {
                            setDraftTime("");
                          }
                        }}
                        onFocus={() => { closeAllCreateDropdowns("time"); setTimeDropdownOpen(true); }}
                        placeholder={!draftDate ? "Select date first" : "Search time..."}
                        disabled={!draftDate}
                        className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:cursor-not-allowed disabled:bg-slate-100"
                      />
                      {draftTime && (
                        <button
                          type="button"
                          onClick={() => { setDraftTime(""); setTimeSearch(""); }}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      )}
                      {timeDropdownOpen && draftDate && filteredTimeOptions.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                          {filteredTimeOptions.map((opt) => (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setDraftTime(opt.value);
                                setTimeSearch(opt.label);
                                setTimeDropdownOpen(false);
                              }}
                              className={`w-full px-3 py-1.5 text-left hover:bg-sky-50 ${draftTime === opt.value ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Service</p>
                  <div className="relative">
                    <input
                      type="text"
                      value={serviceSearch}
                      onChange={(e) => {
                        setServiceSearch(e.target.value);
                        setServiceDropdownOpen(true);
                        if (!e.target.value.trim()) {
                          setSelectedServiceId("");
                        }
                      }}
                      onFocus={() => { closeAllCreateDropdowns("service"); setServiceDropdownOpen(true); }}
                      placeholder={serviceOptionsLoading ? "Loading..." : "Search service..."}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {selectedServiceId && (
                      <button
                        type="button"
                        onClick={() => { setSelectedServiceId(""); setServiceSearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {serviceDropdownOpen && filteredServiceOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {filteredServiceOptions.map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setSelectedServiceId(opt.id);
                              setServiceSearch(opt.name);
                              setServiceDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left hover:bg-sky-50 ${selectedServiceId === opt.id ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                          >
                            {opt.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {serviceOptionsError && <p className="text-[10px] text-red-600">{serviceOptionsError}</p>}
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Status</p>
                  <div className="relative">
                    <div className="flex items-center">
                      {bookingStatus && getStatusIcon(bookingStatus) && (
                        <span className="absolute left-2 z-10 text-sm">{getStatusIcon(bookingStatus)}</span>
                      )}
                      <input
                        type="text"
                        value={statusSearch}
                        onChange={(e) => {
                          setStatusSearch(e.target.value);
                          setStatusDropdownOpen(true);
                          if (!e.target.value.trim()) {
                            setBookingStatus("");
                          }
                        }}
                        onFocus={() => { closeAllCreateDropdowns("status"); setStatusDropdownOpen(true); }}
                        placeholder="Search status..."
                        className={`w-full rounded-lg border border-slate-200 bg-slate-50/80 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${bookingStatus && getStatusIcon(bookingStatus) ? "pl-7 pr-3" : "px-3"}`}
                      />
                    </div>
                    {bookingStatus && (
                      <button
                        type="button"
                        onClick={() => { setBookingStatus(""); setStatusSearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {statusDropdownOpen && filteredStatusOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {filteredStatusOptions.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setBookingStatus(opt);
                              setStatusSearch(opt);
                              setStatusDropdownOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sky-50 ${bookingStatus === opt ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                          >
                            <span className="w-4 text-center flex-shrink-0">{getStatusIcon(opt)}</span>
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Category</p>
                  <div className="relative">
                    <div className="flex items-center">
                      {appointmentCategory && (
                        <span className={`absolute left-2 z-10 h-3 w-3 rounded-sm ${getCategoryColor(appointmentCategory)}`} />
                      )}
                      <input
                        type="text"
                        value={categorySearch}
                        onChange={(e) => {
                          setCategorySearch(e.target.value);
                          setCategoryDropdownOpen(true);
                          if (!e.target.value.trim()) {
                            setAppointmentCategory("");
                          }
                        }}
                        onFocus={() => { closeAllCreateDropdowns("category"); setCategoryDropdownOpen(true); }}
                        placeholder="Search category..."
                        className={`w-full rounded-lg border border-slate-200 bg-slate-50/80 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 ${appointmentCategory ? "pl-7 pr-3" : "px-3"}`}
                      />
                    </div>
                    {appointmentCategory && (
                      <button
                        type="button"
                        onClick={() => { setAppointmentCategory(""); setCategorySearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {categoryDropdownOpen && filteredCategoryOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {filteredCategoryOptions.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setAppointmentCategory(opt);
                              setCategorySearch(opt);
                              setCategoryDropdownOpen(false);
                            }}
                            className={`flex w-full items-center gap-2 px-3 py-1.5 text-left hover:bg-sky-50 ${appointmentCategory === opt ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                          >
                            <span className={`h-3 w-3 rounded-sm flex-shrink-0 ${getCategoryColor(opt)}`} />
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Location</p>
                  <div className="relative">
                    <input
                      type="text"
                      value={locationSearch}
                      onChange={(e) => {
                        setLocationSearch(e.target.value);
                        setLocationDropdownOpen(true);
                        if (!e.target.value.trim()) {
                          setDraftLocation("");
                        }
                      }}
                      onFocus={() => { closeAllCreateDropdowns("location"); setLocationDropdownOpen(true); }}
                      placeholder="Search location..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {draftLocation && (
                      <button
                        type="button"
                        onClick={() => { setDraftLocation(""); setLocationSearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {locationDropdownOpen && filteredLocationOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {filteredLocationOptions.map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            onClick={() => {
                              setDraftLocation(opt);
                              setLocationSearch(opt);
                              setLocationDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left hover:bg-sky-50 ${draftLocation === opt ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                          >
                            {opt}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Consultation duration</p>
                  <div className="relative">
                    <input
                      type="text"
                      value={durationSearch}
                      onChange={(e) => {
                        setDurationSearch(e.target.value);
                        setDurationDropdownOpen(true);
                      }}
                      onFocus={() => { closeAllCreateDropdowns("duration"); setDurationDropdownOpen(true); }}
                      placeholder="Search duration..."
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                    {consultationDuration > 0 && durationSearch && (
                      <button
                        type="button"
                        onClick={() => { setConsultationDuration(15); setDurationSearch(""); }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    )}
                    {durationDropdownOpen && filteredDurationOptions.length > 0 && (
                      <div className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg">
                        {filteredDurationOptions.map((opt) => (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setConsultationDuration(opt.value);
                              setDurationSearch(opt.label);
                              setDurationDropdownOpen(false);
                            }}
                            className={`w-full px-3 py-1.5 text-left hover:bg-sky-50 ${consultationDuration === opt.value ? "bg-sky-50 text-sky-700" : "text-slate-700"}`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Description</p>
                  <textarea
                    value={draftDescription}
                    onChange={(event) => setDraftDescription(event.target.value)}
                    rows={3}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    placeholder="Add notes for this appointment"
                  />
                </div>
              </div>
              {createError ? (
                <p className="mt-2 text-[11px] text-red-600">{createError}</p>
              ) : null}
              <div className="mt-4 flex items-center justify-between gap-2">
                <button
                  type="button"
                  className="text-[11px] font-medium text-sky-600 hover:underline hover:underline-offset-2"
                >
                  More options
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      if (savingCreate) return;
                      setCreateModalOpen(false);
                    }}
                    className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleSaveAppointment()}
                    disabled={savingCreate}
                    className="inline-flex items-center rounded-full border border-sky-500/80 bg-sky-600 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : null}
        {newPatientModalOpen ? (
          <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50"
            style={{ WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
            onClick={(e) => {
              if (e.target === e.currentTarget && !savingNewPatient) {
                setNewPatientModalOpen(false);
              }
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-slate-200/80 bg-white p-4 text-xs shadow-[0_24px_60px_rgba(15,23,42,0.75)]" style={{ touchAction: 'auto' } as React.CSSProperties}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-900">New patient</h2>
                <button
                  type="button"
                  onClick={() => {
                    if (savingNewPatient) return;
                    setNewPatientModalOpen(false);
                  }}
                  className="ml-2 inline-flex h-6 w-6 items-center justify-center rounded-full border border-slate-200/80 bg-white text-slate-500 shadow-sm hover:bg-slate-50"
                >
                  <span className="sr-only">Close</span>
                  <svg
                    className="h-3 w-3"
                    viewBox="0 0 20 20"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M5 5l10 10" />
                    <path d="M15 5L5 15" />
                  </svg>
                </button>
              </div>
              <div className="mt-3 space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-slate-600">First name</p>
                    <input
                      type="text"
                      value={newPatientFirstName}
                      onChange={(event) => setNewPatientFirstName(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-slate-600">Last name</p>
                    <input
                      type="text"
                      value={newPatientLastName}
                      onChange={(event) => setNewPatientLastName(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    />
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Email</p>
                  <input
                    type="email"
                    value={newPatientEmail}
                    onChange={(event) => setNewPatientEmail(event.target.value)}
                    className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                  />
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-medium text-slate-600">Phone</p>
                  <div className="flex gap-2">
                    <select
                      defaultValue="+41"
                      className="w-24 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="+41">🇨🇭 +41</option>
                      <option value="+1">🇫🇷 +33</option>
                      <option value="+971">🇦🇪 +971</option>
                      <option value="+44">🇬🇧 +44</option>
                      <option value="+1">🇺🇸 +1</option>
                    </select>
                    <input
                      type="tel"
                      value={newPatientPhone}
                      onChange={(event) => setNewPatientPhone(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                      placeholder="79 123 45 67"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-slate-600">Gender</p>
                    <select
                      value={newPatientGender}
                      onChange={(event) => setNewPatientGender(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="">Select</option>
                      <option value="male">Male</option>
                      <option value="female">Female</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div className="space-y-1">
                    <p className="text-[11px] font-medium text-slate-600">Source</p>
                    <select
                      value={newPatientSource}
                      onChange={(event) => setNewPatientSource(event.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-900 shadow-sm focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                    >
                      <option value="manual">Manual</option>
                      <option value="event">Event</option>
                      <option value="meta">Meta</option>
                      <option value="google">Google</option>
                    </select>
                  </div>
                </div>
                {newPatientError ? (
                  <p className="text-[11px] text-red-600">{newPatientError}</p>
                ) : null}
              </div>
              <div className="mt-4 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (savingNewPatient) return;
                    setNewPatientModalOpen(false);
                  }}
                  className="inline-flex items-center rounded-full border border-slate-200/80 bg-white px-3 py-1.5 text-[11px] font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => void handleCreateNewPatient()}
                  disabled={savingNewPatient}
                  className="inline-flex items-center rounded-full border border-emerald-500/80 bg-emerald-500 px-3 py-1.5 text-[11px] font-medium text-white shadow-sm hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {savingNewPatient ? "Saving..." : "Save patient"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
