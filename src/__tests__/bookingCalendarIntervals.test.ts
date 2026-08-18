import assert from "node:assert/strict";
import { getBookingCalendarIntervals } from "../lib/bookingCalendarIntervals";
import { fitsWithinDailyAvailability } from "../lib/exactBookingAvailability";

const bookingStart = new Date("2026-07-22T09:30:00.000Z");

const beginning = getBookingCalendarIntervals({
  bookingStart,
  primaryDurationMinutes: 20,
  secondaryDurationMinutes: 60,
  secondaryPosition: "start",
});
assert.equal(beginning.doctorServiceStart.toISOString(), "2026-07-22T09:30:00.000Z");
assert.equal(beginning.doctorServiceEnd.toISOString(), "2026-07-22T09:50:00.000Z");
assert.equal(beginning.secondaryCalendarStart?.toISOString(), "2026-07-22T09:30:00.000Z");
assert.equal(beginning.secondaryCalendarEnd?.toISOString(), "2026-07-22T10:30:00.000Z");
assert.equal(beginning.patientStart.toISOString(), "2026-07-22T09:30:00.000Z");

const ending = getBookingCalendarIntervals({
  bookingStart,
  primaryDurationMinutes: 20,
  secondaryDurationMinutes: 60,
  secondaryPosition: "end",
});
assert.equal(ending.doctorServiceStart.toISOString(), "2026-07-22T09:30:00.000Z");
assert.equal(ending.doctorServiceEnd.toISOString(), "2026-07-22T09:50:00.000Z");
assert.equal(ending.secondaryCalendarStart?.toISOString(), "2026-07-22T08:50:00.000Z");
assert.equal(ending.secondaryCalendarEnd?.toISOString(), "2026-07-22T09:50:00.000Z");
assert.equal(ending.patientStart.toISOString(), "2026-07-22T08:50:00.000Z");

const manualServiceEnding = getBookingCalendarIntervals({
  bookingStart,
  primaryDurationMinutes: 20,
  secondaryDurationMinutes: 75,
  secondaryPosition: "end",
});
assert.equal(manualServiceEnding.doctorServiceStart.toISOString(), "2026-07-22T09:30:00.000Z");
assert.equal(manualServiceEnding.doctorServiceEnd.toISOString(), "2026-07-22T09:50:00.000Z");
assert.equal(manualServiceEnding.secondaryCalendarStart?.toISOString(), "2026-07-22T08:35:00.000Z");
assert.equal(manualServiceEnding.secondaryCalendarEnd?.toISOString(), "2026-07-22T09:50:00.000Z");

const bufferedEnding = getBookingCalendarIntervals({
  bookingStart,
  primaryDurationMinutes: 20,
  bufferBeforeMinutes: 10,
  bufferAfterMinutes: 5,
  secondaryDurationMinutes: 60,
  secondaryPosition: "end",
});
assert.equal(bufferedEnding.doctorCalendarStart.toISOString(), "2026-07-22T09:20:00.000Z");
assert.equal(bufferedEnding.doctorCalendarEnd.toISOString(), "2026-07-22T09:55:00.000Z");

assert.equal(fitsWithinDailyAvailability(
  "09:30",
  { start: "09:30", end: "10:30" },
  { durationMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, startOffsetMinutes: 0 },
), true);
assert.equal(fitsWithinDailyAvailability(
  "09:30",
  { start: "09:45", end: "11:00" },
  { durationMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0, startOffsetMinutes: 0 },
), false);

console.log("Booking calendar interval tests passed");
