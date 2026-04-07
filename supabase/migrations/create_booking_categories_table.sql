-- Create booking_categories table
CREATE TABLE IF NOT EXISTS booking_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  patient_type TEXT NOT NULL CHECK (patient_type IN ('new', 'existing')),
  order_index INTEGER NOT NULL DEFAULT 0,
  slug TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_booking_categories_patient_type ON booking_categories(patient_type);
CREATE INDEX IF NOT EXISTS idx_booking_categories_enabled ON booking_categories(enabled);
CREATE INDEX IF NOT EXISTS idx_booking_categories_order ON booking_categories(order_index);

-- Insert default categories for new patients
INSERT INTO booking_categories (name, description, patient_type, order_index, slug, enabled) VALUES
  ('Première consultations', 'Your first consultation with our specialists', 'new', 0, 'premiere-consultations', true),
  ('Laser et appareils médicaux', 'Advanced laser and medical device treatments', 'new', 1, 'laser-appareils', true),
  ('Offres', 'Special offers and packages', 'new', 2, 'offres', true),
  ('Soins', 'Skincare and wellness treatments', 'new', 3, 'soins', true);

-- Insert default categories for existing patients
INSERT INTO booking_categories (name, description, patient_type, order_index, slug, enabled) VALUES
  ('Consultation', 'Follow-up consultations with our specialists', 'existing', 0, 'consultation', true),
  ('Laser et appareils médicaux', 'Advanced laser and medical device treatments', 'existing', 1, 'laser-appareils', true),
  ('Injections', 'Injectable treatments and aesthetics', 'existing', 2, 'injections', true),
  ('Dermatologie Esthétique', 'Aesthetic dermatology treatments', 'existing', 3, 'dermatologie', true),
  ('Perfusions de vitamine', 'Vitamin infusion therapies', 'existing', 4, 'perfusions', true),
  ('Offres', 'Special offers and packages', 'existing', 5, 'offres', true),
  ('Soins', 'Skincare and wellness treatments', 'existing', 6, 'soins', true);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_booking_categories_updated_at
  BEFORE UPDATE ON booking_categories
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create booking_treatments table
CREATE TABLE IF NOT EXISTS booking_treatments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID NOT NULL REFERENCES booking_categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  order_index INTEGER NOT NULL DEFAULT 0,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for treatments
CREATE INDEX IF NOT EXISTS idx_booking_treatments_category ON booking_treatments(category_id);
CREATE INDEX IF NOT EXISTS idx_booking_treatments_enabled ON booking_treatments(enabled);
CREATE INDEX IF NOT EXISTS idx_booking_treatments_order ON booking_treatments(order_index);

-- Create updated_at trigger for treatments
CREATE TRIGGER update_booking_treatments_updated_at
  BEFORE UPDATE ON booking_treatments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Insert treatments for NEW PATIENTS

