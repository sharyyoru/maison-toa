"use client";

import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { findMultipleEarliestSlots, type EarliestBookingDoctor } from "@/lib/bookingEarliestDoctor";
import { useDoctorWeekAvailability } from "@/hooks/useDoctorWeekAvailability";
import WeekAvailabilityPicker from "@/components/booking/WeekAvailabilityPicker";
import { getLocalizedBookingName } from "@/lib/bookingLocalization";

interface BookingDoctor extends EarliestBookingDoctor {
  specialty: string;
}

interface Treatment {
  id: string;
  name: string;
  name_en?: string | null;
  duration_minutes?: number;
  display_price?: number | null;
  display_duration_minutes?: number | null;
}

type Props = {
  doctors: BookingDoctor[];
  treatment: Treatment | null;
  treatmentId: string;
  categorySlug: string;
  patientType: "new" | "existing";
  onSelectSlot: (doctorSlug: string, date: string, time: string) => void;
};

export function EarliestSlotPicker({ doctors, treatment, treatmentId, categorySlug, patientType, onSelectSlot }: Props) {
  const { t, language } = useLanguage();
  const [autoSelecting, setAutoSelecting] = useState(false);
  const [autoSelectError, setAutoSelectError] = useState<string | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [orderedDoctors, setOrderedDoctors] = useState<BookingDoctor[]>([]);
  const [activeDoctorSlug, setActiveDoctorSlug] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");

  const activeDoctor = orderedDoctors.find((d) => d.slug === activeDoctorSlug) ?? null;
  const dateLocale = language === "fr" ? "fr-FR" : "en-US";
  const selectedService = treatment ? getLocalizedBookingName(treatment, language) : t("common.generalConsultation");

  const availability = useDoctorWeekAvailability({
    doctorSlug: activeDoctor?.slug ?? "",
    doctorName: activeDoctor?.name ?? null,
    treatmentId,
    categorySlug,
    patientType,
  });

  const handleFindEarliestSlots = async () => {
    setAutoSelecting(true);
    setAutoSelectError(null);

    try {
      // One slot per doctor is enough to rank them by earliest availability;
      // the actual browsing happens in the horizontal calendar below.
      const results = await findMultipleEarliestSlots(
        doctors,
        treatment?.duration_minutes ?? 60,
        1,
        90,
        treatmentId,
        categorySlug,
        patientType,
      );

      if (results.length === 0) {
        setAutoSelectError(t("doctor.noEarliestAvailable"));
        return;
      }

      const sorted = [...results].sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
      const doctorsBySlug = new Map(doctors.map((d) => [d.slug, d]));
      const ranked = sorted
        .map((slot) => doctorsBySlug.get(slot.doctor.slug))
        .filter((d): d is BookingDoctor => !!d);

      setOrderedDoctors(ranked);
      setActiveDoctorSlug(ranked[0].slug);
      setSelectedDate(sorted[0].date);
      setSelectedTime(sorted[0].time);
      setShowPicker(true);
    } catch (error) {
      console.error("Failed to find earliest slots:", error);
      setAutoSelectError(t("doctor.autoSelectFailed"));
    } finally {
      setAutoSelecting(false);
    }
  };

  const handleSelectDoctorTab = (slug: string) => {
    setActiveDoctorSlug(slug);
    setSelectedDate("");
    setSelectedTime("");
  };

  const handleSelectSlot = (date: string, time: string) => {
    setSelectedDate(date);
    setSelectedTime(time);
    if (activeDoctor) onSelectSlot(activeDoctor.slug, date, time);
  };

  if (!showPicker) {
    return (
      <div className="mt-8 flex flex-col items-center gap-4">
        <button
          type="button"
          onClick={handleFindEarliestSlots}
          disabled={autoSelecting || doctors.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white shadow-sm transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {autoSelecting && (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          )}
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          {autoSelecting ? t("doctor.findingEarliest") : t("doctor.autoSelectEarliest")}
        </button>
        {autoSelectError && <p className="text-center text-sm text-amber-700">{autoSelectError}</p>}
      </div>
    );
  }

  return (
    <div className="mt-8 w-full max-w-3xl mx-auto">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-900">{t("doctor.earliestSlotsTitle")}</h3>
        <button
          type="button"
          onClick={() => setShowPicker(false)}
          className="text-slate-400 hover:text-slate-600 transition-colors"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Doctor tabs, ordered by earliest availability first */}
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1">
        {orderedDoctors.map((doctor) => {
          const selected = doctor.slug === activeDoctorSlug;
          return (
            <button
              key={doctor.slug}
              type="button"
              onClick={() => handleSelectDoctorTab(doctor.slug)}
              className={`flex-shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-all ${
                selected
                  ? "border-slate-900 bg-slate-900 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
              }`}
            >
              {doctor.name}
            </button>
          );
        })}
      </div>

      {activeDoctor && (
        <WeekAvailabilityPicker
          serviceName={selectedService}
          servicePriceLabel={treatment?.display_price ? `CHF ${treatment.display_price.toFixed(2)}` : null}
          serviceDurationMinutes={treatment?.display_duration_minutes ?? treatment?.duration_minutes ?? null}
          doctorName={activeDoctor.name}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          onSelectSlot={handleSelectSlot}
          availabilityWindow={availability.availabilityWindow}
          generateTimeSlots={availability.generateTimeSlots}
          getDayAvailability={availability.getDayAvailability}
          nextAvailableSlots={availability.nextAvailableSlots}
          isLoading={availability.isLoading}
          dateLocale={dateLocale}
          noSlotsLabel={t("booking.noAvailabilityForDay")}
          nextAvailableLabel={t("booking.jumpToNextAvailable")}
          checkingAvailabilityLabel={t("booking.checkingAvailability")}
          onFetchWeek={availability.fetchWeek}
        />
      )}

      <div className="mt-4">
        <button
          type="button"
          onClick={() => setShowPicker(false)}
          className="text-sm text-slate-600 hover:text-slate-900 transition-colors"
        >
          ← {t("doctor.backToAllDoctors")}
        </button>
      </div>
    </div>
  );
}
