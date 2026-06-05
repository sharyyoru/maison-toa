ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS service_category_id uuid
  REFERENCES service_categories(id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_treatments_service_category
  ON booking_treatments(service_category_id);
