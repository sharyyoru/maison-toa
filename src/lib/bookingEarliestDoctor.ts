import { ALL_WEEK_SLOTS, DOCTOR_AVAILABILITY } from "@/lib/doctorAvailability";
import {
  formatSwissYmd,
  getSwissDayOfWeek,
  getSwissSlotString,
  getSwissToday,
} from "@/lib/swissTimezone";
import { fitsWithinDailyAvailability, type BookingWindow } from "@/lib/exactBookingAvailability";

export interface EarliestBookingDoctor {
  slug: string;
  name: string;
}

export interface EarliestDoctorResult {
  doctor: EarliestBookingDoctor;
  date: string;
  time: string;
}

type DayAvailability = Record<number, { start: string; end: string }>;
type DoctorAvailabilityResult = {
  availability: DayAvailability;
  hasDatabaseSchedule: boolean;
};

async function getDoctorAvailability(doctor: EarliestBookingDoctor): Promise<DoctorAvailabilityResult> {
  try {
    const res = await fetch(`/api/public/doctor-availability?doctorSlug=${encodeURIComponent(doctor.slug)}`);
    if (!res.ok) throw new Error("Failed to fetch doctor availability");

    const data = await res.json();
    if (data.availability && Object.keys(data.availability).length > 0) {
      const availability: DayAvailability = {};
      Object.entries(data.availability).forEach(([day, value]) => {
        const entry = value as { start: string; end: string; available: boolean };
        if (entry.available !== false) {
          availability[Number(day)] = { start: entry.start, end: entry.end };
        }
      });
      return {
        availability,
        hasDatabaseSchedule: true,
      };
    }
  } catch (error) {
    console.error("Failed to load doctor availability:", error);
  }

  return {
    availability: DOCTOR_AVAILABILITY[doctor.slug]?.lausanne ?? ALL_WEEK_SLOTS,
    hasDatabaseSchedule: false,
  };
}

/**
 * Optimized: fetch all appointments for the next N days in a single API call,
 * then process them client-side to find the first open slot.
 */
async function getFirstOpenSlot(
  doctor: EarliestBookingDoctor,
  durationMinutes: number,
  maxDaysAhead: number,
  treatmentId?: string
): Promise<EarliestDoctorResult | null> {
  const { availability } = await getDoctorAvailability(doctor);
  const today = getSwissToday();
  
  // Batch fetch: get all booked slots for the next maxDaysAhead days in one call
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 1);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + maxDaysAhead + 1);
  
  // Format as ISO strings for the API
  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);
  
  const availableStarts: Map<string, string[]> = new Map();
  let bookingWindow: BookingWindow = { durationMinutes, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
  
  try {
    const treatmentParam = treatmentId && treatmentId !== "none" ? `&treatmentId=${treatmentId}` : "";
    const res = await fetch(
      `/api/appointments/check-availability?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}&doctor=${encodeURIComponent(doctor.name)}&slug=${doctor.slug}${treatmentParam}`
    );
    const data = await res.json();
    
    bookingWindow = data.bookingWindow || bookingWindow;
    if (data.availableStarts && Array.isArray(data.availableStarts)) {
      data.availableStarts.forEach((isoTime: string) => {
        const slotDate = new Date(isoTime);
        const dateStr = formatSwissYmd(slotDate);
        const timeStr = getSwissSlotString(slotDate);
        availableStarts.set(dateStr, [...(availableStarts.get(dateStr) || []), timeStr]);
      });
    }
  } catch (error) {
    console.error("Failed to fetch batch availability:", error);
    // Continue anyway - will assume all slots are open
  }

  // Now iterate through days to find the first open slot
  for (let dayOffset = 1; dayOffset <= maxDaysAhead; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    const dayOfWeek = getSwissDayOfWeek(date);
    const dateString = formatSwissYmd(date);
    const dayAvailability = availability[dayOfWeek];
    if (!dayAvailability) continue;
    const openSlot = (availableStarts.get(dateString) || [])
      .filter((slot) => fitsWithinDailyAvailability(slot, dayAvailability, bookingWindow))
      .sort((a, b) => a.localeCompare(b))[0];

    if (openSlot) {
      return { doctor, date: dateString, time: openSlot };
    }
  }

  return null;
}

