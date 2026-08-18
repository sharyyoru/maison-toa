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
 * Builds every interval from the selected appointment time. The selected time
 * always anchors the doctor's appointment. An end-positioned secondary
 * reservation is shifted earlier so that it ends with the doctor appointment.
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
  const doctorServiceStart = new Date(bookingStart);
  const doctorServiceEnd = new Date(doctorServiceStart.getTime() + minutesToMs(primaryDurationMinutes));
  const secondaryStart = hasSecondary
    ? secondaryPosition === "end"
      ? new Date(doctorServiceEnd.getTime() - minutesToMs(secondaryMinutes))
      : new Date(bookingStart)
    : null;

  return {
    patientStart: secondaryPosition === "end" && secondaryStart
      ? new Date(secondaryStart)
      : new Date(bookingStart),
    doctorServiceStart,
    doctorServiceEnd,
    doctorCalendarStart: new Date(doctorServiceStart.getTime() - minutesToMs(bufferBeforeMinutes)),
    doctorCalendarEnd: new Date(doctorServiceEnd.getTime() + minutesToMs(bufferAfterMinutes)),
    secondaryCalendarStart: secondaryStart,
    secondaryCalendarEnd: secondaryStart
      ? new Date(secondaryStart.getTime() + minutesToMs(secondaryMinutes))
      : null,
  };
}

