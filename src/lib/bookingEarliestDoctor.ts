import { ALL_WEEK_SLOTS, DOCTOR_AVAILABILITY } from "@/lib/doctorAvailability";
import {
  formatSwissYmd,
  getSwissDayOfWeek,
  getSwissDayRange,
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

async function getFirstOpenSlot(
  doctor: EarliestBookingDoctor,
  durationMinutes: number,
  maxDaysAhead: number
): Promise<EarliestDoctorResult | null> {
  const availability = await getDoctorAvailability(doctor);
  const today = getSwissToday();

  for (let dayOffset = 1; dayOffset <= maxDaysAhead; dayOffset++) {
    const date = new Date(today);
    date.setDate(today.getDate() + dayOffset);

    const dayOfWeek = getSwissDayOfWeek(date);
    const slots = generateTimeSlots(dayOfWeek, availability[dayOfWeek]);
    if (slots.length === 0) continue;

    try {
      const dateString = formatSwissYmd(date);
      const { start, end } = getSwissDayRange(dateString);
      const res = await fetch(
        `/api/appointments/check-availability?start=${start}&end=${end}&doctor=${encodeURIComponent(doctor.name)}&slug=${doctor.slug}`
      );
      const data = await res.json();
      const bookedSlots: string[] = data.fullSlots
        ? data.fullSlots.map((isoTime: string) => getSwissSlotString(new Date(isoTime)))
        : [];
      const openSlot = slots.find((slot) => !slotConflicts(slot, durationMinutes, bookedSlots));

      if (openSlot) {
        return { doctor, date: dateString, time: openSlot };
      }
    } catch (error) {
      console.error("Failed to check doctor slot availability:", error);
    }
  }

  return null;
}

export async function findEarliestAvailableDoctor(
  doctors: EarliestBookingDoctor[],
  durationMinutes = 60,
  maxDaysAhead = 90
): Promise<EarliestDoctorResult | null> {
  const results = await Promise.all(
    doctors.map((doctor) => getFirstOpenSlot(doctor, durationMinutes, maxDaysAhead))
  );

  return results
    .filter((result): result is EarliestDoctorResult => result !== null)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`))[0] ?? null;
}
