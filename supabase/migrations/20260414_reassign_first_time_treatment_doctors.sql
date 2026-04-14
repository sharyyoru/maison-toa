-- ============================================================
-- Reassign doctors to all First-Time-Patient treatments
-- to match the canonical treatment→calendar mapping.
-- ============================================================

-- Step 1: Ensure all required doctors exist
-- ============================================================
INSERT INTO booking_doctors (name, specialty, slug, enabled, order_index)
VALUES
  ('Sophie Nordback',    'Aesthetic Medicine',       'sophie-nordback',       true, 1),
  ('Alexandra Miles',    'Aesthetic Medicine',       'alexandra-miles',       true, 2),
  ('Reda Benani',        'Longevity Medicine',       'reda-benani',           true, 3),
  ('Adnan Plakalo',      'Aesthetic Medicine',       'adnan-plakalo',         true, 4),
  ('Natalia Koltunova',  'Dermatology & Venereology','natalia-koltunova',     true, 5),
  ('Laetitia Guarino',   'Aesthetic Medicine',       'laetitia-guarino',      true, 6),
  ('Ophélie Perrin',     'Laser & Medical Devices',  'ophelie-perrin',        true, 7),
  ('Claire Balbo',       'Laser & Medical Devices',  'claire-balbo',          true, 8),
  ('Juliette Le Mentec', 'Laser & Medical Devices',  'juliette-le-mentec',    true, 9),
  ('Gwendoline Boursault','Laser & Medical Devices', 'gwendoline-boursault',  true, 10)
ON CONFLICT (slug) DO NOTHING;

-- Step 2: Remove existing assignments for every treatment
--         covered by this mapping (fragment-matched, safe).
-- ============================================================
DELETE FROM booking_treatment_doctors
WHERE treatment_id IN (
  SELECT id FROM booking_treatments
  WHERE name ILIKE ANY (ARRAY[
    '%Consultation Chirurgie Corps%',
    '%Consultation Chirurgie Visage%',
    '%Consultation Chute de cheveux%',
    '%Consultation Dermatologique%',
    '%Consultation Médecine Longevité%',
    '%Consultation Injections%',
    '%Acide Hyaluronique, Toxine%',
    '%Profhilo, Polynucléotides%',
    '%Augmentation des fesses%',
    '%Traitement de la transpiration%',
    '%Injections PRP Cheveux%',
    '%Excision des grains de beauté%',
    '%ONDA Coolwaves%',
    '%étatouage%',
    '%Laser Pigmentaire%',
    '%Laser vasculaire%',
    '%ifu%',
    '%Coolsculpting%',
    '%pilation%',
    '%PRP visage%',
    '%Microneedling%',
    '%Peeling médical%',
    '%Soin signature%',
    '%Rituel collagène glow%',
    '%Silhouette ventre plat%',
    '%Silhouette galbe fessier%',
    '%Protocole 4 perfusions%',
    '%Protocole 3 séances - PRP%',
    '%Protocole 3 séances - Skinbooster%',
    '%Protocole 3 séances - Injection de Polynucléotides%',
    '%Protocole 2 séances - Profhilo%'
  ])
);

