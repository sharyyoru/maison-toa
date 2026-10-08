import type { SupabaseClient } from "@supabase/supabase-js";
import { getSwissSlotString } from "@/lib/swissTimezone";

export type OnlineBookingTimeRange = {
  from: string | null; // "HH:MM" Swiss time — earliest bookable start
  until: string | null; // "HH:MM" Swiss time — latest bookable start
};

const TIME_PATTERN = /^([01]?\d|2[0-3]):[0-5]\d$/;

function normalizeTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().slice(0, 5);
  if (!TIME_PATTERN.test(trimmed)) return null;
  const [h, m] = trimmed.split(":");
  return `${h.padStart(2, "0")}:${m}`;
}

function mergeRanges(a: OnlineBookingTimeRange, b: OnlineBookingTimeRange): OnlineBookingTimeRange {
  // Intersection: the latest "from" and the earliest "until" win.
  const from = [a.from, b.from].filter(Boolean).sort().pop() ?? null;
  const until = [a.until, b.until].filter(Boolean).sort().shift() ?? null;
  return { from, until };
}

export function hasOnlineBookingRange(range: OnlineBookingTimeRange | null): range is OnlineBookingTimeRange {
  return Boolean(range && (range.from || range.until));
}

/** True when a Swiss-time slot start ("HH:MM" or Date/ISO) is allowed by the range. */
export function isWithinOnlineBookingRange(
  slot: string | Date,
  range: OnlineBookingTimeRange | null,
): boolean {
  if (!hasOnlineBookingRange(range)) return true;
  const slotHHMM = typeof slot === "string" && TIME_PATTERN.test(slot.slice(0, 5))
    ? slot.slice(0, 5)
    : getSwissSlotString(slot);
  if (range.from && slotHHMM < range.from) return false;
  if (range.until && slotHHMM > range.until) return false;
  return true;
}

/**
 * BP-018: resolve the online booking time range for a booking treatment —
 * the intersection of the treatment's own range and the range of the machine
 * it requires (direct machine_id, or via the linked service's machine).
 * Returns null when no restriction applies.
 */
export async function resolveOnlineBookingRange(
  supabase: SupabaseClient,
  treatmentId: string | null | undefined,
): Promise<OnlineBookingTimeRange | null> {
  if (!treatmentId || treatmentId === "none") return null;
  try {
    const { data: treatment } = await supabase
      .from("booking_treatments")
      .select("id, machine_id, linked_service_id, online_booking_start_time, online_booking_end_time")
      .eq("id", treatmentId)
      .maybeSingle();
    if (!treatment) return null;

    let range: OnlineBookingTimeRange = {
      from: normalizeTime(treatment.online_booking_start_time),
      until: normalizeTime(treatment.online_booking_end_time),
    };

    let machineId: string | null = treatment.machine_id ?? null;
    if (!machineId && treatment.linked_service_id) {
      const { data: mapping } = await supabase
        .from("service_machines")
        .select("machine_id")
        .eq("service_id", treatment.linked_service_id)
        .limit(1)
        .maybeSingle();
      machineId = mapping?.machine_id ?? null;
    }
    if (machineId) {
      const { data: machine } = await supabase
        .from("machines")
        .select("online_booking_start_time, online_booking_end_time")
        .eq("id", machineId)
        .maybeSingle();
      if (machine) {
        range = mergeRanges(range, {
          from: normalizeTime(machine.online_booking_start_time),
          until: normalizeTime(machine.online_booking_end_time),
        });
      }
    }

    return hasOnlineBookingRange(range) ? range : null;
  } catch (err) {
    console.error("Failed to resolve online booking time range:", err);
    return null;
  }
}

/**
 * Resolve the merged online booking range for a set of machine ids
 * (used by the public reschedule flow where only the appointment's
 * machines are known).
 */
export async function resolveMachinesOnlineBookingRange(
  supabase: SupabaseClient,
  machineIds: string[] | null | undefined,
): Promise<OnlineBookingTimeRange | null> {
  if (!machineIds || machineIds.length === 0) return null;
  try {
    const { data: machines } = await supabase
      .from("machines")
      .select("online_booking_start_time, online_booking_end_time")
      .in("id", machineIds);
    let range: OnlineBookingTimeRange = { from: null, until: null };
    for (const machine of machines ?? []) {
      range = mergeRanges(range, {
        from: normalizeTime(machine.online_booking_start_time),
        until: normalizeTime(machine.online_booking_end_time),
      });
    }
    return hasOnlineBookingRange(range) ? range : null;
  } catch (err) {
    console.error("Failed to resolve machine online booking range:", err);
    return null;
  }
}
