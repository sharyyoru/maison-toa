import { getSwissSlotString, formatSwissYmd } from "@/lib/swissTimezone";
import { mergeAvailableTimes, type BookingWindow } from "@/lib/exactBookingAvailability";

export type BlockedSlotsByDate = Record<string, string[]>;
export type AvailableSlot = { date: string; time: string };
export type AvailabilityWindowResult = {
  unavailableByDate: BlockedSlotsByDate;
  exactAvailableByDate: BlockedSlotsByDate;
  bookingWindow: BookingWindow;
};

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
  availabilityWindow: AvailabilityWindowResult;
  generateTimeSlots: (date: string) => string[];
  getDayAvailability: (date: string) => { start: string; end: string } | undefined;
  isTimeAllowed?: (date: string, time: string) => boolean;
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
}: FetchAvailabilityParams): Promise<AvailabilityWindowResult> {
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
  if (!res.ok) throw new Error("Failed to load appointment availability");
  const data = await res.json();
  return {
    unavailableByDate: groupFullSlotsBySwissDate(data.unavailableStarts || data.fullSlots || []),
    exactAvailableByDate: groupFullSlotsBySwissDate(data.availableStarts || []),
    bookingWindow: data.bookingWindow || {
      durationMinutes: 60,
      bufferBeforeMinutes: 0,
      bufferAfterMinutes: 0,
    },
  };
}

export function getNextOpenSlots({
  dates,
  availabilityWindow,
  generateTimeSlots,
  getDayAvailability,
  isTimeAllowed,
  limit = 15,
}: GetNextOpenSlotsParams): AvailableSlot[] {
  const slotsToShow: AvailableSlot[] = [];

  for (const date of dates) {
    const dayAvailability = getDayAvailability(date);
    if (!dayAvailability) continue;
    const blockedSlots = availabilityWindow.unavailableByDate[date] || [];
    const gridSlots = generateTimeSlots(date).filter((time) => !blockedSlots.includes(time));
    const openSlots = mergeAvailableTimes(
      gridSlots,
      availabilityWindow.exactAvailableByDate[date] || [],
      dayAvailability,
      availabilityWindow.bookingWindow,
    ).filter((time) => !isTimeAllowed || isTimeAllowed(date, time));

    for (const time of openSlots) {
      slotsToShow.push({ date, time });
      if (slotsToShow.length >= limit) {
        return slotsToShow;
      }
    }
  }

  return slotsToShow;
}