-- Step 3: Insert the canonical assignments
-- ============================================================
WITH assignments (treatment_fragment, doctor_fragment) AS (VALUES

  -- ── Consultation Chirurgie Corps ─────────────────────────
  ('Consultation Chirurgie Corps',                        'Sophie Nordback'),
  ('Consultation Chirurgie Corps',                        'Laetitia Guarino'),

  -- ── Consultation Chirurgie Visage ────────────────────────
  ('Consultation Chirurgie Visage',                       'Sophie Nordback'),
  ('Consultation Chirurgie Visage',                       'Alexandra Miles'),

  -- ── Consultation Chute de cheveux ────────────────────────
  ('Consultation Chute de cheveux',                       'Sophie Nordback'),
  ('Consultation Chute de cheveux',                       'Alexandra Miles'),
  ('Consultation Chute de cheveux',                       'Laetitia Guarino'),
  ('Consultation Chute de cheveux',                       'Reda Benani'),

  -- ── Consultation Dermatologique ──────────────────────────
  ('Consultation Dermatologique',                         'Alexandra Miles'),
  ('Consultation Dermatologique',                         'Natalia Koltunova'),

  -- ── Consultation Médecine Longevité ──────────────────────
  ('Consultation Médecine Longevité',                     'Alexandra Miles'),
  ('Consultation Médecine Longevité',                     'Reda Benani'),

  -- ── Consultation Injections / Acide Hyaluronique ─────────
  ('Acide Hyaluronique, Toxine',                          'Sophie Nordback'),
  ('Acide Hyaluronique, Toxine',                          'Alexandra Miles'),
  ('Acide Hyaluronique, Toxine',                          'Laetitia Guarino'),
  ('Acide Hyaluronique, Toxine',                          'Reda Benani'),
  ('Acide Hyaluronique, Toxine',                          'Natalia Koltunova'),
  ('Acide Hyaluronique, Toxine',                          'Adnan Plakalo'),

  -- ── Consultation Injections / Profhilo ───────────────────
  ('Profhilo, Polynucléotides',                           'Sophie Nordback'),
  ('Profhilo, Polynucléotides',                           'Alexandra Miles'),
  ('Profhilo, Polynucléotides',                           'Natalia Koltunova'),
  ('Profhilo, Polynucléotides',                           'Adnan Plakalo'),

  -- ── Consultation Injections / Augmentation des fesses ────
  ('Augmentation des fesses',                             'Sophie Nordback'),
  ('Augmentation des fesses',                             'Alexandra Miles'),
  ('Augmentation des fesses',                             'Natalia Koltunova'),

  -- ── Consultation Injections / Traitement transpiration ───
  ('Traitement de la transpiration',                      'Sophie Nordback'),
  ('Traitement de la transpiration',                      'Alexandra Miles'),

  -- ── Injections PRP Cheveux ───────────────────────────────
  ('Injections PRP Cheveux',                              'Sophie Nordback'),
  ('Injections PRP Cheveux',                              'Alexandra Miles'),
  ('Injections PRP Cheveux',                              'Laetitia Guarino'),
  ('Injections PRP Cheveux',                              'Reda Benani'),

  -- ── Excision des grains de beauté ────────────────────────
  ('Excision des grains de beauté',                       'Alexandra Miles'),
  ('Excision des grains de beauté',                       'Natalia Koltunova'),

  -- ── ONDA Coolwaves ───────────────────────────────────────
  ('ONDA Coolwaves',                                      'Ophélie Perrin'),
  ('ONDA Coolwaves',                                      'Claire Balbo'),
  ('ONDA Coolwaves',                                      'Juliette Le Mentec'),
  ('ONDA Coolwaves',                                      'Gwendoline Boursault'),

  -- ── Laser Détatouage (+ Offre Découverte variant) ────────
  ('étatouage',                                           'Ophélie Perrin'),
  ('étatouage',                                           'Claire Balbo'),
  ('étatouage',                                           'Juliette Le Mentec'),
  ('étatouage',                                           'Gwendoline Boursault'),

  -- ── Laser Pigmentaire ────────────────────────────────────
  ('Laser Pigmentaire',                                   'Ophélie Perrin'),
  ('Laser Pigmentaire',                                   'Claire Balbo'),
  ('Laser Pigmentaire',                                   'Juliette Le Mentec'),
  ('Laser Pigmentaire',                                   'Gwendoline Boursault'),

  -- ── Laser vasculaire ─────────────────────────────────────
  ('Laser vasculaire',                                    'Ophélie Perrin'),
  ('Laser vasculaire',                                    'Claire Balbo'),
  ('Laser vasculaire',                                    'Juliette Le Mentec'),
  ('Laser vasculaire',                                    'Gwendoline Boursault'),

  -- ── HIFU / Hifu (all variants incl. Offre Découverte) ────
  ('ifu',                                                 'Ophélie Perrin'),
  ('ifu',                                                 'Claire Balbo'),
  ('ifu',                                                 'Juliette Le Mentec'),
  ('ifu',                                                 'Gwendoline Boursault'),

  -- ── Coolsculpting ────────────────────────────────────────
  ('Coolsculpting',                                       'Ophélie Perrin'),
  ('Coolsculpting',                                       'Claire Balbo'),
  ('Coolsculpting',                                       'Juliette Le Mentec'),
  ('Coolsculpting',                                       'Gwendoline Boursault'),

  -- ── Laser Epilation (accent-insensitive via fragment) ────
  ('pilation',                                            'Ophélie Perrin'),
  ('pilation',                                            'Claire Balbo'),
  ('pilation',                                            'Juliette Le Mentec'),
  ('pilation',                                            'Gwendoline Boursault'),

  -- ── PRP visage ───────────────────────────────────────────
  ('PRP visage',                                          'Ophélie Perrin'),
  ('PRP visage',                                          'Claire Balbo'),
  ('PRP visage',                                          'Juliette Le Mentec'),
  ('PRP visage',                                          'Gwendoline Boursault'),

  -- ── Microneedling médicale Dermapen ──────────────────────
  ('Microneedling',                                       'Ophélie Perrin'),
  ('Microneedling',                                       'Claire Balbo'),
  ('Microneedling',                                       'Juliette Le Mentec'),
  ('Microneedling',                                       'Gwendoline Boursault'),

  -- ── Peeling médical ──────────────────────────────────────
  ('Peeling médical',                                     'Ophélie Perrin'),
  ('Peeling médical',                                     'Claire Balbo'),
  ('Peeling médical',                                     'Juliette Le Mentec'),
  ('Peeling médical',                                     'Gwendoline Boursault'),

  -- ── Soin signature ───────────────────────────────────────
  ('Soin signature',                                      'Ophélie Perrin'),
  ('Soin signature',                                      'Claire Balbo'),
  ('Soin signature',                                      'Juliette Le Mentec'),
  ('Soin signature',                                      'Gwendoline Boursault'),

  -- ── Offre Edition Limitée – Rituel collagène glow ────────
  ('Rituel collagène glow',                               'Sophie Nordback'),
  ('Rituel collagène glow',                               'Alexandra Miles'),
  ('Rituel collagène glow',                               'Laetitia Guarino'),
  ('Rituel collagène glow',                               'Reda Benani'),
  ('Rituel collagène glow',                               'Natalia Koltunova'),

  -- ── Offre Edition Limitée – Silhouette ventre plat ───────
  ('Silhouette ventre plat',                              'Sophie Nordback'),
  ('Silhouette ventre plat',                              'Alexandra Miles'),
  ('Silhouette ventre plat',                              'Laetitia Guarino'),
  ('Silhouette ventre plat',                              'Reda Benani'),
  ('Silhouette ventre plat',                              'Natalia Koltunova'),

  -- ── Offre Edition Limitée – Silhouette galbe fessier ─────
  ('Silhouette galbe fessier',                            'Sophie Nordback'),
  ('Silhouette galbe fessier',                            'Alexandra Miles'),
  ('Silhouette galbe fessier',                            'Laetitia Guarino'),
  ('Silhouette galbe fessier',                            'Reda Benani'),
  ('Silhouette galbe fessier',                            'Natalia Koltunova'),

  -- ── Offre Découverte – Protocole 4 perfusions de vitamines
  ('Protocole 4 perfusions',                              'Alexandra Miles'),
  ('Protocole 4 perfusions',                              'Reda Benani'),

  -- ── Offre Découverte – Protocole 3 séances PRP ───────────
  ('Protocole 3 séances - PRP',                           'Sophie Nordback'),
  ('Protocole 3 séances - PRP',                           'Alexandra Miles'),
  ('Protocole 3 séances - PRP',                           'Laetitia Guarino'),
  ('Protocole 3 séances - PRP',                           'Reda Benani'),
  ('Protocole 3 séances - PRP',                           'Natalia Koltunova'),
  ('Protocole 3 séances - PRP',                           'Adnan Plakalo'),

  -- ── Offre Découverte – Protocole 3 séances Skinbooster ───
  ('Protocole 3 séances - Skinbooster',                   'Sophie Nordback'),
  ('Protocole 3 séances - Skinbooster',                   'Alexandra Miles'),
  ('Protocole 3 séances - Skinbooster',                   'Laetitia Guarino'),
  ('Protocole 3 séances - Skinbooster',                   'Reda Benani'),
  ('Protocole 3 séances - Skinbooster',                   'Natalia Koltunova'),
  ('Protocole 3 séances - Skinbooster',                   'Adnan Plakalo'),

  -- ── Offre Découverte – Protocole 3 séances Polynucléotides
  ('Protocole 3 séances - Injection de Polynucléotides',  'Sophie Nordback'),
  ('Protocole 3 séances - Injection de Polynucléotides',  'Alexandra Miles'),
  ('Protocole 3 séances - Injection de Polynucléotides',  'Laetitia Guarino'),
  ('Protocole 3 séances - Injection de Polynucléotides',  'Reda Benani'),
  ('Protocole 3 séances - Injection de Polynucléotides',  'Natalia Koltunova'),
  ('Protocole 3 séances - Injection de Polynucléotides',  'Adnan Plakalo'),

  -- ── Offre Découverte – Protocole 2 séances Profhilo ──────
  ('Protocole 2 séances - Profhilo',                      'Sophie Nordback'),
  ('Protocole 2 séances - Profhilo',                      'Alexandra Miles'),
  ('Protocole 2 séances - Profhilo',                      'Laetitia Guarino'),
  ('Protocole 2 séances - Profhilo',                      'Reda Benani'),
  ('Protocole 2 séances - Profhilo',                      'Natalia Koltunova'),
  ('Protocole 2 séances - Profhilo',                      'Adnan Plakalo')
  -- "Offre Découverte - 1 séance de Laser détatouage" is covered
  -- by the 'étatouage' fragment above.
)
INSERT INTO booking_treatment_doctors (treatment_id, doctor_id, order_index)
SELECT DISTINCT
  bt.id,
  bd.id,
  (ROW_NUMBER() OVER (PARTITION BY bt.id ORDER BY bd.order_index))::int - 1
FROM assignments a
JOIN booking_treatments bt ON bt.name ILIKE '%' || a.treatment_fragment || '%'
JOIN booking_doctors    bd ON bd.name ILIKE '%' || a.doctor_fragment    || '%'
ON CONFLICT (treatment_id, doctor_id) DO NOTHING;

