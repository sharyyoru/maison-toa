-- Calendar enhancements: editable category colors, VIP patients
-- Adds a nullable `color` Tailwind class to service_categories so admins can recolor categories,
-- and an `is_vip` flag on patients so the calendar can display a VIP badge on appointments.

ALTER TABLE service_categories
  ADD COLUMN IF NOT EXISTS color TEXT;

ALTER TABLE patients
  ADD COLUMN IF NOT EXISTS is_vip BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_patients_is_vip ON patients(is_vip) WHERE is_vip = TRUE;
