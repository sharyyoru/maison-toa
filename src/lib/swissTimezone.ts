/**
 * Swiss Timezone Utilities
 * 
 * This module provides centralized date/time formatting functions
 * that always use Swiss timezone (Europe/Zurich) regardless of user's location.
 * 
 * All appointment-related dates and times in the clinic should be displayed
 * in Swiss time to ensure consistency.
 */

export const SWISS_TIMEZONE = "Europe/Zurich";
export const SWISS_LOCALE = "fr-CH";

/**
 * Format a date to a localized date string in Swiss timezone
 */
export function formatSwissDate(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: SWISS_TIMEZONE,
  };
  
  return d.toLocaleDateString(SWISS_LOCALE, { ...defaultOptions, ...options });
}

/**
 * Format a date to a localized time string in Swiss timezone
 */
export function formatSwissTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SWISS_TIMEZONE,
  };
  
  return d.toLocaleTimeString(SWISS_LOCALE, { ...defaultOptions, ...options });
}

/**
 * Format a date to a full date-time string in Swiss timezone
 */
export function formatSwissDateTime(
  date: Date | string,
  options?: Intl.DateTimeFormatOptions
): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SWISS_TIMEZONE,
  };
  
  return d.toLocaleString(SWISS_LOCALE, { ...defaultOptions, ...options });
}

/**
 * Format month and year in Swiss timezone
 */
export function formatSwissMonthYear(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  return d.toLocaleDateString(SWISS_LOCALE, {
    month: "long",
    year: "numeric",
    timeZone: SWISS_TIMEZONE,
  });
}

/**
 * Format a time range label in Swiss timezone
 */
export function formatSwissTimeRange(
  start: Date | string,
  end: Date | string | null,
  fallbackDurationMinutes: number = 30
): string {
  const startDate = typeof start === "string" ? new Date(start) : start;
  if (Number.isNaN(startDate.getTime())) return "";

  const startLabel = formatSwissTime(startDate);

  let endLabel: string;
  if (end) {
    const endDate = typeof end === "string" ? new Date(end) : end;
    if (!Number.isNaN(endDate.getTime())) {
      endLabel = formatSwissTime(endDate);
    } else {
      const fallbackEnd = new Date(startDate.getTime() + fallbackDurationMinutes * 60 * 1000);
      endLabel = formatSwissTime(fallbackEnd);
    }
  } else {
    const fallbackEnd = new Date(startDate.getTime() + fallbackDurationMinutes * 60 * 1000);
    endLabel = formatSwissTime(fallbackEnd);
  }

  return `${startLabel} - ${endLabel}`;
}

/**
 * Format date as YYYY-MM-DD in Swiss timezone
 */
export function formatSwissYmd(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "";
  
  // Use Intl.DateTimeFormat to get parts in Swiss timezone
  const formatter = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: SWISS_TIMEZONE,
  });
  
  return formatter.format(d);
}

/**
 * Format date with weekday in Swiss timezone (for email confirmations)
 */
export function formatSwissDateWithWeekday(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: SWISS_TIMEZONE,
  });
}

/**
 * Format time with AM/PM in Swiss timezone (for email confirmations)
 */
export function formatSwissTimeAmPm(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  return d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: SWISS_TIMEZONE,
  });
}

/**
 * Format short date in Swiss timezone
 */
export function formatSwissShortDate(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return "—";
  
  return d.toLocaleDateString(SWISS_LOCALE, {
    month: "short",
    day: "numeric",
    timeZone: SWISS_TIMEZONE,
  });
}

/**
 * Get current date in Swiss timezone as a Date object set to midnight
 */
export function getSwissToday(): Date {
  const now = new Date();
  const swissDateStr = now.toLocaleDateString("en-CA", { timeZone: SWISS_TIMEZONE });
  const [year, month, day] = swissDateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0); // noon to avoid DST issues
}

/**
 * Parse a YYYY-MM-DD string as a date in Swiss timezone
 */
export function parseSwissDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, month - 1, day, 12, 0, 0); // noon to avoid DST issues
}

/**
 * Get day of week in Swiss timezone (0 = Sunday, 6 = Saturday)
 */
