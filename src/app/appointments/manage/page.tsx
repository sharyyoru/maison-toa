"use client";

import { useEffect, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";
import { formatSwissYmd, getSwissToday, parseSwissDate } from "@/lib/swissTimezone";

const LOGO_URL = "https://cdn.jsdelivr.net/gh/sharyyoru/maison-toa@main/public/logos/maisontoa-logo.png";

interface AppointmentDetails {
  id: string;
  doctorName: string;
  doctorSlug: string;
  formattedDate: string;
  formattedTime: string;
  rawDate: string;
  rawTime: string;
  service: string;
  location: string;
  status: string;
}

const DAYS_FR = ["Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam"];
const DAYS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS_FR = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
const MONTHS_EN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatShortDate(dateStr: string, language: string): string {
  const d = parseSwissDate(dateStr);
  const day = d.getDate();
  const month = language === "fr" ? MONTHS_FR[d.getMonth()] : MONTHS_EN[d.getMonth()];
  return `${day} ${month}`;
}

function formatDayName(dateStr: string, language: string): string {
  const d = parseSwissDate(dateStr);
  const dow = d.getDay();
  return language === "fr" ? DAYS_FR[dow] : DAYS_EN[dow];
}

function getWeekDates(pivotDate: string, weeksOffset: number): string[] {
  const d = parseSwissDate(pivotDate);
  // Move to Monday of the current week
  const dow = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (dow === 0 ? 6 : dow - 1) + weeksOffset * 7);
  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    dates.push(formatSwissYmd(day));
  }
  return dates;
}

