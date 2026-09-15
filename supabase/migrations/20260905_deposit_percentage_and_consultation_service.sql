ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS deposit_percentage integer NOT NULL DEFAULT 100;

ALTER TABLE booking_categories
  ADD COLUMN IF NOT EXISTS consultation_service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS consultation_deposit_percentage integer NOT NULL DEFAULT 100;

-- Preserve existing behavior: treatments that already required prepayment
-- kept their 50% deposit until an admin changes the percentage in settings.
UPDATE booking_treatments
SET deposit_percentage = 50
WHERE prepayment_required = true AND deposit_percentage = 100;
