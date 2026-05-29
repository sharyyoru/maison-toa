import { ALL_WEEK_SLOTS, DOCTOR_AVAILABILITY } from "@/lib/doctorAvailability";
import {
  formatSwissYmd,
  getSwissDayOfWeek,
  getSwissSlotString,
  getSwissToday,
} from "@/lib/swissTimezone";

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

function slotConflicts(time: string, durationMinutes: number, bookedSlots: string[]): boolean {
  const [h, m] = time.split(":").map(Number);
  const startMins = h * 60 + m;
  const endMins = startMins + durationMinutes;

  return bookedSlots.some((booked) => {
    const [bh, bm] = booked.split(":").map(Number);
    const bookedStart = bh * 60 + bm;
    const bookedEnd = bookedStart + 30;
    return startMins < bookedEnd && endMins > bookedStart;
  });
}

function generateTimeSlots(dayOfWeek: number, availability?: { start: string; end: string }): string[] {
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

async function getDoctorAvailability(doctor: EarliestBookingDoctor): Promise<DayAvailability> {
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
      return availability;
    }
  } catch (error) {
    console.error("Failed to load doctor availability:", error);
  }

  return DOCTOR_AVAILABILITY[doctor.slug]?.lausanne ?? ALL_WEEK_SLOTS;
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
  const availability = await getDoctorAvailability(doctor);
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
  
  let allBookedSlots: Map<string, string[]> = new Map(); // dateString -> bookedSlots[]
  
  try {
    const treatmentParam = treatmentId && treatmentId !== "none" ? `&treatmentId=${treatmentId}` : "";
    const res = await fetch(
      `/api/appointments/check-availability?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}&doctor=${encodeURIComponent(doctor.name)}&slug=${doctor.slug}${treatmentParam}`
    );
    const data = await res.json();
    
    // Group fullSlots by date
    if (data.fullSlots && Array.isArray(data.fullSlots)) {
      data.fullSlots.forEach((isoTime: string) => {
        const slotDate = new Date(isoTime);
        const dateStr = formatSwissYmd(slotDate);
        const timeStr = getSwissSlotString(slotDate);
        
        if (!allBookedSlots.has(dateStr)) {
          allBookedSlots.set(dateStr, []);
        }
        allBookedSlots.get(dateStr)!.push(timeStr);
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
    const slots = generateTimeSlots(dayOfWeek, availability[dayOfWeek]);
    if (slots.length === 0) continue;

    const dateString = formatSwissYmd(date);
    const bookedSlots = allBookedSlots.get(dateString) || [];
    
    const openSlot = slots.find((slot) => !slotConflicts(slot, durationMinutes, bookedSlots));

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
 * Find multiple earliest available slots across all doctors
 * Returns up to `count` slots sorted by date/time
 */
export async function findMultipleEarliestSlots(
  doctors: EarliestBookingDoctor[],
  durationMinutes = 60,
  count = 5,
  maxDaysAhead = 30,
  treatmentId?: string
): Promise<EarliestDoctorResult[]> {
  // Get all open slots for each doctor
  const allSlots: EarliestDoctorResult[] = [];
  
  for (const doctor of doctors) {
    const slots = await getMultipleOpenSlots(doctor, durationMinutes, count, maxDaysAhead, treatmentId);
    allSlots.push(...slots);
  }
  
  // Sort by date/time and return top N unique slots
  const sorted = allSlots.sort((a, b) => 
    `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`)
  );
  
  // Return unique slots (different doctor/date/time combinations)
  const seen = new Set<string>();
  const unique: EarliestDoctorResult[] = [];
  
  for (const slot of sorted) {
    const key = `${slot.doctor.slug}-${slot.date}-${slot.time}`;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(slot);
      if (unique.length >= count) break;
    }
  }
  
  return unique;
}

/**
 * Get multiple open slots for a single doctor
 */
async function getMultipleOpenSlots(
  doctor: EarliestBookingDoctor,
  durationMinutes: number,
  count: number,
  maxDaysAhead: number,
  treatmentId?: string
): Promise<EarliestDoctorResult[]> {
  const availability = await getDoctorAvailability(doctor);
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
  
  let allBookedSlots: Map<string, string[]> = new Map();
  
  try {
    const treatmentParam = treatmentId && treatmentId !== "none" ? `&treatmentId=${treatmentId}` : "";
    const res = await fetch(
      `/api/appointments/check-availability?start=${rangeStart.toISOString()}&end=${rangeEnd.toISOString()}&doctor=${encodeURIComponent(doctor.name)}&slug=${doctor.slug}${treatmentParam}`
    );
    const data = await res.json();
    
    if (data.fullSlots && Array.isArray(data.fullSlots)) {
      data.fullSlots.forEach((isoTime: string) => {
        const slotDate = new Date(isoTime);
        const dateStr = formatSwissYmd(slotDate);
        const timeStr = getSwissSlotString(slotDate);
        
        if (!allBookedSlots.has(dateStr)) {
          allBookedSlots.set(dateStr, []);
        }
        allBookedSlots.get(dateStr)!.push(timeStr);
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
    const slots = generateTimeSlots(dayOfWeek, availability[dayOfWeek]);
    if (slots.length === 0) continue;

    const dateString = formatSwissYmd(date);
    const bookedSlots = allBookedSlots.get(dateString) || [];
    
    for (const slot of slots) {
      if (!slotConflicts(slot, durationMinutes, bookedSlots)) {
        results.push({ doctor, date: dateString, time: slot });
        if (results.length >= count) break;
      }
    }
  }

  return results;
}
