-- ============================================================
-- Migration: Assign doctors to first-time patient treatments
-- per the canonical JSON mapping (2026-04-15).
--
-- New patient category UUIDs:
--   Première consultations:  82433cac-0cb7-4989-8ae3-4cc2c0eaf6e9
--   Laser et appareils:      13ec6dc4-8abf-4e9c-b1b5-884e70474f56
--   Offres:                  d7ac8c1d-4bc5-4944-8f9a-540fbe5c402f
--   Soins:                   818d5765-95ea-4a55-9f70-169f89e8de58
-- ============================================================

-- ── Step 1: Ensure all required doctors exist ─────────────────
INSERT INTO booking_doctors (name, specialty, slug, enabled, order_index)
VALUES
  ('Sophie Nordback',      'Aesthetic Medicine',        'sophie-nordback',      true,  1),
  ('Alexandra Miles',      'Aesthetic Medicine',        'alexandra-miles',      true,  2),
  ('Laetitia Guarino',     'Aesthetic Medicine',        'laetitia-guarino',     true,  3),
  ('Reda Benani',          'Longevity Medicine',        'reda-benani',          true,  4),
  ('Natalia Koltunova',    'Dermatology & Venereology', 'natalia-koltunova',    true,  5),
  ('Adnan Plakalo',        'Aesthetic Medicine',        'adnan-plakalo',        true,  6),
  ('Ophélie Perrin',       'Laser & Medical Devices',   'ophelie-perrin',       true,  7),
  ('Claire Balbo',         'Laser & Medical Devices',   'claire-balbo',         true,  8),
  ('Juliette Le Mentec',   'Laser & Medical Devices',   'juliette-le-mentec',   true,  9),
  ('Gwendoline Boursault', 'Laser & Medical Devices',   'gwendoline-boursault', true, 10)
ON CONFLICT (slug) DO NOTHING;

-- ── Step 2: Clear all doctor assignments for new-patient treatments ──
DELETE FROM booking_treatment_doctors
WHERE treatment_id IN (
  SELECT bt.id
  FROM booking_treatments bt
  JOIN booking_categories bc ON bc.id = bt.category_id
  WHERE bc.patient_type = 'new'
);

