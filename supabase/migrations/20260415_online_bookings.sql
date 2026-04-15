-- ============================================================
-- Migration: Support online_booking as an appointment source.
--
-- 1. Extend the source check constraint to allow 'online_booking'
-- 2. Back-fill existing appointments that came from the public
--    booking portal (identified by [Online Booking] in reason)
-- 3. Add an index on source for fast filtering
-- ============================================================

-- Step 1: Drop and recreate the source check constraint
ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_source_check;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_source_check
  CHECK (source IN ('manual', 'ai', 'online_booking'));

-- Step 2: Back-fill existing online bookings
UPDATE appointments
SET source = 'online_booking'
WHERE reason ILIKE '%[Online Booking]%'
  AND source = 'manual';

-- Step 3: Index for fast filtering by source
CREATE INDEX IF NOT EXISTS appointments_source_idx ON appointments(source);
