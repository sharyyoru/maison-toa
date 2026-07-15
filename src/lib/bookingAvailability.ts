import { getSwissSlotString, formatSwissYmd } from "@/lib/swissTimezone";

export type BlockedSlotsByDate = Record<string, string[]>;
export type AvailableSlot = { date: string; time: string };

type FetchAvailabilityParams = {
  start: string;
  end: string;
  doctorName: string;
  doctorSlug: string;
  treatmentId: string;
  categorySlug?: string;
  patientType?: "new" | "existing";
  signal?: AbortSignal;
};

type GetNextOpenSlotsParams = {
  dates: string[];
  blockedSlotsByDate: BlockedSlotsByDate;
  generateTimeSlots: (date: string) => string[];
  limit?: number;
};

export function groupFullSlotsBySwissDate(fullSlots: string[] = []): BlockedSlotsByDate {
  return fullSlots.reduce<BlockedSlotsByDate>((groups, isoTime) => {
    const slotDate = new Date(isoTime);
    const date = formatSwissYmd(slotDate);
    const time = getSwissSlotString(slotDate);
    groups[date] = [...(groups[date] || []), time];
    return groups;
  }, {});
}

export async function fetchAvailabilityWindow({
  start,
  end,
  doctorName,
  doctorSlug,
  treatmentId,
  categorySlug,
  patientType,
  signal,
}: FetchAvailabilityParams): Promise<BlockedSlotsByDate> {
  const params = new URLSearchParams({
    start,
    end,
    doctor: doctorName,
    slug: doctorSlug,
    treatmentId,
  });
  if (categorySlug) params.set("categorySlug", categorySlug);
  if (patientType) params.set("patientType", patientType);
  const res = await fetch(`/api/appointments/check-availability?${params.toString()}`, { signal });
  const data = await res.json();
  return groupFullSlotsBySwissDate(data.unavailableStarts || data.fullSlots || []);
}

export function getNextOpenSlots({
  dates,
  blockedSlotsByDate,
  generateTimeSlots,
  limit = 15,
}: GetNextOpenSlotsParams): AvailableSlot[] {
  const slotsToShow: AvailableSlot[] = [];

  for (const date of dates) {
    const blockedSlots = blockedSlotsByDate[date] || [];
    const openSlots = generateTimeSlots(date).filter((time) => !blockedSlots.includes(time));

    for (const time of openSlots) {
      slotsToShow.push({ date, time });
      if (slotsToShow.length >= limit) {
        return slotsToShow;
      }
    }
  }

  return slotsToShow;
}
