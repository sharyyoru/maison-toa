export type BookingInterval = {
  start: Date;
  end: Date;
  groupId?: string;
};

export type BookingWindow = {
  durationMinutes: number;
  bufferBeforeMinutes: number;
  bufferAfterMinutes: number;
};

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function generateThirtyMinuteStarts(rangeStart: Date, rangeEnd: Date): Date[] {
  const starts: Date[] = [];
  let current = new Date(rangeStart);
  current.setMinutes(Math.floor(current.getMinutes() / 30) * 30, 0, 0);
  while (current < rangeEnd) {
    starts.push(new Date(current));
    current = new Date(current.getTime() + THIRTY_MINUTES_MS);
  }
  return starts;
}

export function addReleaseBoundary(
  candidates: Map<number, Date>,
  end: Date,
  offsetMinutes: number,
  rangeStart: Date,
  rangeEnd: Date,
): void {
  const candidate = new Date(end.getTime() + offsetMinutes * 60 * 1000);
  if (candidate >= rangeStart && candidate < rangeEnd) {
    candidates.set(candidate.getTime(), candidate);
  }
}

export function intervalOverlaps(candidateStart: Date, candidateEnd: Date, interval: BookingInterval): boolean {
  return interval.start < candidateEnd && interval.end > candidateStart;
}

/**
 * Returns true when adding one more booking would exceed capacity during any
 * non-zero portion of the candidate interval. Group IDs deduplicate mirrored
 * rows representing the same resource use.
 */
export function hasCapacityConflict(
  candidateStart: Date,
  candidateEnd: Date,
  intervals: BookingInterval[],
  capacity: number,
): boolean {
  if (capacity <= 0) return true;
  const boundaries = new Set<number>([candidateStart.getTime(), candidateEnd.getTime()]);
  for (const interval of intervals) {
    if (!intervalOverlaps(candidateStart, candidateEnd, interval)) continue;
    boundaries.add(Math.max(candidateStart.getTime(), interval.start.getTime()));
    boundaries.add(Math.min(candidateEnd.getTime(), interval.end.getTime()));
  }

  const ordered = [...boundaries].sort((a, b) => a - b);
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const segmentStart = ordered[index];
    const segmentEnd = ordered[index + 1];
    if (segmentEnd <= segmentStart) continue;
    const activeGroups = new Set<string>();
    intervals.forEach((interval, intervalIndex) => {
      if (interval.start.getTime() < segmentEnd && interval.end.getTime() > segmentStart) {
        activeGroups.add(interval.groupId || `interval-${intervalIndex}`);
      }
    });
    if (activeGroups.size >= capacity) return true;
  }
  return false;
}

export function fitsWithinDailyAvailability(
  time: string,
  availability: { start: string; end: string },
  window: BookingWindow,
): boolean {
  const toMinutes = (value: string) => {
    const [hour, minute] = value.split(":").map(Number);
    return hour * 60 + minute;
  };
  const selected = toMinutes(time);
  return selected - window.bufferBeforeMinutes >= toMinutes(availability.start)
    && selected + window.durationMinutes + window.bufferAfterMinutes <= toMinutes(availability.end);
}

export function mergeAvailableTimes(
  gridTimes: string[],
  exactTimes: string[],
  availability: { start: string; end: string },
  window: BookingWindow,
): string[] {
  return [...new Set([...gridTimes, ...exactTimes])]
    .filter((time) => fitsWithinDailyAvailability(time, availability, window))
    .sort((a, b) => a.localeCompare(b));
}
