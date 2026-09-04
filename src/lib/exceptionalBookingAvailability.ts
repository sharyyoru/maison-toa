export type ExceptionalBookingWindow = {
  id: string;
  exception_date: string;
  start_time: string;
  end_time: string;
  treatment_ids: string[];
  label?: string | null;
};

export function getExceptionalWindowForTreatment(
  windows: ExceptionalBookingWindow[],
  date: string,
  treatmentId: string,
): ExceptionalBookingWindow | undefined {
  return windows.find(
    (window) =>
      window.exception_date === date && window.treatment_ids.includes(treatmentId),
  );
}

export function generateExceptionalTimeSlots(window: ExceptionalBookingWindow): string[] {
  const toMinutes = (value: string) => {
    const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
    return hours * 60 + minutes;
  };
  const format = (minutes: number) =>
    `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;

  const slots: string[] = [];
  for (let minute = toMinutes(window.start_time); minute < toMinutes(window.end_time); minute += 30) {
    slots.push(format(minute));
  }
  return slots;
}

export function restrictSlotsToExceptionalRules(
  slots: string[],
  windows: ExceptionalBookingWindow[],
  date: string,
  treatmentId: string,
): string[] {
  return slots.filter((time) => isTimeAllowedByExceptionalRules(windows, date, treatmentId, time));
}

export function isTimeAllowedByExceptionalRules(
  windows: ExceptionalBookingWindow[],
  date: string,
  treatmentId: string,
  time: string,
): boolean {
  const activeWindows = windows.filter(
    (window) =>
      window.exception_date === date &&
      time >= window.start_time.slice(0, 5) &&
      time < window.end_time.slice(0, 5),
  );
  return activeWindows.length === 0 || activeWindows.some((window) => window.treatment_ids.includes(treatmentId));
}
