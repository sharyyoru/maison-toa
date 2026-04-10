-- Create booking_doctors table (global pool of doctors for the booking flow)
CREATE TABLE IF NOT EXISTS booking_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  specialty TEXT,
  image_url TEXT,
  description TEXT,
  slug TEXT UNIQUE NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  order_index INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Junction table: which doctors are assigned to a specific treatment
CREATE TABLE IF NOT EXISTS booking_treatment_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  treatment_id UUID NOT NULL REFERENCES booking_treatments(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES booking_doctors(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(treatment_id, doctor_id)
);

-- Junction table: which doctors are assigned to a category (used when skip_treatment = true)
CREATE TABLE IF NOT EXISTS booking_category_doctors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES booking_categories(id) ON DELETE CASCADE,
  doctor_id UUID NOT NULL REFERENCES booking_doctors(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  UNIQUE(category_id, doctor_id)
);/

-- Seed with the existing hardcoded doctors
INSERT INTO booking_doctors (name, specialty, image_url, description, slug, enabled, order_index) VALUES
('Dr. Sophie Nordback', 'Dermatology & Venereology', '/doctors/dr-sophie-nordback-correct.png', 'FMH-qualified plastic and aesthetic surgeon. Co-founder of Clinique Maison Tóā.', 'sophie-nordback', true, 0),
('Dr. Alexandra Miles', 'Aesthetic Medicine', '/doctors/dr-alexandra-miles.webp', 'Specialist in aesthetic medicine and anti-aging treatments.', 'alexandra-miles', true, 1),
('Dr. Reda Benani', 'Longevity Medicine', '/doctors/dr-reda-benanni.webp', 'Practicing physician specializing in longevity medicine.', 'reda-benani', true, 2),
('Dr. Adnan Plakalo', 'Medical Practitioner', '/doctors/dr-adnan-plakalo.png', 'Medical practitioner.', 'adnan-plakalo', true, 3),
('Dr. Natalia Koltunova', 'Dermatology & Venereology', '/doctors/dr-natalia-koltunova.webp', 'Russian postgraduate diploma in Dermatology and Venereology.', 'natalia-koltunova', true, 4)
ON CONFLICT (slug) DO NOTHING;
