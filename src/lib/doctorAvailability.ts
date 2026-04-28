import { getSwissDayOfWeek, getSwissToday, formatSwissYmd } from "@/lib/swissTimezone";

export const ALL_WEEK_SLOTS = {
  1: { start: "09:00", end: "18:00" },
  2: { start: "09:00", end: "18:00" },
  3: { start: "09:00", end: "18:00" },
  4: { start: "09:00", end: "18:00" },
  5: { start: "09:00", end: "18:00" },
};

export const DOCTOR_AVAILABILITY: Record<string, Record<string, Record<number, { start: string; end: string }>>> = {
  "sophie-nordback": {
    lausanne: {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    },
  },
  "alexandra-miles": {
    lausanne: {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    },
  },
  "reda-benani": {
    lausanne: {
      1: { start: "10:00", end: "18:00" },
      3: { start: "10:00", end: "18:00" },
      5: { start: "10:00", end: "18:00" },
    },
  },
  "adnan-plakalo": {
    lausanne: {
      2: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
    },
  },
  "natalia-koltunova": {
    lausanne: {
      1: { start: "09:00", end: "17:00" },
      2: { start: "09:00", end: "17:00" },
      3: { start: "09:00", end: "17:00" },
      4: { start: "09:00", end: "17:00" },
      5: { start: "09:00", end: "17:00" },
    },
  },
  "laetitia-guarino": {
    lausanne: {
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
      6: { start: "09:00", end: "18:00" },
    },
  },
  "ophelie-perrin": {
    lausanne: {
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
      6: { start: "09:00", end: "18:00" },
    },
  },
  "claire-balbo": {
    lausanne: {
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
      6: { start: "09:00", end: "18:00" },
    },
  },
  "juliette-le-mentec": {
    lausanne: {
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
      6: { start: "09:00", end: "18:00" },
    },
  },
  "gwendoline-boursault": {
    lausanne: {
      1: { start: "09:00", end: "18:00" },
      2: { start: "09:00", end: "18:00" },
      3: { start: "09:00", end: "18:00" },
      4: { start: "09:00", end: "18:00" },
      5: { start: "09:00", end: "18:00" },
      6: { start: "09:00", end: "18:00" },
    },
  },
};

export const MULTI_CAPACITY_DOCTORS = ["xavier-tenorio", "cesar-rodriguez"];

export function generateTimeSlots(doctorSlug: string, locationId: string, dayOfWeek: number): string[] {
  const availability =
    DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek] ??
    ALL_WEEK_SLOTS[dayOfWeek as keyof typeof ALL_WEEK_SLOTS];

  if (!availability) return [];

  const slots: string[] = [];
  const [startHour, startMin] = availability.start.split(":").map(Number);
  const [endHour, endMin] = availability.end.split(":").map(Number);

  let h = startHour;
  let m = startMin;
  while (h < endHour || (h === endHour && m < endMin)) {
    slots.push(`${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}`);
    m += 30;
    if (m >= 60) { m = 0; h += 1; }
  }
  return slots;
}

export function hasAvailabilityOnDay(doctorSlug: string, locationId: string, dayOfWeek: number): boolean {
  if (dayOfWeek === 0) return false;
  const availability =
    DOCTOR_AVAILABILITY[doctorSlug]?.[locationId]?.[dayOfWeek] ??
    ALL_WEEK_SLOTS[dayOfWeek as keyof typeof ALL_WEEK_SLOTS];
  return !!availability;
}

export function getAvailableDatesForDoctor(doctorSlug: string, locationId: string, maxDaysAhead = 60): string[] {
  const today = getSwissToday();
  const dates: string[] = [];
  for (let i = 1; i <= maxDaysAhead; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    const dow = getSwissDayOfWeek(d);
    if (hasAvailabilityOnDay(doctorSlug, locationId, dow)) {
      dates.push(formatSwissYmd(d));
    }
  }
  return dates;
}

export function nameToSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}