export function getSwissDayOfWeek(date: Date | string): number {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return -1;
  
  // Get the date string in Swiss timezone and create a new Date from it
  const swissDateStr = d.toLocaleDateString("en-CA", { timeZone: SWISS_TIMEZONE });
  const [year, month, day] = swissDateStr.split("-").map(Number);
  const swissDate = new Date(year, month - 1, day);
  return swissDate.getDay();
}

/**
 * Get hour and minute in Swiss timezone from a Date
 * Returns { hour: number, minute: number }
 */
export function getSwissHourMinute(date: Date | string): { hour: number; minute: number } {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) return { hour: 0, minute: 0 };
  
  const timeStr = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: false,
    timeZone: SWISS_TIMEZONE,
  });
  
  const [hourStr, minuteStr] = timeStr.split(":");
  return { hour: parseInt(hourStr, 10), minute: parseInt(minuteStr, 10) };
}

/**
 * Get Swiss timezone slot string (HH:MM) from a Date
 */
export function getSwissSlotString(date: Date | string): string {
  const { hour, minute } = getSwissHourMinute(date);
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

/**
 * Create a Date object for a specific Swiss date and time
 * @param dateStr YYYY-MM-DD format
 * @param hour Hour (0-23)
 * @param minute Minute (0-59)
 */
export function createSwissDateTime(dateStr: string, hour: number, minute: number): Date {
  // Parse the date parts
  const [year, month, day] = dateStr.split("-").map(Number);
  
  // Create date at noon in local time first
  const localDate = new Date(year, month - 1, day, hour, minute, 0, 0);
  
  // Get the offset between local and Swiss timezone for this date
  const localStr = localDate.toLocaleString("en-US", { timeZone: SWISS_TIMEZONE });
  const swissDate = new Date(localStr);
  const offset = localDate.getTime() - swissDate.getTime();
  
  // Adjust the date by the offset to get the correct UTC time
  return new Date(localDate.getTime() + offset);
}

/**
 * Get start and end of a day in Swiss timezone as ISO strings
 */
export function getSwissDayRange(dateStr: string): { start: string; end: string } {
  const startDate = createSwissDateTime(dateStr, 0, 0);
  const endDate = createSwissDateTime(dateStr, 23, 59);
  endDate.setSeconds(59);
  endDate.setMilliseconds(999);
  
  return {
    start: startDate.toISOString(),
    end: endDate.toISOString(),
  };
}

/**
 * Parse a datetime-local input value (YYYY-MM-DDTHH:MM) as Swiss timezone
 * This is used when the user selects a date/time in the browser and we need
 * to interpret it as Swiss time regardless of server timezone.
 * @param datetimeLocal String in format "YYYY-MM-DDTHH:MM" from datetime-local input
 * @returns Date object representing the correct UTC time for Swiss timezone
 */
export function parseSwissDateTimeLocal(datetimeLocal: string): Date {
  // Parse the datetime-local format: "2024-03-11T11:00"
  const [datePart, timePart] = datetimeLocal.split("T");
  if (!datePart || !timePart) {
    // Fallback: try to parse as-is if format is unexpected
    return new Date(datetimeLocal);
  }
  
  const [year, month, day] = datePart.split("-").map(Number);
  const [hour, minute] = timePart.split(":").map(Number);
  
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(hour) || isNaN(minute)) {
    // Fallback for invalid format
    return new Date(datetimeLocal);
  }
  
  // Use createSwissDateTime to get the correct UTC time
  return createSwissDateTime(datePart, hour, minute);
}

/**
 * Format for appointment detail display (short weekday + date + time)
 */
export function formatSwissAppointmentDateTime(date: Date | string): {
  date: string;
  time: string;
} {
  const d = typeof date === "string" ? new Date(date) : date;
  if (Number.isNaN(d.getTime())) {
    return { date: "—", time: "—" };
  }
  
  const dateStr = d.toLocaleDateString(SWISS_LOCALE, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: SWISS_TIMEZONE,
  });
  
  const timeStr = d.toLocaleTimeString(SWISS_LOCALE, {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: SWISS_TIMEZONE,
  });
  
  return { date: dateStr, time: timeStr };
}