function ManageContent() {
  const searchParams = useSearchParams();
  const appointmentId = searchParams.get("id");
  const action = searchParams.get("action") as "cancel" | "reschedule" | null;
  const { language, t } = useLanguage();
  const fr = language === "fr";

  const [appt, setAppt] = useState<AppointmentDetails | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [doneAction, setDoneAction] = useState<"cancel" | "reschedule">("cancel");

  // Reschedule state
  const [weeksOffset, setWeeksOffset] = useState(0);
  const [selectedDate, setSelectedDate] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedTime, setSelectedTime] = useState("");
  // Map of date → whether it has any open slots (for disabling fully-booked days)
  const [weekSlotAvailability, setWeekSlotAvailability] = useState<Record<string, boolean>>({});
  const [weekChecking, setWeekChecking] = useState(false);

  const today = formatSwissYmd(getSwissToday());

  useEffect(() => {
    if (!appointmentId) {
      setLoadError(fr ? "Identifiant de rendez-vous manquant." : "Missing appointment ID.");
      setLoading(false);
      return;
    }
    fetch(`/api/public/appointment?id=${appointmentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) {
          setLoadError(data.error);
        } else {
          setAppt(data);
        }
      })
      .catch(() => setLoadError(fr ? "Impossible de charger le rendez-vous." : "Unable to load appointment."))
      .finally(() => setLoading(false));
  }, [appointmentId]);

  // Pre-fetch slot availability for all visible week dates so fully-booked days can be grayed out
  useEffect(() => {
    if (!appt || action !== "reschedule") return;
    const pivotDate = appt.rawDate ?? today;
    const allWeekDates = getWeekDates(pivotDate, weeksOffset);
    const futureDates = allWeekDates.filter(d => d > today);
    if (futureDates.length === 0) return;

    setWeekChecking(true);
    Promise.all(
      futureDates.map(dateStr =>
        fetch(`/api/public/appointment/slots?doctorSlug=${appt.doctorSlug}&date=${dateStr}&excludeId=${appt.id}`)
          .then(r => r.json())
          .then(data => ({ dateStr, hasSlots: (data.availableSlots ?? []).length > 0 }))
          .catch(() => ({ dateStr, hasSlots: false }))
      )
    ).then(results => {
      const map: Record<string, boolean> = {};
      for (const { dateStr, hasSlots } of results) {
        map[dateStr] = hasSlots;
      }
      setWeekSlotAvailability(prev => ({ ...prev, ...map }));
    }).finally(() => setWeekChecking(false));
  }, [appt, weeksOffset, action, today]);

  // Fetch slots when date is selected
  useEffect(() => {
    if (!selectedDate || !appt) return;
    setSlotsLoading(true);
    setSelectedTime("");
    fetch(`/api/public/appointment/slots?doctorSlug=${appt.doctorSlug}&date=${selectedDate}&excludeId=${appt.id}`)
      .then(r => r.json())
      .then(data => setAvailableSlots(data.availableSlots ?? []))
      .catch(() => setAvailableSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [selectedDate, appt]);

  async function handleCancel() {
    if (!appointmentId) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/public/appointment/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: appointmentId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to cancel");
      setDoneAction("cancel");
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleReschedule() {
    if (!appointmentId || !selectedDate || !selectedTime) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const newAppointmentDate = `${selectedDate}T${selectedTime}`;
      const res = await fetch("/api/public/appointment/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: appointmentId, newAppointmentDate }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to reschedule");
      setDoneAction("reschedule");
      setDone(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setSubmitting(false);
    }
  }

  // --- Week dates for the reschedule date picker ---
  const pivotDate = appt?.rawDate ?? today;
  const weekDates = getWeekDates(pivotDate, weeksOffset).filter(d => d >= today);
  const canGoPrev = weeksOffset > 0;

  const isDateAvailable = (dateStr: string) => {
    if (!appt) return false;
    // If we've already checked this date, use the cached result
    if (dateStr in weekSlotAvailability) return weekSlotAvailability[dateStr];
    // While checking, treat as unavailable to avoid false positives
    return false;
  };

  // --- Shared: appointment summary card ---
  const SummaryCard = () => (
    <div style={{ border: "1px solid #e8e3db", borderRadius: 4 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {[
            [fr ? "PRATICIEN" : "PRACTITIONER", appt!.doctorName],
            ["DATE", appt!.formattedDate],
            [fr ? "HEURE" : "TIME", appt!.formattedTime],
            [fr ? "SOIN" : "TREATMENT", appt!.service],
            [fr ? "LIEU" : "LOCATION", appt!.location],
          ].map(([label, value]) => (
            <tr key={label} style={{ borderBottom: "1px solid #f0ece5" }}>
              <td style={{ padding: "12px 16px", color: "#8a8578", fontSize: 11, letterSpacing: "0.06em", width: "42%", verticalAlign: "top" }}>
                {label}
              </td>
              <td style={{ padding: "12px 16px", color: "#1a1a18", fontSize: 14, textAlign: "right", verticalAlign: "top" }}>
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  // --- Loading ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1a1a18] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // --- Load error ---
  if (loadError || !appt || !action) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <Image src={LOGO_URL} alt="Maison Tóā" width={90} height={40} className="mx-auto mb-6 h-10 w-auto" unoptimized />
          <p className="text-[#1a1a18] font-medium mb-2">{fr ? "Lien invalide" : "Invalid link"}</p>
          <p className="text-[#8a8578] text-sm mb-6">{loadError ?? (fr ? "Ce lien est invalide ou expiré." : "This link is invalid or expired.")}</p>
          <Link href="/book-appointment" className="inline-block bg-[#1a1a18] text-white text-sm px-6 py-3 rounded-lg">
            {fr ? "Prendre un rendez-vous" : "Book an appointment"}
          </Link>
        </div>
      </div>
    );
  }

  // --- Success state ---
  if (done) {
    return (
      <div className="min-h-screen bg-[#f5f3ef] flex items-center justify-center p-6">
        <div className="bg-white rounded-2xl shadow p-8 max-w-sm w-full text-center">
          <Image src={LOGO_URL} alt="Maison Tóā" width={90} height={40} className="mx-auto mb-6 h-10 w-auto" unoptimized />
          <div className="w-12 h-12 rounded-full bg-[#f5f3ef] flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-[#1a1a18]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <p className="text-[#1a1a18] font-medium text-lg mb-2">
            {doneAction === "cancel"
              ? (fr ? "Rendez-vous annulé" : "Appointment cancelled")
              : (fr ? "Rendez-vous modifié" : "Appointment rescheduled")
            }
          </p>
          <p className="text-[#8a8578] text-sm mb-6">
            {doneAction === "cancel"
              ? (fr ? "Vous recevrez un email de confirmation." : "A confirmation email has been sent to you.")
              : (fr ? "Votre nouveau rendez-vous a été confirmé par email." : "Your new appointment has been confirmed by email.")
            }
          </p>
          <Link href="/book-appointment" className="inline-block bg-[#1a1a18] text-white text-sm px-6 py-3 rounded-lg">
            {fr ? "Prendre un rendez-vous" : "Book an appointment"}
          </Link>
        </div>
      </div>
    );
  }

  // --- Cancel view ---
  if (action === "cancel") {
    return (
      <div className="min-h-screen bg-[#f5f3ef]">
        <div className="max-w-lg mx-auto px-4 py-12">
          {/* Header */}
          <div className="flex items-center justify-between mb-10">
            <Image src={LOGO_URL} alt="Maison Tóā" width={90} height={40} className="h-10 w-auto" unoptimized />
            <LanguageToggle />
          </div>

          <div className="bg-white rounded-2xl shadow p-6 md:p-8">
            <h1 className="text-xl font-semibold text-[#1a1a18] mb-1">
              {fr ? "Annuler votre rendez-vous" : "Cancel your appointment"}
            </h1>
            <p className="text-sm text-[#8a8578] mb-6">
              {fr ? "Veuillez vérifier les détails ci-dessous avant de confirmer." : "Please review the details below before confirming."}
            </p>

            <SummaryCard />

            <div className="mt-6 p-4 bg-[#fdf8f2] border border-[#f0ece5] rounded-lg">
              <p className="text-sm text-[#4a4742]">
                {fr
                  ? "Êtes-vous certain(e) de vouloir annuler ce rendez-vous ? Cette action est irréversible."
                  : "Are you sure you want to cancel this appointment? This action cannot be undone."
                }
              </p>
              <p className="text-xs text-[#8a8578] mt-1">
                {fr
                  ? "Les annulations doivent être effectuées au moins 24 heures à l'avance."
                  : "Cancellations must be made at least 24 hours in advance."
                }
              </p>
            </div>

            {submitError && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                {submitError}
              </div>
            )}

            <div className="mt-6 flex flex-col gap-3">
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="w-full bg-[#1a1a18] text-white py-3.5 rounded-lg text-sm font-medium disabled:opacity-50"
              >
                {submitting
                  ? (fr ? "Annulation en cours..." : "Cancelling...")
                  : (fr ? "Confirmer l'annulation" : "Confirm cancellation")
                }
              </button>
              <Link
                href={`/appointments/manage?id=${appt.id}&action=reschedule`}
                className="w-full border border-[#e8e3db] text-[#1a1a18] py-3.5 rounded-lg text-sm font-medium text-center"
              >
                {fr ? "Modifier plutôt mon rendez-vous" : "Reschedule instead"}
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // --- Reschedule view ---
  const allWeekDates = getWeekDates(pivotDate, weeksOffset);
  const todayStr = today;

  return (
    <div className="min-h-screen bg-[#f5f3ef]">
      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Header */}
        <div className="flex items-center justify-between mb-10">
          <Image src={LOGO_URL} alt="Maison Tóā" width={90} height={40} className="h-10 w-auto" unoptimized />
          <LanguageToggle />
        </div>

        <div className="bg-white rounded-2xl shadow p-6 md:p-8">
          <h1 className="text-xl font-semibold text-[#1a1a18] mb-1">
            {fr ? "Modifier votre rendez-vous" : "Reschedule your appointment"}
          </h1>
          <p className="text-sm text-[#8a8578] mb-6">
            {fr ? "Rendez-vous actuel" : "Current appointment"}
          </p>

          <SummaryCard />

          {/* Date picker */}
          <div className="mt-8">
            <p className="text-xs text-[#8a8578] uppercase tracking-widest mb-4 font-medium">
              {fr ? "Choisir une nouvelle date" : "Select a new date"}
            </p>

            {/* Week navigator */}
            <div className="flex items-center justify-between mb-3">
              <button
                onClick={() => { setWeeksOffset(w => Math.max(0, w - 1)); setSelectedDate(""); }}
                disabled={!canGoPrev}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[#e8e3db] text-[#1a1a18] disabled:opacity-30"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm text-[#4a4742]">
                {formatShortDate(allWeekDates[0], language)} – {formatShortDate(allWeekDates[6], language)}
              </span>
              <button
                onClick={() => { setWeeksOffset(w => w + 1); setSelectedDate(""); }}
                className="w-8 h-8 flex items-center justify-center rounded-full border border-[#e8e3db] text-[#1a1a18]"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {weekChecking && (
              <div className="flex justify-center py-2">
                <div className="w-4 h-4 border-2 border-[#1a1a18] border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div className="grid grid-cols-7 gap-1">
              {allWeekDates.map(dateStr => {
                const isPast = dateStr <= todayStr;
                const isAvail = !isPast && isDateAvailable(dateStr);
                const isSelected = selectedDate === dateStr;
                return (
                  <button
                    key={dateStr}
                    disabled={!isAvail}
                    onClick={() => setSelectedDate(dateStr)}
                    className={`flex flex-col items-center py-2 px-1 rounded-lg text-xs transition-colors
                      ${isSelected ? "bg-[#1a1a18] text-white" : ""}
                      ${isAvail && !isSelected ? "hover:bg-[#f5f3ef] text-[#1a1a18] cursor-pointer" : ""}
                      ${!isAvail ? "text-[#d0cbc4] cursor-not-allowed" : ""}
                    `}
                  >
                    <span className="font-medium">{formatDayName(dateStr, language)}</span>
                    <span className="text-[11px] mt-0.5">{formatShortDate(dateStr, language)}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Time slots */}
          {selectedDate && (
            <div className="mt-6">
              <p className="text-xs text-[#8a8578] uppercase tracking-widest mb-3 font-medium">
                {fr ? "Horaires disponibles" : "Available times"}
              </p>
              {slotsLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-5 h-5 border-2 border-[#1a1a18] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : availableSlots.length === 0 ? (
                <p className="text-sm text-[#8a8578] text-center py-3">
                  {fr ? "Aucun créneau disponible ce jour-là." : "No available slots on this day."}
                </p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {availableSlots.map(slot => (
                    <button
                      key={slot}
                      onClick={() => setSelectedTime(slot)}
                      className={`py-2.5 rounded-lg text-sm border transition-colors
                        ${selectedTime === slot
                          ? "bg-[#1a1a18] text-white border-[#1a1a18]"
                          : "border-[#e8e3db] text-[#1a1a18] hover:border-[#1a1a18]"
                        }`}
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {submitError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {submitError}
            </div>
          )}

          {/* Confirm button */}
          <div className="mt-6 flex flex-col gap-3">
            <button
              onClick={handleReschedule}
              disabled={!selectedDate || !selectedTime || submitting}
              className="w-full bg-[#1a1a18] text-white py-3.5 rounded-lg text-sm font-medium disabled:opacity-40"
            >
              {submitting
                ? (fr ? "Modification en cours..." : "Rescheduling...")
                : (fr ? "Confirmer la modification" : "Confirm reschedule")
              }
            </button>
            <Link
              href={`/appointments/manage?id=${appt.id}&action=cancel`}
              className="w-full border border-[#e8e3db] text-[#1a1a18] py-3.5 rounded-lg text-sm font-medium text-center"
            >
              {fr ? "Annuler plutôt mon rendez-vous" : "Cancel instead"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function ManagePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-[#f5f3ef] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#1a1a18] border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <ManageContent />
    </Suspense>
  );
}
