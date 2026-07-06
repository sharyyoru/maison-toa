-- Direct links for booking flow, allowing admins to pre-select patient type, category, treatment, and doctor.
CREATE TABLE IF NOT EXISTS booking_links (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  patient_type text NOT NULL CHECK (patient_type IN ('new', 'existing')),
  category_id uuid REFERENCES booking_categories(id) ON DELETE SET NULL,
  treatment_id uuid REFERENCES booking_treatments(id) ON DELETE SET NULL,
  doctor_id uuid REFERENCES booking_doctors(id) ON DELETE SET NULL,
  category_slug text,
  doctor_slug text,
  long_url text NOT NULL,
  short_code text NOT NULL UNIQUE,
  group_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_booking_links_group_name ON booking_links (group_name);
CREATE INDEX IF NOT EXISTS idx_booking_links_patient_type ON booking_links (patient_type);
CREATE INDEX IF NOT EXISTS idx_booking_links_short_code ON booking_links (short_code);