-- Première consultations (new patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation laser & appareils médicaux', 40, 0, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Chirurgie Corps', 40, 1, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Chirurgie Visage', 40, 2, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Chute de cheveux', 20, 3, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Dermatologique', 40, 4, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Médecine Longevité', 40, 5, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Injections', 40, 6, true FROM booking_categories WHERE slug = 'premiere-consultations' AND patient_type = 'new';

-- Laser et appareils médicaux (new patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'ONDA Coolwaves', 60, 0, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser Détatouage', 60, 1, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser Pigmentaire', 60, 2, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser vasculaire', 45, 3, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Hifu', 60, 4, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Coolsculpting', 45, 5, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser CO2', 75, 6, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Miradry', 90, 7, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser épilatoire', 60, 8, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'new';

-- Offres (new patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Edition Limitée - Rituel collagène glow', 60, 0, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Edition Limitée - Silhouette ventre plat et tonique', 60, 1, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Edition Limitée - Silhouette galbe fessier', 40, 2, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 4 perfusions de vitamines', 20, 3, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 3 séances - PRP', 20, 4, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 3 séances - Skinbooster', 20, 5, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 1 séance - HIFU Ultraformer MPT', 60, 6, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 3 séances - Injection de Polynucléotides', 20, 7, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 2 séances - Profhilo', 20, 8, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - 1 séance de Laser détatouage à 50%', 60, 9, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'new';

-- Soins (new patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'PRP visage', 20, 0, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Microneedling médicale Dermapen', 30, 1, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Peeling médical - Peeling TCA 15%', 30, 2, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Peeling médical - Peeling TCA 20% + 10% Phénol', 30, 3, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Glass Skin', 60, 4, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Skin Revival', 60, 5, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Vampirelift', 60, 6, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Collagen Reset', 60, 7, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'new';

-- Insert treatments for EXISTING PATIENTS

-- Consultation (existing patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Chirurgie Corps', 40, 0, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Chirurgie Visage', 40, 1, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Chute de cheveux', 20, 2, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Dermatologique', 20, 3, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Médecine Longevité', 40, 4, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Injections - Acide Hyaluronique, Toxine Butolique, Radiesse, Sculptra', 40, 5, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Injections - Profhilo, Polynucléotides, Skinbooster', 20, 6, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Injections - Augmentation des fesses', 40, 7, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Consultation Injections - Traitement de la transpiration par toxine botulique', 40, 8, true FROM booking_categories WHERE slug = 'consultation' AND patient_type = 'existing';

-- Laser et appareils médicaux (existing patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser vasculaire', 45, 0, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Hifu', 75, 1, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Coolsculpting', 90, 2, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser CO2', 60, 3, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Miradry', 20, 4, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Laser épilatoire', 20, 5, true FROM booking_categories WHERE slug = 'laser-appareils' AND patient_type = 'existing';

-- Injections (existing patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Acide Hyaluronique, Toxine Butolique, Radiesse, Sculptra', 40, 0, true FROM booking_categories WHERE slug = 'injections' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Profhilo, Polynucléotides, Skinbooster', 20, 1, true FROM booking_categories WHERE slug = 'injections' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Augmentation des fesses', 40, 2, true FROM booking_categories WHERE slug = 'injections' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Traitement de la transpiration par toxine botulique', 40, 3, true FROM booking_categories WHERE slug = 'injections' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Injections PRP Cheveux', 30, 4, true FROM booking_categories WHERE slug = 'injections' AND patient_type = 'existing';

-- Dermatologie Esthétique (existing patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Excision des grains de beauté pour raison esthétique', 40, 0, true FROM booking_categories WHERE slug = 'dermatologie' AND patient_type = 'existing';

-- Perfusions de vitamine (existing patients) - need to add this category first
INSERT INTO booking_categories (name, description, patient_type, order_index, slug, enabled) VALUES
  ('Perfusions de vitamine', 'Vitamin infusion therapies', 'existing', 4, 'perfusions', true)
ON CONFLICT DO NOTHING;

-- Offres (existing patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Edition Limitée - Rituel collagène glow', 60, 0, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Edition Limitée - Silhouette ventre plat et tonique', 60, 1, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Edition Limitée - Silhouette galbe fessier', 40, 2, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 4 perfusions de vitamines', 20, 3, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 3 séances - PRP', 20, 4, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 3 séances - Skinbooster', 20, 5, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 1 séance - HIFU Ultraformer MPT', 60, 6, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 3 séances - Injection de Polynucléotides', 20, 7, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - Protocole 2 séances - Profhilo', 20, 8, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Offre Découverte - 1 séance de Laser détatouage à 50%', 20, 9, true FROM booking_categories WHERE slug = 'offres' AND patient_type = 'existing';

-- Soins (existing patients)
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'PRP visage', 30, 0, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Microneedling médicale Dermapen', 30, 1, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Peeling médical - Peeling TCA 20% + 10% Phénol', 30, 2, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Glass Skin', 60, 3, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Skin Revival', 60, 4, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Vampirelift', 60, 5, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
INSERT INTO booking_treatments (category_id, name, duration_minutes, order_index, enabled)
SELECT id, 'Soin signature - Collagen Reset', 60, 6, true FROM booking_categories WHERE slug = 'soins' AND patient_type = 'existing';
