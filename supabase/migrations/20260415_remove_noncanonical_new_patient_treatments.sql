-- ============================================================
-- Migration: Remove non-canonical treatments from all
-- first-time patient categories.
--
-- Keeps only the exact treatment names defined in the
-- canonical JSON mapping. All other rows (added by previous
-- upsert migrations) are deleted. Doctor assignments cascade.
-- ============================================================

DELETE FROM booking_treatments
WHERE category_id IN (
  SELECT id FROM booking_categories WHERE patient_type = 'new'
)
AND name NOT IN (
  -- ── Première consultations ────────────────────────────────
  'Consultation laser & appareils médicaux',
  'Consultation qualité de peau',
  'Consultation Chirurgie Corps',
  'Consultation Chirurgie Visage',
  'Consultation Chute de cheveux',
  'Consultation Dermatologique',
  'Consultation Médecine Longevité',
  'Consultation Injections',

  -- ── Laser et appareils médicaux ──────────────────────────
  'ONDA Coolwaves',
  'Laser Détatouage',
  'Laser Pigmentaire',
  'Laser vasculaire',
  'Hifu',
  'Coolsculpting',
  'Laser CO2',
  'Miradry',
  'Laser épilatoire',

  -- ── Offres ───────────────────────────────────────────────
  'Offre Edition Limitée - Rituel collagène glow',
  'Offre Edition Limitée - Silhouette ventre plat et tonique',
  'Offre Edition Limitée - Silhouette galbe fessier',
  'Offre Découverte - Protocole 4 perfusions de vitamines',
  'Offre Découverte - Protocole 3 séances - PRP',
  'Offre Découverte - Protocole 3 séances - Skinbooster',
  'Offre Découverte - Protocole 1 séance - HIFU Ultraformer MPT',
  'Offre Découverte - Protocole 3 séances - Injection de Polynucléotides',
  'Offre Découverte - Protocole 2 séances - Profhilo',
  'Offre Découverte - 1 séance de Laser détatouage à 50%',

  -- ── Soins ─────────────────────────────────────────────────
  'PRP visage',
  'Microneedling médicale Dermapen',
  'Peeling médical - Peeling TCA 15%',
  'Peeling médical - Peeling TCA 20% + 10% Phénol',
  'Soin signature - Glass Skin',
  'Soin signature - Skin Revival',
  'Soin signature - Vampirelift',
  'Soin signature - Collagen Reset'
);