export async function findEarliestAvailableDoctor(
  doctors: EarliestBookingDoctor[],
  durationMinutes = 60,
  maxDaysAhead = 30, // Reduced from 90 to 30 for faster initial search
  treatmentId?: string
): Promise<EarliestDoctorResult | null> {
  // Search all doctors in parallel
  const results = await Promise.all(
    doctors.map((doctor) => getFirstOpenSlot(doctor, durationMinutes, maxDaysAhead, treatmentId))
  );

  const validResults = results.filter((result): result is EarliestDoctorResult => result !== null);
  
  if (validResults.length === 0) {
    // If no results in first 30 days, try extended search (60 more days)
    const extendedResults = await Promise.all(
      doctors.map((doctor) => getFirstOpenSlot(doctor, durationMinutes, 90, treatmentId))
    );
    return extendedResults
      .filter((result): result is EarliestDoctorResult => result !== null)
      .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0] ?? null;
  }

  return validResults.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0];
}

/**
 * Find multiple earliest available slots for each doctor.
 * Returns up to `count` slots per doctor, preserving the incoming doctor order.
 */
export async function findMultipleEarliestSlots(
  doctors: EarliestBookingDoctor[],
  durationMinutes = 60,
  count = 5,
  maxDaysAhead = 30,
  treatmentId?: string,
  categorySlug?: string,
  patientType?: "new" | "existing",
): Promise<EarliestDoctorResult[]> {
  const slotsByDoctor = await Promise.all(
    doctors.map((doctor) => getMultipleOpenSlots(
      doctor,
      durationMinutes,
      count,
      maxDaysAhead,
      treatmentId,
      categorySlug,
      patientType,
    ))
  );

  return slotsByDoctor.flat();
}

/**
 * Get multiple open slots for a single doctor
 */
async function getMultipleOpenSlots(
  doctor: EarliestBookingDoctor,
  durationMinutes: number,
  count: number,
  maxDaysAhead: number,
  treatmentId?: string,
  categorySlug?: string,
  patientType?: "new" | "existing",
): Promise<EarliestDoctorResult[]> {
  const { availability } = await getDoctorAvailability(doctor);
  const today = getSwissToday();
  
  // Batch fetch: get all booked slots for the next maxDaysAhead days in one call
  const startDate = new Date(today);
  startDate.setDate(today.getDate() + 1);
  const endDate = new Date(today);
  endDate.setDate(today.getDate() + maxDaysAhead + 1);
  
  const rangeStart = new Date(startDate);
  rangeStart.setHours(0, 0, 0, 0);
  const rangeEnd = new Date(endDate);
  rangeEnd.setHours(23, 59, 59, 999);
  
  const availableStarts: Map<string, string[]> = new Map();
  let bookingWindow: BookingWindow = { durationMinutes, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 };
  
  try {
    const treatmentParam = treatmentId && treatmentId !== "none" ? `&treatmentId=${treatmentId}` : "";
    const categoryParam = categorySlug ? `&categorySlug=${encodeURIComponent(categorySlug)}` : "";
    const patientTypeParam = patientType ? `&patientType=${patientType}` : "";
    const res = await fetch(
      `/api/appointments/check-availability?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}&doctor=${encodeURIComponent(doctor.name)}&slug=${doctor.slug}${treatmentParam}${categoryParam}${patientTypeParam}`
    );
    const data = await res.json();
    
    bookingWindow = data.bookingWindow || bookingWindow;
    if (data.availableStarts && Array.isArray(data.availableStarts)) {
      data.availableStarts.forEach((isoTime: string) => {
        const slotDate = new Date(isoTime);
        const dateStr = formatSwissYmd(slotDate);
        const timeStr = getSwissSlotString(slotDate);
        availableStarts.set(dateStr, [...(availableStarts.get(dateStr) || []), timeStr]);
      });
    }
  } catch (error) {
    console.error("Failed to fetch batch availability:", error);
  }

  const results: EarliestDoctorResult[] = [];
  
  for (let dayOffset = 1; dayOffset <= maxDaysAhead && results.length < count; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    const dayOfWeek = getSwissDayOfWeek(date);
    const dateString = formatSwissYmd(date);
    const dayAvailability = availability[dayOfWeek];
    if (!dayAvailability) continue;
    const slots = [...new Set(availableStarts.get(dateString) || [])]
      .filter((slot) => fitsWithinDailyAvailability(slot, dayAvailability, bookingWindow))
      .sort((a, b) => a.localeCompare(b));
    for (const slot of slots) {
      results.push({ doctor, date: dateString, time: slot });
      if (results.length >= count) break;
    }
  }

  return results;
}
