ALTER TABLE booking_treatments
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS prepayment_required BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS linked_service_id UUID REFERENCES services(id) ON DELETE SET NULL;
