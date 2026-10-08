/**
 * BUG-020: `tracking_params.patient_appointment_start` stores the
 * patient-facing start time (it can differ from `start_time` by hidden
 * buffers of a few minutes). Historically some reschedule paths updated
 * `start_time` without shifting this field, leaving stale dates that then
 * appeared in confirmation emails. This resolver only trusts the tracked
 * value when it is consistent with the real start time; otherwise it falls
 * back to `start_time` so emails can never show an old appointment date.
 */
const MAX_TRACKED_DRIFT_MS = 12 * 60 * 60 * 1000; // buffers are minutes, not days

export function resolvePatientAppointmentStart(
  startTime: string | Date,
  trackedStart?: string | null,
): Date {
  const start = typeof startTime === "string" ? new Date(startTime) : startTime;
  if (!trackedStart) return start;
  const tracked = new Date(trackedStart);
  if (Number.isNaN(tracked.getTime()) || Number.isNaN(start.getTime())) return start;
  return Math.abs(tracked.getTime() - start.getTime()) <= MAX_TRACKED_DRIFT_MS ? tracked : start;
}
