-- ============================================================
-- Step 1: Insert new doctors not yet in booking_doctors
-- ============================================================
INSERT INTO booking_doctors (name, specialty, slug, enabled, order_index)
VALUES
  ('Laetitia Guarino',     'Aesthetic Medicine',       'laetitia-guarino',      true, 5),
  ('Ophélie Perrin',       'Laser & Medical Devices',  'ophelie-perrin',        true, 6),
  ('Claire Balbo',         'Laser & Medical Devices',  'claire-balbo',          true, 7),
  ('Juliette Le Mentec',   'Laser & Medical Devices',  'juliette-le-mentec',    true, 8),
  ('Gwendoline Boursault', 'Laser & Medical Devices',  'gwendoline-boursault',  true, 9)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================
-- Step 2: Clear all existing treatment-doctor assignments
-- ============================================================
DELETE FROM booking_treatment_doctors;

-- ============================================================
-- Step 3: Seed assignments
--
-- treatment_fragment is matched with ILIKE '%fragment%' against
-- booking_treatments.name so it works for both new-patient and
-- existing-patient copies of the same treatment, and handles
-- names that contain newlines / extra spaces in the source data.
-- ============================================================
WITH assignments (treatment_fragment, doctor_fragment) AS (
  VALUES

    -- ── Consultation Chirurgie Corps ──────────────────────────
    ('Consultation Chirurgie Corps',          'Sophie Nordback'),
    ('Consultation Chirurgie Corps',          'Laetitia Guarino'),

    -- ── Consultation Chirurgie Visage ─────────────────────────
    ('Consultation Chirurgie Visage',         'Sophie Nordback'),
    ('Consultation Chirurgie Visage',         'Alexandra Miles'),

    -- ── Consultation Chute de cheveux ─────────────────────────
    ('Consultation Chute de cheveux',         'Sophie Nordback'),
    ('Consultation Chute de cheveux',         'Alexandra Miles'),
    ('Consultation Chute de cheveux',         'Laetitia Guarino'),
    ('Consultation Chute de cheveux',         'Reda Benani'),

    -- ── Consultation Dermatologique ───────────────────────────
    ('Consultation Dermatologique',           'Alexandra Miles'),
    ('Consultation Dermatologique',           'Natalia Koltunova'),

    -- ── Consultation Médecine Longevité ───────────────────────
    ('Consultation Médecine Longevité',       'Alexandra Miles'),
    ('Consultation Médecine Longevité',       'Reda Benani'),

    -- ── Consultation laser & appareils médicaux ───────────────
    ('Consultation laser & appareils',        'Sophie Nordback'),
    ('Consultation laser & appareils',        'Alexandra Miles'),
    ('Consultation laser & appareils',        'Laetitia Guarino'),
    ('Consultation laser & appareils',        'Reda Benani'),

    -- ── Consultation Injections – Acide Hyaluronique etc. ─────
    -- Fragment matches both "Consultation Injections - Acide…"
    -- and the standalone "Acide Hyaluronique, Toxine…" treatment
    ('Acide Hyaluronique, Toxine',            'Sophie Nordback'),
    ('Acide Hyaluronique, Toxine',            'Alexandra Miles'),
    ('Acide Hyaluronique, Toxine',            'Laetitia Guarino'),
    ('Acide Hyaluronique, Toxine',            'Reda Benani'),
    ('Acide Hyaluronique, Toxine',            'Natalia Koltunova'),
    ('Acide Hyaluronique, Toxine',            'Adnan Plakalo'),

    -- ── Consultation Injections – Profhilo etc. ───────────────
    -- Fragment matches both "Consultation Injections - Profhilo…"
    -- and the standalone "Profhilo, Polynucléotides, Skinbooster"
    ('Profhilo, Polynucléotides',             'Sophie Nordback'),
    ('Profhilo, Polynucléotides',             'Alexandra Miles'),
    ('Profhilo, Polynucléotides',             'Natalia Koltunova'),
    ('Profhilo, Polynucléotides',             'Adnan Plakalo'),

    -- ── Consultation Injections – Augmentation des fesses ─────
    ('Augmentation des fesses',               'Sophie Nordback'),
    ('Augmentation des fesses',               'Alexandra Miles'),
    ('Augmentation des fesses',               'Natalia Koltunova'),

    -- ── Consultation Injections – Traitement transpiration ────
    ('Traitement de la transpiration',        'Sophie Nordback'),
    ('Traitement de la transpiration',        'Alexandra Miles'),

    -- ── Injections PRP Cheveux ────────────────────────────────
    ('Injections PRP Cheveux',                'Sophie Nordback'),
    ('Injections PRP Cheveux',                'Alexandra Miles'),
    ('Injections PRP Cheveux',                'Laetitia Guarino'),
    ('Injections PRP Cheveux',                'Reda Benani'),

    -- ── Excision des grains de beauté ────────────────────────
    ('Excision des grains de beauté',         'Alexandra Miles'),
    ('Excision des grains de beauté',         'Natalia Koltunova'),

    -- ── ONDA Coolwaves ────────────────────────────────────────
    ('ONDA Coolwaves',                        'Ophélie Perrin'),
    ('ONDA Coolwaves',                        'Claire Balbo'),
    ('ONDA Coolwaves',                        'Juliette Le Mentec'),
    ('ONDA Coolwaves',                        'Gwendoline Boursault'),

    -- ── Laser Détatouage (all variants) ──────────────────────
    -- Matches "Laser Détatouage" and "Offre Découverte - 1 séance de Laser détatouage"
    ('étatouage',                             'Ophélie Perrin'),
    ('étatouage',                             'Claire Balbo'),
    ('étatouage',                             'Juliette Le Mentec'),
    ('étatouage',                             'Gwendoline Boursault'),

    -- ── Laser Pigmentaire ─────────────────────────────────────
    ('Laser Pigmentaire',                     'Ophélie Perrin'),
    ('Laser Pigmentaire',                     'Claire Balbo'),
    ('Laser Pigmentaire',                     'Juliette Le Mentec'),
    ('Laser Pigmentaire',                     'Gwendoline Boursault'),

    -- ── Laser vasculaire ──────────────────────────────────────
    ('Laser vasculaire',                      'Ophélie Perrin'),
    ('Laser vasculaire',                      'Claire Balbo'),
    ('Laser vasculaire',                      'Juliette Le Mentec'),
    ('Laser vasculaire',                      'Gwendoline Boursault'),

    -- ── Laser CO2 ─────────────────────────────────────────────
    ('Laser CO2',                             'Ophélie Perrin'),
    ('Laser CO2',                             'Claire Balbo'),
    ('Laser CO2',                             'Juliette Le Mentec'),
    ('Laser CO2',                             'Gwendoline Boursault'),

    -- ── Laser épilation / Epilation (handles accent variants) ─
    -- Matches "Laser épilatoire", "Laser Epilation", "Laser épil."
    ('pilation',                              'Ophélie Perrin'),
    ('pilation',                              'Claire Balbo'),
    ('pilation',                              'Juliette Le Mentec'),
    ('pilation',                              'Gwendoline Boursault'),

    -- ── Hifu / HIFU (all variants) ───────────────────────────
    -- Matches "Hifu", "HIFU - 100 lignes", "HIFU Ultraformer MPT"
    ('ifu',                                   'Ophélie Perrin'),
    ('ifu',                                   'Claire Balbo'),
    ('ifu',                                   'Juliette Le Mentec'),
    ('ifu',                                   'Gwendoline Boursault'),

    -- ── Coolsculpting ─────────────────────────────────────────
    ('Coolsculpting',                         'Ophélie Perrin'),
    ('Coolsculpting',                         'Claire Balbo'),
    ('Coolsculpting',                         'Juliette Le Mentec'),
    ('Coolsculpting',                         'Gwendoline Boursault'),

    -- ── Miradry ───────────────────────────────────────────────
    ('Miradry',                               'Ophélie Perrin'),
    ('Miradry',                               'Claire Balbo'),
    ('Miradry',                               'Juliette Le Mentec'),
    ('Miradry',                               'Gwendoline Boursault'),

    -- ── PRP visage ────────────────────────────────────────────
    ('PRP visage',                            'Ophélie Perrin'),
    ('PRP visage',                            'Claire Balbo'),
    ('PRP visage',                            'Juliette Le Mentec'),
    ('PRP visage',                            'Gwendoline Boursault'),

    -- ── Microneedling médicale Dermapen ──────────────────────
    ('Microneedling',                         'Ophélie Perrin'),
    ('Microneedling',                         'Claire Balbo'),
    ('Microneedling',                         'Juliette Le Mentec'),
    ('Microneedling',                         'Gwendoline Boursault'),

    -- ── Peeling médical ───────────────────────────────────────
    ('Peeling médical',                       'Ophélie Perrin'),
    ('Peeling médical',                       'Claire Balbo'),
    ('Peeling médical',                       'Juliette Le Mentec'),
    ('Peeling médical',                       'Gwendoline Boursault'),

    -- ── Soin signature ────────────────────────────────────────
    ('Soin signature',                        'Ophélie Perrin'),
    ('Soin signature',                        'Claire Balbo'),
    ('Soin signature',                        'Juliette Le Mentec'),
    ('Soin signature',                        'Gwendoline Boursault'),

    -- ── Offre Edition Limitée (all 3 variants) ───────────────
    ('Rituel collagène glow',                 'Sophie Nordback'),
    ('Rituel collagène glow',                 'Alexandra Miles'),
    ('Rituel collagène glow',                 'Laetitia Guarino'),
    ('Rituel collagène glow',                 'Reda Benani'),
    ('Rituel collagène glow',                 'Natalia Koltunova'),

    ('Silhouette ventre plat',                'Sophie Nordback'),
    ('Silhouette ventre plat',                'Alexandra Miles'),
    ('Silhouette ventre plat',                'Laetitia Guarino'),
    ('Silhouette ventre plat',                'Reda Benani'),
    ('Silhouette ventre plat',                'Natalia Koltunova'),

    ('Silhouette galbe fessier',              'Sophie Nordback'),
    ('Silhouette galbe fessier',              'Alexandra Miles'),
    ('Silhouette galbe fessier',              'Laetitia Guarino'),
    ('Silhouette galbe fessier',              'Reda Benani'),
    ('Silhouette galbe fessier',              'Natalia Koltunova'),

    -- ── Offre Découverte – Protocole 4 perfusions ────────────
    ('Protocole 4 perfusions',                'Alexandra Miles'),
    ('Protocole 4 perfusions',                'Reda Benani'),

    -- ── Offre Découverte – Protocole 3 séances PRP ───────────
    ('Protocole 3 séances - PRP',             'Sophie Nordback'),
    ('Protocole 3 séances - PRP',             'Alexandra Miles'),
    ('Protocole 3 séances - PRP',             'Laetitia Guarino'),
    ('Protocole 3 séances - PRP',             'Reda Benani'),
    ('Protocole 3 séances - PRP',             'Natalia Koltunova'),
    ('Protocole 3 séances - PRP',             'Adnan Plakalo'),

    -- ── Offre Découverte – Protocole 3 séances Skinbooster ───
    ('Protocole 3 séances - Skinbooster',     'Sophie Nordback'),
    ('Protocole 3 séances - Skinbooster',     'Alexandra Miles'),
    ('Protocole 3 séances - Skinbooster',     'Laetitia Guarino'),
    ('Protocole 3 séances - Skinbooster',     'Reda Benani'),
    ('Protocole 3 séances - Skinbooster',     'Natalia Koltunova'),
    ('Protocole 3 séances - Skinbooster',     'Adnan Plakalo'),

    -- ── Offre Découverte – Protocole 1 séance HIFU ───────────
    -- matched above via 'ifu' fragment

    -- ── Offre Découverte – Protocole 3 séances Polynucléotides
    ('Protocole 3 séances - Injection de Polynucléotides', 'Sophie Nordback'),
    ('Protocole 3 séances - Injection de Polynucléotides', 'Alexandra Miles'),
    ('Protocole 3 séances - Injection de Polynucléotides', 'Laetitia Guarino'),
    ('Protocole 3 séances - Injection de Polynucléotides', 'Reda Benani'),
    ('Protocole 3 séances - Injection de Polynucléotides', 'Natalia Koltunova'),
    ('Protocole 3 séances - Injection de Polynucléotides', 'Adnan Plakalo'),

    -- ── Offre Découverte – Protocole 2 séances Profhilo ──────
    ('Protocole 2 séances - Profhilo',        'Sophie Nordback'),
    ('Protocole 2 séances - Profhilo',        'Alexandra Miles'),
    ('Protocole 2 séances - Profhilo',        'Laetitia Guarino'),
    ('Protocole 2 séances - Profhilo',        'Reda Benani'),
    ('Protocole 2 séances - Profhilo',        'Natalia Koltunova'),
    ('Protocole 2 séances - Profhilo',        'Adnan Plakalo')
    -- Note: "Offre Découverte - 1 séance de Laser détatouage" is
    -- already covered by the 'étatouage' fragment above.
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
