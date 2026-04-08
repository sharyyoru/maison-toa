-- Add skip_treatment column to booking_categories
-- When true, the booking flow skips step 3 (treatment selection) and goes directly to step 4 (doctor selection)
ALTER TABLE booking_categories
  ADD COLUMN IF NOT EXISTS skip_treatment BOOLEAN NOT NULL DEFAULT false;
