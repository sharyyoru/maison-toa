import assert from "node:assert/strict";
import {
  addReleaseBoundary,
  fitsWithinDailyAvailability,
  hasCapacityConflict,
  mergeAvailableTimes,
  type BookingInterval,
} from "../lib/exactBookingAvailability";

const at = (time: string) => new Date(`2026-07-21T${time}:00.000Z`);

const candidates = new Map<number, Date>();
addReleaseBoundary(candidates, at("09:40"), 0, at("09:00"), at("18:00"));
assert.deepEqual([...candidates.values()].map((date) => date.toISOString()), [at("09:40").toISOString()]);

assert.deepEqual(
  mergeAvailableTimes(
    ["09:30", "10:00", "10:30"],
    ["09:40", "10:00"],
    { start: "09:00", end: "18:00" },
    { durationMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  ),
  ["09:30", "09:40", "10:00", "10:30"],
);

assert.equal(
  fitsWithinDailyAvailability(
    "17:50",
    { start: "09:00", end: "18:00" },
    { durationMinutes: 20, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
  ),
  false,
);
assert.equal(
  fitsWithinDailyAvailability(
    "09:10",
    { start: "09:00", end: "18:00" },
    { durationMinutes: 20, bufferBeforeMinutes: 15, bufferAfterMinutes: 0 },
  ),
  false,
);

const intervals: BookingInterval[] = [
  { start: at("09:00"), end: at("09:40"), groupId: "first" },
  { start: at("09:20"), end: at("10:00"), groupId: "second" },
];
assert.equal(hasCapacityConflict(at("09:40"), at("10:00"), intervals, 1), true);
assert.equal(hasCapacityConflict(at("10:00"), at("10:20"), intervals, 1), false);
assert.equal(hasCapacityConflict(at("09:40"), at("10:00"), intervals, 2), false);

const mirroredUse: BookingInterval[] = [
  { start: at("09:00"), end: at("10:00"), groupId: "same-use" },
  { start: at("09:00"), end: at("10:00"), groupId: "same-use" },
];
assert.equal(hasCapacityConflict(at("09:20"), at("09:40"), mirroredUse, 2), false);

console.log("Exact booking availability tests passed");
