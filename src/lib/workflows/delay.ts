import type { DelayNode } from "./types";

const ZURICH = "Europe/Zurich";

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: ZURICH, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute"), second: get("second") };
}

function zonedLocalToUtc(parts: ReturnType<typeof zonedParts>) {
  const desired = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  let guess = new Date(desired);
  for (let index = 0; index < 3; index++) {
    const actual = zonedParts(guess);
    const rendered = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    guess = new Date(guess.getTime() + desired - rendered);
  }
  return guess;
}

export function addWorkflowDelay(anchor: Date, delay: DelayNode["data"]): Date {
  const multipliers = { minutes: 60_000, hours: 3_600_000, days: 86_400_000, weeks: 604_800_000 } as const;
  if (delay.unit !== "months") return new Date(anchor.getTime() + delay.value * multipliers[delay.unit]);
  const local = zonedParts(anchor);
  const targetMonthStart = new Date(Date.UTC(local.year, local.month - 1 + delay.value, 1));
  const year = targetMonthStart.getUTCFullYear();
  const month = targetMonthStart.getUTCMonth() + 1;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return zonedLocalToUtc({ ...local, year, month, day: Math.min(local.day, daysInMonth) });
}

