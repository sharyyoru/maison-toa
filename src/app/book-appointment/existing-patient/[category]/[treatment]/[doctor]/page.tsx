"use client";

import { useState, useEffect, Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabaseClient } from "@/lib/supabaseClient";
import { getSwissToday, formatSwissYmd, parseSwissDate, getSwissDayOfWeek, formatSwissDateWithWeekday, getSwissDayRange, getSwissSlotString, createSwissDateTime, SWISS_TIMEZONE } from "@/lib/swissTimezone";
import { pushToDataLayer } from "@/components/GoogleTagManager";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageToggle } from "@/components/LanguageToggle";

interface DoctorInfo {
  name: string;
  specialty: string;
  image: string;
  email: string;
  description: string;
}

// Default slot window Mon–Sat for all doctors.
// Day 0 = Sunday (no slots), 1 = Monday … 6 = Saturday.
// Actual availability is determined by the real calendar: blocking appointments
// (no_patient = true, e.g. VACANCES / STOP / PAUSE) remove overlapping slots,
// and booked patient appointments remove their overlapping slots too.
const ALL_WEEK_SLOTS = {
  1: { start: "09:00", end: "18:00" },
  2: { start: "09:00", end: "18:00" },
  3: { start: "09:00", end: "18:00" },
  4: { start: "09:00", end: "18:00" },
  5: { start: "09:00", end: "18:00" },
  6: { start: "09:00", end: "18:00" },
};

const DOCTOR_AVAILABILITY: Record<string, Record<string, Record<number, { start: string; end: string }>>> = {
  "sophie-nordback":   { lausanne: ALL_WEEK_SLOTS },
  "alexandra-miles":   { lausanne: ALL_WEEK_SLOTS },
  "reda-benani":       { lausanne: ALL_WEEK_SLOTS },
  "adnan-plakalo":     { lausanne: ALL_WEEK_SLOTS },
  "natalia-koltunova":    { lausanne: ALL_WEEK_SLOTS },
  "laetitia-guarino":     { lausanne: ALL_WEEK_SLOTS },
  "ophelie-perrin":       { lausanne: ALL_WEEK_SLOTS },
  "claire-balbo":         { lausanne: ALL_WEEK_SLOTS },
  "juliette-le-mentec":   { lausanne: ALL_WEEK_SLOTS },
  "gwendoline-boursault": { lausanne: ALL_WEEK_SLOTS },
};

function parseLocalDate(dateStr: string): Date {
  return parseSwissDate(dateStr);
}

function generateTimeSlots(doctorSlug: string, locationId: string, dateStr: string): string[] {
  const date = parseLocalDate(dateStr);
  const dayOfWeek = date.getDay();
  const availability = DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek]
    ?? ALL_WEEK_SLOTS[dayOfWeek as keyof typeof ALL_WEEK_SLOTS];
  
  if (!availability) {
    return [];
  }

  const slots: string[] = [];
  const [startHour, startMin] = availability.start.split(":").map(Number);
  const [endHour, endMin] = availability.end.split(":").map(Number);
  
  let currentHour = startHour;
  let currentMin = startMin;
  
  while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
    const slotTime = `${currentHour.toString().padStart(2, "0")}:${currentMin.toString().padStart(2, "0")}`;
    slots.push(slotTime);
    currentMin += 30;
    if (currentMin >= 60) {
      currentMin = 0;
      currentHour += 1;
    }
  }
  
  return slots;
}

function hasAvailabilityOnDate(doctorSlug: string, locationId: string, date: Date): boolean {
  const dayOfWeek = getSwissDayOfWeek(date);
  const availability = DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek]
    ?? ALL_WEEK_SLOTS[dayOfWeek as keyof typeof ALL_WEEK_SLOTS];
  return !!availability;
}

function formatDateLocal(date: Date): string {
  return formatSwissYmd(date);
}

function findNearestAvailableDate(doctorSlug: string, locationId: string, maxDaysAhead: number = 90): string | null {
  const today = getSwissToday();
  
  for (let i = 1; i <= maxDaysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    if (hasAvailabilityOnDate(doctorSlug, locationId, checkDate)) {
      return formatDateLocal(checkDate);
    }
  }
  return null;
}

