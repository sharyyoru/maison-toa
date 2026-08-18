import { useEffect, useRef, useState } from "react";
import { getSwissToday, getSwissDayOfWeek, getSwissDayRange, formatSwissYmd, parseSwissDate } from "@/lib/swissTimezone";
import { fetchAvailabilityWindow, getNextOpenSlots, type AvailabilityWindowResult, type AvailableSlot } from "@/lib/bookingAvailability";
import { ALL_WEEK_SLOTS, DOCTOR_AVAILABILITY } from "@/lib/doctorAvailability";

type DayAvailability = Record<number, { start: string; end: string }>;

function generateTimeSlots(doctorSlug: string, locationId: string, dateStr: string, dbAvail?: DayAvailability | null): string[] {
  const date = parseSwissDate(dateStr);
  const dayOfWeek = date.getDay();
  const availability = dbAvail
    ? dbAvail[dayOfWeek]
    : (DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek] ?? ALL_WEEK_SLOTS[dayOfWeek as keyof typeof ALL_WEEK_SLOTS]);

  if (!availability) return [];

  const slots: string[] = [];
  const [startHour, startMin] = availability.start.split(":").map(Number);
  const [endHour, endMin] = availability.end.split(":").map(Number);

  let currentHour = startHour;
  let currentMin = startMin;
  while (currentHour < endHour || (currentHour === endHour && currentMin < endMin)) {
    slots.push(`${currentHour.toString().padStart(2, "0")}:${currentMin.toString().padStart(2, "0")}`);
    currentMin += 30;
    if (currentMin >= 60) {
      currentMin = 0;
      currentHour += 1;
    }
  }
  return slots;
}

function hasAvailabilityOnDate(doctorSlug: string, locationId: string, date: Date, dbAvail?: DayAvailability | null): boolean {
  const dayOfWeek = getSwissDayOfWeek(date);
  const availability = dbAvail
    ? dbAvail[dayOfWeek]
    : (DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek] ?? ALL_WEEK_SLOTS[dayOfWeek as keyof typeof ALL_WEEK_SLOTS]);
  return !!availability;
}

function getAvailableDates(doctorSlug: string, locationId: string, maxDaysAhead: number, dbAvail?: DayAvailability | null): string[] {
  const today = getSwissToday();
  const dates: string[] = [];
  for (let i = 1; i <= maxDaysAhead; i++) {
    const checkDate = new Date(today);
    checkDate.setDate(today.getDate() + i);
    if (hasAvailabilityOnDate(doctorSlug, locationId, checkDate, dbAvail)) {
      dates.push(formatSwissYmd(checkDate));
    }
  }
  return dates;
}

type Params = {
  doctorSlug: string;
  doctorName: string | null;
  treatmentId: string;
  categorySlug?: string;
  patientType?: "new" | "existing";
  locationId?: string;
  maxDaysAhead?: number;
};

/**
 * Encapsulates everything WeekAvailabilityPicker needs for a given doctor:
 * DB-configured working hours, clinic-wide blocked dates, the initial
 * availability window, and a fetcher for arbitrary date ranges (used when
 * the picker pages beyond what's been prefetched).
 *
 * Shared between the per-doctor booking page and the "earliest available"
 * doctor picker so both present the same horizontal week calendar.
 */
