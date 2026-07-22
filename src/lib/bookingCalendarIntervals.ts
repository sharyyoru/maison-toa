export type SecondaryCalendarPosition = "start" | "end";

type BookingCalendarIntervalParams = {
  bookingStart: Date;
  primaryDurationMinutes: number;
  bufferBeforeMinutes?: number;
  bufferAfterMinutes?: number;
  secondaryDurationMinutes?: number | null;
  secondaryPosition?: SecondaryCalendarPosition;
};

export type BookingCalendarIntervals = {
  patientStart: Date;
  doctorServiceStart: Date;
  doctorServiceEnd: Date;
  doctorCalendarStart: Date;
  doctorCalendarEnd: Date;
  secondaryCalendarStart: Date | null;
  secondaryCalendarEnd: Date | null;
};

const minutesToMs = (minutes: number) => minutes * 60_000;

/**
 * Builds every interval from the time selected by the patient. The selected
 * time always anchors the additional calendar. With an end-positioned rule,
 * the clinical appointment is shifted to finish with that reservation.
 */
export function getBookingCalendarIntervals({
  bookingStart,
  primaryDurationMinutes,
  bufferBeforeMinutes = 0,
  bufferAfterMinutes = 0,
  secondaryDurationMinutes = null,
  secondaryPosition = "start",
}: BookingCalendarIntervalParams): BookingCalendarIntervals {
  const hasSecondary = Number.isFinite(secondaryDurationMinutes) && Number(secondaryDurationMinutes) > 0;
  const secondaryMinutes = hasSecondary ? Number(secondaryDurationMinutes) : 0;
  const doctorOffsetMinutes = hasSecondary && secondaryPosition === "end"
    ? secondaryMinutes - primaryDurationMinutes
    : 0;
  const doctorServiceStart = new Date(bookingStart.getTime() + minutesToMs(doctorOffsetMinutes));
  const doctorServiceEnd = new Date(doctorServiceStart.getTime() + minutesToMs(primaryDurationMinutes));

  return {
    patientStart: new Date(bookingStart),
    doctorServiceStart,
    doctorServiceEnd,
    doctorCalendarStart: new Date(doctorServiceStart.getTime() - minutesToMs(bufferBeforeMinutes)),
    doctorCalendarEnd: new Date(doctorServiceEnd.getTime() + minutesToMs(bufferAfterMinutes)),
    secondaryCalendarStart: hasSecondary ? new Date(bookingStart) : null,
    secondaryCalendarEnd: hasSecondary
      ? new Date(bookingStart.getTime() + minutesToMs(secondaryMinutes))
      : null,
  };
}

