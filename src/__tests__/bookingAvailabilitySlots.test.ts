import assert from "node:assert/strict";
import { getNextOpenSlots } from "../lib/bookingAvailability";

const window = {
  unavailableByDate: { "2026-11-12": ["14:00"] },
  // 14:45 is an off-grid exceptional start the server checked and found busy,
  // so it is in neither list; 15:15 was checked and is free.
  exactAvailableByDate: { "2026-11-12": ["14:30", "15:15"] },
  bookingWindow: { durationMinutes: 30, bufferBeforeMinutes: 0, bufferAfterMinutes: 0 },
};

const slots = getNextOpenSlots({
  dates: ["2026-11-12"],
  availabilityWindow: window,
  generateTimeSlots: () => ["14:00", "14:30", "14:45", "15:15", "15:45"],
  getDayAvailability: () => ({ start: "14:00", end: "16:00" }),
  limit: 10,
}).map((slot) => slot.time);

assert.deepEqual(slots, ["14:30", "15:15"]);
console.log("bookingAvailabilitySlots: all assertions passed");