export function useDoctorWeekAvailability({
  doctorSlug,
  doctorName,
  treatmentId,
  categorySlug,
  patientType = "new",
  locationId = "lausanne",
  maxDaysAhead = 90,
}: Params) {
  const [dbAvailability, setDbAvailability] = useState<DayAvailability | null>(null);
  const [dbAvailabilityLoaded, setDbAvailabilityLoaded] = useState(false);
  const [blockedDates, setBlockedDates] = useState<Set<string>>(new Set());
  const [blockedDatesLoaded, setBlockedDatesLoaded] = useState(false);
  const [availabilityWindow, setAvailabilityWindow] = useState<{ startDate: string; endDate: string; result: AvailabilityWindowResult } | null>(null);
  const [nextAvailableSlots, setNextAvailableSlots] = useState<AvailableSlot[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const requestSeq = useRef(0);

  useEffect(() => {
    if (!doctorSlug) return;
    setDbAvailability(null);
    setDbAvailabilityLoaded(false);
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/public/doctor-availability?doctorSlug=${encodeURIComponent(doctorSlug)}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.availability && Object.keys(data.availability).length > 0) {
          const avail: DayAvailability = {};
          Object.entries(data.availability).forEach(([day, val]) => {
            const v = val as { start: string; end: string; available: boolean };
            if (v.available !== false) avail[Number(day)] = { start: v.start, end: v.end };
          });
          setDbAvailability(avail);
        }
      } catch (err) {
        console.error("Failed to fetch doctor availability:", err);
      } finally {
        if (!cancelled) setDbAvailabilityLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [doctorSlug]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/settings/blocked-dates");
        if (res.ok) {
          const data = await res.json();
          if (cancelled) return;
          setBlockedDates(new Set<string>((data.blockedDates || []).map((bd: { blocked_date: string }) => bd.blocked_date)));
        }
      } catch (err) {
        console.error("Failed to fetch blocked dates:", err);
      } finally {
        if (!cancelled) setBlockedDatesLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!doctorSlug || !doctorName || !dbAvailabilityLoaded || !blockedDatesLoaded) return;
    setIsLoading(true);
    setAvailabilityWindow(null);
    setNextAvailableSlots([]);
    const seq = ++requestSeq.current;
    const abortController = new AbortController();

    const dates = getAvailableDates(doctorSlug, locationId, maxDaysAhead, dbAvailability).filter((d) => !blockedDates.has(d));
    if (dates.length === 0) {
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const firstRange = getSwissDayRange(dates[0]);
        const lastRange = getSwissDayRange(dates[dates.length - 1]);
        const result = await fetchAvailabilityWindow({
          start: firstRange.start,
          end: lastRange.end,
          doctorName,
          doctorSlug,
          treatmentId,
          categorySlug,
          patientType,
          signal: abortController.signal,
        });
        if (seq !== requestSeq.current) return;

        const slots = getNextOpenSlots({
          dates,
          availabilityWindow: result,
          generateTimeSlots: (date) => generateTimeSlots(doctorSlug, locationId, date, dbAvailability),
          getDayAvailability: (date) => {
            const day = getSwissDayOfWeek(parseSwissDate(date));
            return dbAvailability ? dbAvailability[day] : (DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[day] ?? ALL_WEEK_SLOTS[day as keyof typeof ALL_WEEK_SLOTS]);
          },
        });

        setAvailabilityWindow({ startDate: dates[0], endDate: dates[dates.length - 1], result });
        setNextAvailableSlots(slots);
      } catch (err) {
        if (!abortController.signal.aborted) {
          console.error("Error checking availability window:", err);
        }
      } finally {
        if (seq === requestSeq.current) setIsLoading(false);
      }
    })();

    return () => {
      requestSeq.current += 1;
      abortController.abort();
    };
  }, [doctorSlug, doctorName, dbAvailability, dbAvailabilityLoaded, blockedDates, blockedDatesLoaded, treatmentId, categorySlug, patientType, locationId, maxDaysAhead]);

  return {
    isLoading,
    availabilityWindow,
    nextAvailableSlots,
    generateTimeSlots: (date: string) => (blockedDates.has(date) ? [] : generateTimeSlots(doctorSlug, locationId, date, dbAvailability)),
    getDayAvailability: (date: string) => {
      if (blockedDates.has(date)) return undefined;
      const day = getSwissDayOfWeek(parseSwissDate(date));
      return dbAvailability ? dbAvailability[day] : (DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[day] ?? ALL_WEEK_SLOTS[day as keyof typeof ALL_WEEK_SLOTS]);
    },
    fetchWeek: (start: string, end: string) =>
      fetchAvailabilityWindow({ start, end, doctorName: doctorName || "", doctorSlug, treatmentId, categorySlug, patientType }),
  };
}