-- ── Step 3: Re-assign doctors per the canonical mapping ──────────────
WITH assignments (treatment_fragment, doctor_slug) AS (VALUES

  -- ── Première consultations ────────────────────────────────────────
  -- Consultation laser & appareils médicaux
  ('Consultation laser',                                   'sophie-nordback'),
  ('Consultation laser',                                   'alexandra-miles'),
  ('Consultation laser',                                   'laetitia-guarino'),
  ('Consultation laser',                                   'reda-benani'),

  -- Consultation qualité de peau
  ('Consultation qualité de peau',                         'sophie-nordback'),
  ('Consultation qualité de peau',                         'alexandra-miles'),
  ('Consultation qualité de peau',                         'laetitia-guarino'),
  ('Consultation qualité de peau',                         'reda-benani'),

  -- Consultation Chirurgie Corps
  ('Consultation Chirurgie Corps',                         'sophie-nordback'),
  ('Consultation Chirurgie Corps',                         'laetitia-guarino'),

  -- Consultation Chirurgie Visage
  ('Consultation Chirurgie Visage',                        'sophie-nordback'),
  ('Consultation Chirurgie Visage',                        'alexandra-miles'),
  ('Consultation Chirurgie Visage',                        'laetitia-guarino'),
  ('Consultation Chirurgie Visage',                        'natalia-koltunova'),
  ('Consultation Chirurgie Visage',                        'adnan-plakalo'),

  -- Consultation Chute de cheveux
  ('Consultation Chute de cheveux',                        'sophie-nordback'),
  ('Consultation Chute de cheveux',                        'alexandra-miles'),
  ('Consultation Chute de cheveux',                        'laetitia-guarino'),
  ('Consultation Chute de cheveux',                        'reda-benani'),

  -- Consultation Dermatologique
  ('Consultation Dermatologique',                          'alexandra-miles'),
  ('Consultation Dermatologique',                          'natalia-koltunova'),

  -- Consultation Médecine Longevité
  ('Consultation Médecine Longevité',                      'alexandra-miles'),
  ('Consultation Médecine Longevité',                      'reda-benani'),

  -- Consultation Injections
  ('Consultation Injections',                              'sophie-nordback'),
  ('Consultation Injections',                              'alexandra-miles'),
  ('Consultation Injections',                              'laetitia-guarino'),
  ('Consultation Injections',                              'reda-benani'),
  ('Consultation Injections',                              'natalia-koltunova'),
  ('Consultation Injections',                              'adnan-plakalo'),

  -- ── Laser et appareils médicaux ───────────────────────────────────
  ('ONDA Coolwaves',                                       'ophelie-perrin'),
  ('ONDA Coolwaves',                                       'claire-balbo'),
  ('ONDA Coolwaves',                                       'juliette-le-mentec'),
  ('ONDA Coolwaves',                                       'gwendoline-boursault'),

  ('Laser Détatouage',                                     'ophelie-perrin'),
  ('Laser Détatouage',                                     'claire-balbo'),
  ('Laser Détatouage',                                     'juliette-le-mentec'),
  ('Laser Détatouage',                                     'gwendoline-boursault'),

  ('Laser Pigmentaire',                                    'ophelie-perrin'),
  ('Laser Pigmentaire',                                    'claire-balbo'),
  ('Laser Pigmentaire',                                    'juliette-le-mentec'),
  ('Laser Pigmentaire',                                    'gwendoline-boursault'),

  ('Laser vasculaire',                                     'ophelie-perrin'),
  ('Laser vasculaire',                                     'claire-balbo'),
  ('Laser vasculaire',                                     'juliette-le-mentec'),
  ('Laser vasculaire',                                     'gwendoline-boursault'),

  -- Hifu (matches "Hifu" standalone treatment only; HIFU Ultraformer covered separately)
  ('Hifu',                                                 'ophelie-perrin'),
  ('Hifu',                                                 'claire-balbo'),
  ('Hifu',                                                 'juliette-le-mentec'),
  ('Hifu',                                                 'gwendoline-boursault'),

  ('Coolsculpting',                                        'ophelie-perrin'),
  ('Coolsculpting',                                        'claire-balbo'),
  ('Coolsculpting',                                        'juliette-le-mentec'),
  ('Coolsculpting',                                        'gwendoline-boursault'),

  ('Laser CO2',                                            'ophelie-perrin'),
  ('Laser CO2',                                            'claire-balbo'),
  ('Laser CO2',                                            'juliette-le-mentec'),
  ('Laser CO2',                                            'gwendoline-boursault'),

  ('Miradry',                                              'ophelie-perrin'),
  ('Miradry',                                              'claire-balbo'),
  ('Miradry',                                              'juliette-le-mentec'),
  ('Miradry',                                              'gwendoline-boursault'),

  ('Laser épilatoire',                                     'ophelie-perrin'),
  ('Laser épilatoire',                                     'claire-balbo'),
  ('Laser épilatoire',                                     'juliette-le-mentec'),
  ('Laser épilatoire',                                     'gwendoline-boursault'),

  -- ── Offres ────────────────────────────────────────────────────────
  -- Offre Edition Limitée - Rituel collagène glow
  ('Rituel collagène glow',                                'sophie-nordback'),
  ('Rituel collagène glow',                                'alexandra-miles'),
  ('Rituel collagène glow',                                'laetitia-guarino'),
  ('Rituel collagène glow',                                'reda-benani'),
  ('Rituel collagène glow',                                'natalia-koltunova'),

  -- Offre Edition Limitée - Silhouette ventre plat et tonique
  ('Silhouette ventre plat',                               'sophie-nordback'),
  ('Silhouette ventre plat',                               'alexandra-miles'),
  ('Silhouette ventre plat',                               'laetitia-guarino'),
  ('Silhouette ventre plat',                               'reda-benani'),
  ('Silhouette ventre plat',                               'natalia-koltunova'),

  -- Offre Edition Limitée - Silhouette galbe fessier
  ('Silhouette galbe fessier',                             'sophie-nordback'),
  ('Silhouette galbe fessier',                             'alexandra-miles'),
  ('Silhouette galbe fessier',                             'laetitia-guarino'),
  ('Silhouette galbe fessier',                             'reda-benani'),
  ('Silhouette galbe fessier',                             'natalia-koltunova'),

  -- Offre Découverte - Protocole 4 perfusions de vitamines
  ('Protocole 4 perfusions',                               'alexandra-miles'),
  ('Protocole 4 perfusions',                               'reda-benani'),

  -- Offre Découverte - Protocole 3 séances - PRP
  ('Protocole 3 séances - PRP',                            'sophie-nordback'),
  ('Protocole 3 séances - PRP',                            'alexandra-miles'),
  ('Protocole 3 séances - PRP',                            'laetitia-guarino'),
  ('Protocole 3 séances - PRP',                            'reda-benani'),
  ('Protocole 3 séances - PRP',                            'natalia-koltunova'),
  ('Protocole 3 séances - PRP',                            'adnan-plakalo'),

  -- Offre Découverte - Protocole 3 séances - Skinbooster
  ('Protocole 3 séances - Skinbooster',                    'sophie-nordback'),
  ('Protocole 3 séances - Skinbooster',                    'alexandra-miles'),
  ('Protocole 3 séances - Skinbooster',                    'laetitia-guarino'),
  ('Protocole 3 séances - Skinbooster',                    'reda-benani'),
  ('Protocole 3 séances - Skinbooster',                    'natalia-koltunova'),
  ('Protocole 3 séances - Skinbooster',                    'adnan-plakalo'),

  -- Offre Découverte - Protocole 1 séance - HIFU Ultraformer MPT
  ('HIFU Ultraformer',                                     'ophelie-perrin'),
  ('HIFU Ultraformer',                                     'claire-balbo'),
  ('HIFU Ultraformer',                                     'juliette-le-mentec'),
  ('HIFU Ultraformer',                                     'gwendoline-boursault'),

  -- Offre Découverte - Protocole 3 séances - Injection de Polynucléotides
  ('Injection de Polynucléotides',                         'sophie-nordback'),
  ('Injection de Polynucléotides',                         'alexandra-miles'),
  ('Injection de Polynucléotides',                         'laetitia-guarino'),
  ('Injection de Polynucléotides',                         'reda-benani'),
  ('Injection de Polynucléotides',                         'natalia-koltunova'),
  ('Injection de Polynucléotides',                         'adnan-plakalo'),

  -- Offre Découverte - Protocole 2 séances - Profhilo
  ('Protocole 2 séances - Profhilo',                       'sophie-nordback'),
  ('Protocole 2 séances - Profhilo',                       'alexandra-miles'),
  ('Protocole 2 séances - Profhilo',                       'laetitia-guarino'),
  ('Protocole 2 séances - Profhilo',                       'reda-benani'),
  ('Protocole 2 séances - Profhilo',                       'natalia-koltunova'),
  ('Protocole 2 séances - Profhilo',                       'adnan-plakalo'),

  -- Offre Découverte - 1 séance de Laser détatouage à 50%
  ('1 séance de Laser',                                    'ophelie-perrin'),
  ('1 séance de Laser',                                    'claire-balbo'),
  ('1 séance de Laser',                                    'juliette-le-mentec'),
  ('1 séance de Laser',                                    'gwendoline-boursault'),

  -- ── Soins ─────────────────────────────────────────────────────────
  ('PRP visage',                                           'ophelie-perrin'),
  ('PRP visage',                                           'claire-balbo'),
  ('PRP visage',                                           'juliette-le-mentec'),
  ('PRP visage',                                           'gwendoline-boursault'),

  ('Microneedling',                                        'ophelie-perrin'),
  ('Microneedling',                                        'claire-balbo'),
  ('Microneedling',                                        'juliette-le-mentec'),
  ('Microneedling',                                        'gwendoline-boursault'),

  ('Peeling médical',                                      'ophelie-perrin'),
  ('Peeling médical',                                      'claire-balbo'),
  ('Peeling médical',                                      'juliette-le-mentec'),
  ('Peeling médical',                                      'gwendoline-boursault'),

  ('Soin signature',                                       'ophelie-perrin'),
  ('Soin signature',                                       'claire-balbo'),
  ('Soin signature',                                       'juliette-le-mentec'),
  ('Soin signature',                                       'gwendoline-boursault')
)
INSERT INTO booking_treatment_doctors (treatment_id, doctor_id, order_index)
SELECT DISTINCT
  bt.id,
  bd.id,
  (ROW_NUMBER() OVER (PARTITION BY bt.id ORDER BY bd.order_index))::int - 1
FROM assignments a
JOIN booking_treatments bt ON bt.name ILIKE '%' || a.treatment_fragment || '%'
JOIN booking_categories  bc ON bc.id = bt.category_id AND bc.patient_type = 'new'
JOIN booking_doctors     bd ON bd.slug = a.doctor_slug
ON CONFLICT (treatment_id, doctor_id) DO NOTHING;