function getAvailableDates(doctorSlug: string, locationId: string, maxDaysAhead: number = 90): string[] {
  const today = getSwissToday();
  const availableDates: string[] = [];
  for (let i = 1; i <= maxDaysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    if (hasAvailabilityOnDate(doctorSlug, locationId, checkDate)) {
      availableDates.push(formatDateLocal(checkDate));
    }
  }
  return availableDates;
}

type BookingStep = "info" | "datetime" | "confirm";

interface Treatment {
  id: string;
  name: string;
  duration_minutes: number;
}

function DoctorBookingContent() {
  const params = useParams();
  const categorySlug = params.category as string;
  const treatmentId = params.treatment as string;
  const doctorSlug = params.doctor as string;
  const [doctor, setDoctor] = useState<DoctorInfo | null>(null);
  const [doctorLoading, setDoctorLoading] = useState(true);

  const locationId = "lausanne";
  const locationLabel = "Lausanne";
  const { t } = useLanguage();

  const [treatment, setTreatment] = useState<Treatment | null>(null);
  const [step, setStep] = useState<BookingStep>("info");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [bookedSlots, setBookedSlots] = useState<string[]>([]);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);

  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [selectedDate, setSelectedDate] = useState("");
  const [availableDatesSet, setAvailableDatesSet] = useState<Set<string>>(new Set());
  const [nearestAvailableDate, setNearestAvailableDate] = useState<string | null>(null);
  const [nearestAvailableTime, setNearestAvailableTime] = useState<string | null>(null);
  const [isLoadingDates, setIsLoadingDates] = useState(true);
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");

  const selectedService = treatment?.name || "General Consultation";

  useEffect(() => {
    const fetchDoctor = async () => {
      const { data } = await supabaseClient
        .from("booking_doctors")
        .select("name, specialty, image_url, description")
        .eq("slug", doctorSlug)
        .eq("enabled", true)
        .single();
      if (data) {
        setDoctor({
          name: data.name,
          specialty: data.specialty || "",
          image: data.image_url || "/doctors/clinic.png",
          email: "info@maisontoa.com",
          description: data.description || "",
        });
      }
      setDoctorLoading(false);
    };
    fetchDoctor();
  }, [doctorSlug]);

  useEffect(() => {
    const fetchTreatment = async () => {
      try {
        const res = await fetch(`/api/settings/booking-treatments`);
        const data = await res.json();
        const found = (data.treatments || []).find((t: Treatment) => t.id === treatmentId);
        if (found) {
          setTreatment(found);
        }
      } catch (error) {
        console.error("Failed to fetch treatment:", error);
      }
    };
    fetchTreatment();
  }, [treatmentId]);

  useEffect(() => {
    if (locationId && doctorSlug) {
      setIsLoadingDates(true);
      const dates = getAvailableDates(doctorSlug, locationId, 90);
      setAvailableDatesSet(new Set(dates));
      
      const nearest = findNearestAvailableDate(doctorSlug, locationId, 90);
      if (nearest) {
        setNearestAvailableDate(nearest);
        setSelectedDate(nearest);
      } else {
        setNearestAvailableDate(null);
      }
      setIsLoadingDates(false);
    }
  }, [locationId, doctorSlug]);

  useEffect(() => {
    if (selectedDate && locationId) {
      const slots = generateTimeSlots(doctorSlug, locationId, selectedDate);
      setAvailableSlots(slots);
      setSelectedTime("");
      checkAvailability(selectedDate);
    } else {
      setAvailableSlots([]);
    }
  }, [selectedDate, locationId, doctorSlug]);

  async function checkAvailability(date: string) {
    try {
      const { start, end } = getSwissDayRange(date);
      const doctorName = doctor?.name || "";

      const res = await fetch(
        `/api/appointments/check-availability?start=${start}&end=${end}&doctor=${encodeURIComponent(doctorName)}&slug=${doctorSlug}`
      );
      const data = await res.json();

      let blockedSlots: string[] = [];
      if (data.fullSlots) {
        blockedSlots = data.fullSlots.map((isoTime: string) => {
          return getSwissSlotString(new Date(isoTime));
        });
        setBookedSlots(blockedSlots);
      } else {
        setBookedSlots([]);
      }
      
      const currentSlots = generateTimeSlots(doctorSlug, locationId || "", date);
      const openSlots = currentSlots.filter(time => !blockedSlots.includes(time));
      if (openSlots.length > 0) {
        setSelectedTime(openSlots[0]);
        if (date === nearestAvailableDate) {
          setNearestAvailableTime(openSlots[0]);
        }
      } else {
        setSelectedTime("");
        if (date === nearestAvailableDate) {
          setNearestAvailableTime(null);
        }
      }
    } catch (err) {
      console.error("Error checking availability:", err);
    }
  }

  const isValidEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  };

  const isValidPhone = (phone: string): boolean => {
    if (!phone.trim()) return true;
    const phoneRegex = /^[+]?[\d\s()-]{7,20}$/;
    return phoneRegex.test(phone.trim());
  };

  async function handleSubmit() {
    if (!firstName || !lastName || !email || !selectedDate || !selectedTime || !locationId) {
      setError(t("error.required"));
      return;
    }

    if (!isValidEmail(email)) {
      setError(t("error.invalidEmail"));
      return;
    }

    if (!isValidPhone(phone)) {
      setError(t("error.invalidPhone"));
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const [hour, minute] = selectedTime.split(":").map(Number);
      const appointmentDateSwiss = createSwissDateTime(selectedDate, hour, minute);
      
      const res = await fetch("/api/public/book-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName,
          lastName,
          email,
          phone,
          appointmentDate: appointmentDateSwiss.toISOString(),
          service: selectedService,
          doctorSlug: doctorSlug,
          doctorName: doctor.name,
          doctorEmail: doctor.email,
          notes,
          location: locationLabel,
          patientType: "existing",
          treatmentId: treatmentId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Failed to book appointment");
      }

      pushToDataLayer("aliice_form_submit");
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to book appointment");
    } finally {
      setLoading(false);
    }
  }

  if (doctorLoading) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </main>
    );
  }

  if (!doctor) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Doctor Not Found</h1>
          <Link href="/book-appointment" className="text-slate-900 hover:underline">
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  if (success) {
    return (
      <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 max-w-md w-full text-center border border-slate-200">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10 text-slate-900" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-4">Appointment Booked!</h1>
          <p className="text-slate-600 mb-6">
            Your appointment with <strong>{doctor.name}</strong> has been confirmed. 
            A confirmation email has been sent to <strong>{email}</strong>.
          </p>
          <div className="bg-slate-50 rounded-xl p-4 mb-6 text-left">
            <p className="text-sm text-slate-600 mb-2">
              <strong>Date:</strong> {formatSwissDateWithWeekday(parseSwissDate(selectedDate))}
            </p>
            <p className="text-sm text-slate-600 mb-2">
              <strong>Time:</strong> {selectedTime}
            </p>
            <p className="text-sm text-slate-600">
              <strong>Service:</strong> {selectedService}
            </p>
          </div>
          <Link
            href="/book-appointment"
            className="inline-flex items-center gap-2 bg-slate-900 text-white px-6 py-3 rounded-full font-medium hover:bg-slate-800 transition-colors"
          >
            Back to Home
          </Link>
        </div>
      </main>
    );
  }

  const getMinDate = () => {
    const tomorrow = getSwissToday();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return formatSwissYmd(tomorrow);
  };

  const getMaxDate = () => {
    const maxDate = getSwissToday();
    maxDate.setMonth(maxDate.getMonth() + 3);
    return formatSwissYmd(maxDate);
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-slate-200 rounded-full opacity-50 blur-3xl" />
      </div>

      <div className="relative max-w-4xl mx-auto px-4 py-8 sm:py-12 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between mb-6 sm:mb-8">
          <div className="w-20"></div>
          <Link href="/book-appointment">
            <Image
              src="/logos/maisontoa-logo.png"
              alt="Maison Toa"
              width={280}
              height={80}
              className="h-12 sm:h-14 md:h-16 w-auto"
              priority
            />
          </Link>
          <div className="w-20 flex justify-end">
            <LanguageToggle />
          </div>
        </div>

        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-2">
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">1</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-900"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">2</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-900"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">3</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-900"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">4</span>
            </div>
            <div className="w-12 h-0.5 bg-slate-300"></div>
            <div className="w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">5</span>
            </div>
          </div>
        </div>

        <Link
          href={`/book-appointment/existing-patient/${categorySlug}/${treatmentId}`}
          className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-6 sm:mb-8 transition-colors text-sm sm:text-base"
        >
          <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {t("booking.backToSpecialists")}
        </Link>

        <div className="inline-flex items-center gap-2 bg-slate-100 rounded-full px-4 py-2 mb-6">
          <svg className="w-4 h-4 text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span className="text-sm font-medium text-slate-700">{locationLabel}</span>
        </div>

        <div className="grid lg:grid-cols-[200px_1fr] gap-4 sm:gap-6 lg:gap-8">
          <div className="lg:sticky lg:top-8 h-fit">
            <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg overflow-hidden border border-slate-200 flex lg:flex-col">
              <div className="relative w-24 h-24 sm:w-32 sm:h-32 lg:w-full lg:h-40 bg-gradient-to-br from-slate-100 to-slate-50 flex-shrink-0">
                <Image
                  src={doctor.image}
                  alt={doctor.name}
                  fill
                  className="object-cover object-top"
                />
              </div>
              <div className="p-3 sm:p-4 flex-1">
                <h2 className="text-base sm:text-lg font-bold text-slate-900 mb-0.5 sm:mb-1">{doctor.name}</h2>
                <p className="text-xs sm:text-sm text-slate-500 font-medium mb-1 sm:mb-2">{doctor.specialty}</p>
                <p className="text-xs sm:text-sm text-slate-600 hidden sm:block line-clamp-2">{doctor.description}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl sm:rounded-2xl shadow-lg p-4 sm:p-6 lg:p-8 border border-slate-200">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 sm:mb-6">{t("booking.title")}</h1>

            <div className="flex items-center gap-1.5 sm:gap-2 mb-6 sm:mb-8 overflow-x-auto pb-2">
              {(["info", "datetime", "confirm"] as BookingStep[]).map((s, idx) => (
                <button
                  key={s}
                  onClick={() => {
                    if (s === "info" || (s === "datetime" && firstName && lastName && email) || 
                        (s === "confirm" && selectedDate && selectedTime)) {
                      setStep(s);
                    }
                  }}
                  className={`flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-full text-xs sm:text-sm font-medium transition-all whitespace-nowrap ${
                    step === s
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/20 flex items-center justify-center text-[10px] sm:text-xs">
                    {idx + 1}
                  </span>
                  <span className="hidden sm:inline">
                    {s === "info" && t("booking.personalInfo")}
                    {s === "datetime" && t("booking.dateTime")}
                    {s === "confirm" && t("booking.confirm")}
                  </span>
                  <span className="sm:hidden">
                    {s === "info" && t("booking.personalInfo")}
                    {s === "datetime" && t("booking.date")}
                    {s === "confirm" && t("booking.confirm")}
                  </span>
                </button>
              ))}
            </div>

            {error && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}

            {step === "info" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">{t("booking.personalInfo")}</h3>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("booking.firstName")} *</label>
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("booking.lastName")} *</label>
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("booking.email")} *</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("booking.phone")}</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                  />
                </div>
                <div className="pt-4">
                  <button
                    onClick={() => {
                      if (!firstName || !lastName || !email) {
                        setError(t("error.required"));
                        return;
                      }
                      if (!isValidEmail(email)) {
                        setError(t("error.invalidEmail"));
                        return;
                      }
                      if (phone.trim() && !isValidPhone(phone)) {
                        setError(t("error.invalidPhone"));
                        return;
                      }
                      setStep("datetime");
                      setError(null);
                    }}
                    className="w-full bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors"
                  >
                    {t("booking.continue")}
                  </button>
                </div>
              </div>
            )}

            {step === "datetime" && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">{t("booking.selectDate")}</h3>
                <p className="text-sm text-slate-600 mb-4">
                  {t("booking.selectDateDesc").replace("{doctor}", doctor.name).replace("{location}", locationLabel)}
                </p>

                {nearestAvailableDate && (
                  <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                    <svg className="w-4 h-4 text-emerald-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <p className="text-sm text-emerald-700">
                      <span className="font-medium">Earliest availability:</span>{" "}
                      {new Date(nearestAvailableDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                      {nearestAvailableTime ? ` at ${nearestAvailableTime}` : isLoadingDates ? " — checking times…" : ""}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("booking.date")} *</label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      const newDate = e.target.value;
                      setSelectedDate(newDate);
                      setSelectedTime("");
                    }}
                    min={getMinDate()}
                    max={getMaxDate()}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all"
                  />
                </div>

                {selectedDate && availableSlots.length > 0 && (() => {
                  const openSlots = availableSlots.filter(time => !bookedSlots.includes(time));
                  
                  if (openSlots.length === 0) {
                    return (
                      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-sm text-amber-700 font-medium">
                          {t("booking.noSlots")}
                        </p>
                      </div>
                    );
                  }
                  
                  return (
                    <div>
                      <label className="block text-sm font-medium text-slate-700 mb-3">{t("booking.availableSlots")} *</label>
                      <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                        {openSlots.map((time: string) => (
                          <button
                            key={time}
                            onClick={() => setSelectedTime(time)}
                            className={`py-3 rounded-xl text-sm font-medium transition-all ${
                              selectedTime === time
                                ? "bg-slate-900 text-white"
                                : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                            }`}
                          >
                            {time}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {selectedDate && availableSlots.length === 0 && (
                  <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
                    <p className="text-sm text-amber-700 font-medium">
                      {t("booking.notAvailable")}
                    </p>
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1.5">{t("booking.notes")}</label>
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-slate-900 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 outline-none transition-all resize-none"
                    placeholder={t("booking.notesPlaceholder")}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    onClick={() => setStep("info")}
                    className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-medium hover:bg-slate-200 transition-colors"
                  >
                    {t("booking.back")}
                  </button>
                  <button
                    onClick={() => {
                      if (selectedDate && selectedTime) {
                        setStep("confirm");
                        setError(null);
                      } else {
                        setError(t("error.selectDateTime"));
                      }
                    }}
                    className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors"
                  >
                    {t("booking.continue")}
                  </button>
                </div>
              </div>
            )}

            {step === "confirm" && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-slate-900 mb-4">{t("booking.confirmTitle")}</h3>
                
                <div className="bg-slate-50 rounded-xl p-5 space-y-4">
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.name")}</span>
                    <span className="font-medium text-slate-900">{firstName} {lastName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.email")}</span>
                    <span className="font-medium text-slate-900">{email}</span>
                  </div>
                  {phone && (
                    <div className="flex justify-between">
                      <span className="text-slate-600">{t("booking.phone")}</span>
                      <span className="font-medium text-slate-900">{phone}</span>
                    </div>
                  )}
                  <hr className="border-slate-200" />
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.doctor")}</span>
                    <span className="font-medium text-slate-900">{doctor.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.date")}</span>
                    <span className="font-medium text-slate-900">
                      {new Date(selectedDate).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", timeZone: SWISS_TIMEZONE })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.time")}</span>
                    <span className="font-medium text-slate-900">{selectedTime}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.service")}</span>
                    <span className="font-medium text-slate-900">{selectedService}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-600">{t("booking.location")}</span>
                    <span className="font-medium text-slate-900">{locationLabel}</span>
                  </div>
                  {notes && (
                    <>
                      <hr className="border-slate-200" />
                      <div>
                        <span className="text-slate-600 block mb-1">{t("booking.notes")}</span>
                        <span className="text-sm text-slate-900">{notes}</span>
                      </div>
                    </>
                  )}
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setStep("datetime")}
                    disabled={loading}
                    className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-medium hover:bg-slate-200 transition-colors disabled:opacity-50"
                  >
                    {t("booking.back")}
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={loading}
                    className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-medium hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        {t("booking.booking")}
                      </>
                    ) : (
                      t("booking.confirmBooking")
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <footer className="bg-slate-900 text-white py-8 mt-16">
        <div className="max-w-6xl mx-auto px-4 text-center">
          <p className="text-slate-400 text-sm">
            © {new Date().getFullYear()} Maison Toá. All rights reserved.
          </p>
        </div>
      </footer>
    </main>
  );
}

export default function DoctorBookingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
      </div>
    }>
      <DoctorBookingContent />
    </Suspense>
  );
}
