-- ============================================================
-- Migration: upsert all canonical treatments for both patient
-- types and reassign doctors per the provided mapping.
--
-- Category UUID reference
--   NEW  Première consultations  82433cac-0cb7-4989-8ae3-4cc2c0eaf6e9
--   NEW  Laser et appareils      13ec6dc4-8abf-4e9c-b1b5-884e70474f56
--   NEW  Offres                  d7ac8c1d-4bc5-4944-8f9a-540fbe5c402f
--   NEW  Soins                   818d5765-95ea-4a55-9f70-169f89e8de58
--   EXI  Consultation            dadd20d3-102a-437c-8460-313557ba6732
--   EXI  Laser et appareils      eaf0192f-5132-4f21-8216-83867adb9c03
--   EXI  Injections              ccfa9100-0998-4429-9168-f6e4f6aee61c
--   EXI  Dermatologie Esthétique 7375e326-86c5-402c-9ea0-f4c9aebe8b52
--   EXI  Perfusions de vitamine  676b4739-5786-4ace-b870-b0ee457230ab
--   EXI  Offres                  db9f9c65-a3e1-414a-8b6b-88cfed39017b
--   EXI  Soins                   961e20ca-f390-48c5-98bb-9e0056da2641
-- ============================================================

-- ── Step 1: Ensure all doctors exist ─────────────────────────────────────────
INSERT INTO booking_doctors (name, specialty, slug, enabled, order_index)
VALUES
  ('Dr. Sophie Nordback',    'Aesthetic Medicine',        'sophie-nordback',      true,  1),
  ('Dr. Alexandra Miles',    'Aesthetic Medicine',        'alexandra-miles',      true,  2),
  ('Dr. Reda Benani',        'Longevity Medicine',        'reda-benani',          true,  3),
  ('Dr. Adnan Plakalo',      'Aesthetic Medicine',        'adnan-plakalo',        true,  4),
  ('Dr. Natalia Koltunova',  'Dermatology & Venereology', 'natalia-koltunova',    true,  5),
  ('Laetitia Guarino',       'Aesthetic Medicine',        'laetitia-guarino',     true,  6),
  ('Ophelie Perrin',         'Laser & Medical Devices',   'ophelie-perrin',       true,  7),
  ('Claire Balbo',           'Laser & Medical Devices',   'claire-balbo',         true,  8),
  ('Juliette Le Mentec',     'Laser & Medical Devices',   'juliette-le-mentec',   true,  9),
  ('Gwendoline Boursault',   'Laser & Medical Devices',   'gwendoline-boursault', true, 10)
ON CONFLICT (slug) DO NOTHING;

-- ── Step 2: Insert missing treatments ────────────────────────────────────────
-- We use a VALUES-based CTE. The category_id column selects the target
-- category UUID; treatments are inserted for BOTH patient types where shown.
-- ON CONFLICT: booking_treatments has no unique key on (category_id, name),
-- so we guard with WHERE NOT EXISTS.

-- 2a. NEW — Première consultations (82433cac)
-- 2b. EXI — Consultation          (dadd20d3)  for most first-consultation items
-- 2c. EXI — Injections            (ccfa9100)  for injection treatments
-- 2d. EXI — Dermatologie Esthétiq (7375e326)  for dermato treatments
-- 2e. EXI — Perfusions de vitamine(676b4739)  for perfusion treatments

DO $$
DECLARE
  cat_new_prem   UUID := '82433cac-0cb7-4989-8ae3-4cc2c0eaf6e9';
  cat_new_laser  UUID := '13ec6dc4-8abf-4e9c-b1b5-884e70474f56';
  cat_new_offres UUID := 'd7ac8c1d-4bc5-4944-8f9a-540fbe5c402f';
  cat_new_soins  UUID := '818d5765-95ea-4a55-9f70-169f89e8de58';
  cat_exi_cons   UUID := 'dadd20d3-102a-437c-8460-313557ba6732';
  cat_exi_laser  UUID := 'eaf0192f-5132-4f21-8216-83867adb9c03';
  cat_exi_inj    UUID := 'ccfa9100-0998-4429-9168-f6e4f6aee61c';
  cat_exi_derm   UUID := '7375e326-86c5-402c-9ea0-f4c9aebe8b52';
  cat_exi_perf   UUID := '676b4739-5786-4ace-b870-b0ee457230ab';
  cat_exi_offres UUID := 'db9f9c65-a3e1-414a-8b6b-88cfed39017b';
  cat_exi_soins  UUID := '961e20ca-f390-48c5-98bb-9e0056da2641';
BEGIN

  -- ── Première consultations / Consultation ──────────────────────────────────
  -- Treatments that appear in "Consultation" for existing patients
  WITH t(nm) AS (VALUES
    ('Consultation laser & appareils médicaux'),
    ('Consultation qualité de peau'),
    ('Chir. - Liposuccion'),
    ('Chir. - Abdomen'),
    ('Chir. - Seins'),
    ('Chir. - Visage'),
    ('Chir. - Autres parties du corps'),
    ('Fils tenseurs'),
    ('Lobes Oreilles'),
    ('Rhinoplastie médicale (acide hyaluronique)'),
    ('PRP cheveux'),
    ('PRP + Exosome')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 100
  FROM t
  CROSS JOIN (VALUES (cat_new_prem),(cat_exi_cons)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

  -- ── Dermatologie (new: Première consultations, exi: Dermatologie Esthétique)
  WITH t(nm) AS (VALUES
    ('Dermato. - Grain de beauté'),
    ('Dermato. - Verrue')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 200
  FROM t
  CROSS JOIN (VALUES (cat_new_prem),(cat_exi_derm)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

  -- ── Perfusions (new: Première consultations, exi: Perfusions de vitamine) ──
  WITH t(nm) AS (VALUES
    ('Perfusion - Hydratation'),
    ('Perfusion - Hangover'),
    ('Perfusion - Myers Cocktail'),
    ('Perfusion - Iron'),
    ('Perfusion - Super Immunity'),
    ('Perfusion - Energy'),
    ('Perfusion - Strong Hair'),
    ('Perfusion - Post Workout'),
    ('Perfusion - Skin Glow'),
    ('Perfusion - High Dose Vitamin C'),
    ('Perfusion - All Inclusive'),
    ('Perfusion - Detox')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 300
  FROM t
  CROSS JOIN (VALUES (cat_new_prem),(cat_exi_perf)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

  -- ── Injections (new: Première consultations, exi: Injections) ─────────────
  WITH t(nm) AS (VALUES
    ('Acide Hyaluronique'),
    ('Toxine Botulique'),
    ('Radiesse'),
    ('Hyaluronidase'),
    ('Sculptra'),
    ('Profhilo Visage'),
    ('Profhilo Corps'),
    ('Polynucléotides'),
    ('Skinbooster')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 400
  FROM t
  CROSS JOIN (VALUES (cat_new_prem),(cat_exi_inj)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

  -- ── Laser et appareils médicaux (both patient types) ──────────────────────
  WITH t(nm) AS (VALUES
    ('ONDA (Traitement cellulite)'),
    ('Laser détatouage - Mini'),
    ('Laser détatouage - Petit'),
    ('Laser détatouage - Moyen'),
    ('Laser détatouage - Grand'),
    ('Laser détatouage - Eye Liner'),
    ('Laser Pico Mélasma'),
    ('Laser pigmentaire'),
    ('Laser vasculaire'),
    ('HIFU - 100 lignes'),
    ('HIFU - 200 lignes'),
    ('HIFU - 400 lignes'),
    ('HIFU - 800 lignes'),
    ('HIFU - 1300 lignes'),
    ('Coolsculpting'),
    ('Coolsculpting Double Menton'),
    ('Coolsculpting  Culotte de cheval'),
    ('Laser CO2'),
    ('Miradry'),
    ('Laser épil. - Aisselles'),
    ('Laser épil. - Lèvre sup OU menton'),
    ('Laser épil. - Lèvre sup ET menton'),
    ('Laser épil. - Définition de la barbe OU visage'),
    ('Laser épil. - Avant-bras'),
    ('Laser épil. - Fesses'),
    ('Laser épil. - Pieds'),
    ('Laser épil. - Doigts de pieds OU mains'),
    ('Laser épil. - Epaules'),
    ('Laser épil. - Haut ou bas du dos'),
    ('Laser épil. - Nuque'),
    ('Laser épil. - Inter-fessière'),
    ('Laser épil. - Ligne centrale du ventre'),
    ('Laser épil. - Sillon inter-fessier'),
    ('Laser épil. - Poitrine / Thorax'),
    ('Laser épil. - Bikini (partiel)'),
    ('Laser épil. - Bikini total'),
    ('Laser épil. - Bras complets'),
    ('Laser épil. - Cuisses'),
    ('Laser épil. - Demi-jambes (mollet)'),
    ('Laser épil. - Dos complet')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 500
  FROM t
  CROSS JOIN (VALUES (cat_new_laser),(cat_exi_laser)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

  -- ── Offres (both patient types) ───────────────────────────────────────────
  WITH t(nm) AS (VALUES
    ('Offre Saisonnale - Rituel collagène glow'),
    ('Offre Saisonnale - Silhouette ventre plat et tonique'),
    ('Offre Saisonnale - Silhouette galbe fessier'),
    ('Protocole 4 perfusions de vitamines'),
    ('Protocole 3 séances - PRP'),
    ('Protocole 3 séances - Skinbooster'),
    ('Protocole 1 séance - HIFU Ultraformer MPT'),
    ('Protocole 3 séances - Injection de Polynucléotides'),
    ('Protocole 2 séances - Profhilo'),
    ('1 séance de Laser détatouage à 50%')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 600
  FROM t
  CROSS JOIN (VALUES (cat_new_offres),(cat_exi_offres)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

  -- ── Soins (both patient types) ────────────────────────────────────────────
  WITH t(nm) AS (VALUES
    ('PRP visage'),
    ('Microneedling médicale Dermapen'),
    ('Peeling médical - Peeling TCA 15%'),
    ('Peeling médical - Peeling TCA 20% + 10% Phénol'),
    ('Soin signature - Glass Skin'),
    ('Soin signature - Skin Revival'),
    ('Soin signature - Vampirelift'),
    ('Soin signature - Collagen Reset')
  )
  INSERT INTO booking_treatments (category_id, name, enabled, order_index)
  SELECT cat, nm, true, row_number() OVER () + 700
  FROM t
  CROSS JOIN (VALUES (cat_new_soins),(cat_exi_soins)) AS c(cat)
  WHERE NOT EXISTS (
    SELECT 1 FROM booking_treatments bt
    WHERE bt.category_id = c.cat AND bt.name = t.nm
  );

END $$;

-- ── Step 3: Clear existing assignments for all affected treatments ────────────
DELETE FROM booking_treatment_doctors
WHERE treatment_id IN (
  SELECT id FROM booking_treatments
  WHERE name ILIKE ANY (ARRAY[
    -- Consultations
    '%Consultation laser%', '%Consultation qualité%',
    '%Chir. -%', '%Fils tenseurs%', '%Lobes Oreilles%',
    '%Rhinoplastie médicale%', '%PRP cheveux%', '%PRP + Exosome%',
    -- Dermato
    '%Dermato. -%',
    -- Perfusions
    '%Perfusion -%',
    -- Injections
    '%Acide Hyaluronique%', '%Toxine Botulique%', '%Radiesse%',
    '%Hyaluronidase%', '%Sculptra%',
    '%Profhilo Visage%', '%Profhilo Corps%', '%Polynucléotides%', '%Skinbooster%',
    -- Laser & devices
    '%ONDA%', '%Laser détatouage%', '%Laser Pico%', '%Laser pigmentaire%',
    '%Laser vasculaire%', '%HIFU%', '%Coolsculpting%', '%Laser CO2%', '%Miradry%',
    '%Laser épil.%',
    -- Offres
    '%Offre Saisonnale%', '%Protocole 4 perfusions%', '%Protocole 3 séances%',
    '%Protocole 2 séances%', '%Protocole 1 séance%',
    '%1 séance de Laser%',
    -- Soins
    '%PRP visage%', '%Microneedling%', '%Peeling médical%', '%Soin signature%'
  ])
);

-- ── Step 4: Re-assign doctors (fragment-based, both patient types) ────────────
WITH assignments (treatment_fragment, doctor_fragment) AS (VALUES

  -- ── Première consultations – consultations ────────────────────────────────
  ('Consultation laser',                              'Sophie Nordback'),
  ('Consultation laser',                              'Alexandra Miles'),
  ('Consultation laser',                              'Laetitia Guarino'),
  ('Consultation laser',                              'Reda Benani'),

  ('Consultation qualité de peau',                    'Sophie Nordback'),
  ('Consultation qualité de peau',                    'Alexandra Miles'),
  ('Consultation qualité de peau',                    'Laetitia Guarino'),
  ('Consultation qualité de peau',                    'Reda Benani'),

  -- ── Chirurgie ─────────────────────────────────────────────────────────────
  ('Chir. -',                                         'Sophie Nordback'),
  ('Chir. -',                                         'Laetitia Guarino'),

  -- ── Fils tenseurs ─────────────────────────────────────────────────────────
  ('Fils tenseurs',                                   'Sophie Nordback'),
  ('Fils tenseurs',                                   'Alexandra Miles'),

  -- ── Lobes Oreilles ───────────────────────────────────────────────────────
  ('Lobes Oreilles',                                  'Sophie Nordback'),
  ('Lobes Oreilles',                                  'Laetitia Guarino'),

  -- ── Rhinoplastie médicale ─────────────────────────────────────────────────
  ('Rhinoplastie médicale',                           'Sophie Nordback'),
  ('Rhinoplastie médicale',                           'Alexandra Miles'),
  ('Rhinoplastie médicale',                           'Natalia Koltunova'),
  ('Rhinoplastie médicale',                           'Adnan Plakalo'),

  -- ── PRP cheveux / PRP + Exosome ───────────────────────────────────────────
  ('PRP cheveux',                                     'Sophie Nordback'),
  ('PRP cheveux',                                     'Alexandra Miles'),
  ('PRP cheveux',                                     'Laetitia Guarino'),
  ('PRP cheveux',                                     'Reda Benani'),

  ('PRP + Exosome',                                   'Sophie Nordback'),
  ('PRP + Exosome',                                   'Alexandra Miles'),
  ('PRP + Exosome',                                   'Laetitia Guarino'),
  ('PRP + Exosome',                                   'Reda Benani'),

  -- ── Dermato ───────────────────────────────────────────────────────────────
  ('Dermato. -',                                      'Alexandra Miles'),
  ('Dermato. -',                                      'Natalia Koltunova'),

  -- ── Perfusions ────────────────────────────────────────────────────────────
  ('Perfusion -',                                     'Alexandra Miles'),
  ('Perfusion -',                                     'Reda Benani'),

  -- ── Injections ────────────────────────────────────────────────────────────
  ('Acide Hyaluronique',                              'Sophie Nordback'),
  ('Acide Hyaluronique',                              'Alexandra Miles'),
  ('Acide Hyaluronique',                              'Laetitia Guarino'),
  ('Acide Hyaluronique',                              'Reda Benani'),
  ('Acide Hyaluronique',                              'Natalia Koltunova'),
  ('Acide Hyaluronique',                              'Adnan Plakalo'),

  ('Toxine Botulique',                                'Sophie Nordback'),
  ('Toxine Botulique',                                'Alexandra Miles'),
  ('Toxine Botulique',                                'Laetitia Guarino'),
  ('Toxine Botulique',                                'Reda Benani'),
  ('Toxine Botulique',                                'Natalia Koltunova'),
  ('Toxine Botulique',                                'Adnan Plakalo'),

  ('Radiesse',                                        'Sophie Nordback'),
  ('Radiesse',                                        'Alexandra Miles'),
  ('Radiesse',                                        'Laetitia Guarino'),
  ('Radiesse',                                        'Reda Benani'),
  ('Radiesse',                                        'Natalia Koltunova'),
  ('Radiesse',                                        'Adnan Plakalo'),

  ('Hyaluronidase',                                   'Sophie Nordback'),
  ('Hyaluronidase',                                   'Alexandra Miles'),

  ('Sculptra',                                        'Sophie Nordback'),
  ('Sculptra',                                        'Alexandra Miles'),
  ('Sculptra',                                        'Laetitia Guarino'),
  ('Sculptra',                                        'Reda Benani'),
  ('Sculptra',                                        'Natalia Koltunova'),
  ('Sculptra',                                        'Adnan Plakalo'),

  ('Profhilo Visage',                                 'Sophie Nordback'),
  ('Profhilo Visage',                                 'Alexandra Miles'),
  ('Profhilo Visage',                                 'Natalia Koltunova'),
  ('Profhilo Visage',                                 'Adnan Plakalo'),

  ('Profhilo Corps',                                  'Sophie Nordback'),
  ('Profhilo Corps',                                  'Alexandra Miles'),
  ('Profhilo Corps',                                  'Natalia Koltunova'),
  ('Profhilo Corps',                                  'Adnan Plakalo'),

  ('Polynucléotides',                                 'Sophie Nordback'),
  ('Polynucléotides',                                 'Alexandra Miles'),
  ('Polynucléotides',                                 'Natalia Koltunova'),
  ('Polynucléotides',                                 'Adnan Plakalo'),

  ('Skinbooster',                                     'Sophie Nordback'),
  ('Skinbooster',                                     'Alexandra Miles'),
  ('Skinbooster',                                     'Natalia Koltunova'),
  ('Skinbooster',                                     'Adnan Plakalo'),

  -- ── ONDA ─────────────────────────────────────────────────────────────────
  ('ONDA',                                            'Ophelie Perrin'),
  ('ONDA',                                            'Claire Balbo'),
  ('ONDA',                                            'Juliette Le Mentec'),
  ('ONDA',                                            'Gwendoline Boursault'),

  -- ── Laser détatouage (all size variants) ─────────────────────────────────
  ('Laser détatouage',                                'Ophelie Perrin'),
  ('Laser détatouage',                                'Claire Balbo'),
  ('Laser détatouage',                                'Juliette Le Mentec'),
  ('Laser détatouage',                                'Gwendoline Boursault'),

  -- ── Laser Pico Mélasma ────────────────────────────────────────────────────
  ('Laser Pico',                                      'Ophelie Perrin'),
  ('Laser Pico',                                      'Claire Balbo'),
  ('Laser Pico',                                      'Juliette Le Mentec'),
  ('Laser Pico',                                      'Gwendoline Boursault'),

  -- ── Laser pigmentaire ─────────────────────────────────────────────────────
  ('Laser pigmentaire',                               'Ophelie Perrin'),
  ('Laser pigmentaire',                               'Claire Balbo'),
  ('Laser pigmentaire',                               'Juliette Le Mentec'),
  ('Laser pigmentaire',                               'Gwendoline Boursault'),

  -- ── Laser vasculaire ──────────────────────────────────────────────────────
  ('Laser vasculaire',                                'Ophelie Perrin'),
  ('Laser vasculaire',                                'Claire Balbo'),
  ('Laser vasculaire',                                'Juliette Le Mentec'),
  ('Laser vasculaire',                                'Gwendoline Boursault'),

  -- ── HIFU (all ligne variants) ─────────────────────────────────────────────
  ('HIFU',                                            'Ophelie Perrin'),
  ('HIFU',                                            'Claire Balbo'),
  ('HIFU',                                            'Juliette Le Mentec'),
  ('HIFU',                                            'Gwendoline Boursault'),

  -- ── Coolsculpting (all variants) ──────────────────────────────────────────
  ('Coolsculpting',                                   'Ophelie Perrin'),
  ('Coolsculpting',                                   'Claire Balbo'),
  ('Coolsculpting',                                   'Juliette Le Mentec'),
  ('Coolsculpting',                                   'Gwendoline Boursault'),

  -- ── Laser CO2 ─────────────────────────────────────────────────────────────
  ('Laser CO2',                                       'Ophelie Perrin'),
  ('Laser CO2',                                       'Claire Balbo'),
  ('Laser CO2',                                       'Juliette Le Mentec'),
  ('Laser CO2',                                       'Gwendoline Boursault'),

  -- ── Miradry ───────────────────────────────────────────────────────────────
  ('Miradry',                                         'Ophelie Perrin'),
  ('Miradry',                                         'Claire Balbo'),
  ('Miradry',                                         'Juliette Le Mentec'),
  ('Miradry',                                         'Gwendoline Boursault'),

  -- ── Laser épil. (all body-part variants) ──────────────────────────────────
  ('Laser épil.',                                     'Ophelie Perrin'),
  ('Laser épil.',                                     'Claire Balbo'),
  ('Laser épil.',                                     'Juliette Le Mentec'),
  ('Laser épil.',                                     'Gwendoline Boursault'),

  -- ── Offres saisonnales ────────────────────────────────────────────────────
  ('Offre Saisonnale - Rituel',                       'Sophie Nordback'),
  ('Offre Saisonnale - Rituel',                       'Alexandra Miles'),
  ('Offre Saisonnale - Rituel',                       'Laetitia Guarino'),
  ('Offre Saisonnale - Rituel',                       'Reda Benani'),
  ('Offre Saisonnale - Rituel',                       'Natalia Koltunova'),

  ('Offre Saisonnale - Silhouette ventre',            'Sophie Nordback'),
  ('Offre Saisonnale - Silhouette ventre',            'Alexandra Miles'),
  ('Offre Saisonnale - Silhouette ventre',            'Laetitia Guarino'),
  ('Offre Saisonnale - Silhouette ventre',            'Reda Benani'),
  ('Offre Saisonnale - Silhouette ventre',            'Natalia Koltunova'),

  ('Offre Saisonnale - Silhouette galbe',             'Sophie Nordback'),
  ('Offre Saisonnale - Silhouette galbe',             'Alexandra Miles'),
  ('Offre Saisonnale - Silhouette galbe',             'Laetitia Guarino'),
  ('Offre Saisonnale - Silhouette galbe',             'Reda Benani'),
  ('Offre Saisonnale - Silhouette galbe',             'Natalia Koltunova'),

  -- ── Protocole 4 perfusions ────────────────────────────────────────────────
  ('Protocole 4 perfusions',                          'Alexandra Miles'),
  ('Protocole 4 perfusions',                          'Reda Benani'),

  -- ── Protocole 3 séances PRP ───────────────────────────────────────────────
  ('Protocole 3 séances - PRP',                       'Sophie Nordback'),
  ('Protocole 3 séances - PRP',                       'Alexandra Miles'),
  ('Protocole 3 séances - PRP',                       'Laetitia Guarino'),
  ('Protocole 3 séances - PRP',                       'Reda Benani'),
  ('Protocole 3 séances - PRP',                       'Natalia Koltunova'),
  ('Protocole 3 séances - PRP',                       'Adnan Plakalo'),

  -- ── Protocole 3 séances Skinbooster ──────────────────────────────────────
  ('Protocole 3 séances - Skinbooster',               'Sophie Nordback'),
  ('Protocole 3 séances - Skinbooster',               'Alexandra Miles'),
  ('Protocole 3 séances - Skinbooster',               'Laetitia Guarino'),
  ('Protocole 3 séances - Skinbooster',               'Reda Benani'),
  ('Protocole 3 séances - Skinbooster',               'Natalia Koltunova'),
  ('Protocole 3 séances - Skinbooster',               'Adnan Plakalo'),

  -- ── Protocole 1 séance HIFU ───────────────────────────────────────────────
  ('Protocole 1 séance - HIFU',                       'Ophelie Perrin'),
  ('Protocole 1 séance - HIFU',                       'Claire Balbo'),
  ('Protocole 1 séance - HIFU',                       'Juliette Le Mentec'),
  ('Protocole 1 séance - HIFU',                       'Gwendoline Boursault'),

  -- ── Protocole 3 séances Polynucléotides ──────────────────────────────────
  ('Protocole 3 séances - Injection de Polynucléotides', 'Sophie Nordback'),
  ('Protocole 3 séances - Injection de Polynucléotides', 'Alexandra Miles'),
  ('Protocole 3 séances - Injection de Polynucléotides', 'Laetitia Guarino'),
  ('Protocole 3 séances - Injection de Polynucléotides', 'Reda Benani'),
  ('Protocole 3 séances - Injection de Polynucléotides', 'Natalia Koltunova'),
  ('Protocole 3 séances - Injection de Polynucléotides', 'Adnan Plakalo'),

  -- ── Protocole 2 séances Profhilo ──────────────────────────────────────────
  ('Protocole 2 séances - Profhilo',                  'Sophie Nordback'),
  ('Protocole 2 séances - Profhilo',                  'Alexandra Miles'),
  ('Protocole 2 séances - Profhilo',                  'Laetitia Guarino'),
  ('Protocole 2 séances - Profhilo',                  'Reda Benani'),
  ('Protocole 2 séances - Profhilo',                  'Natalia Koltunova'),
  ('Protocole 2 séances - Profhilo',                  'Adnan Plakalo'),

  -- ── 1 séance Laser détatouage 50% ─────────────────────────────────────────
  ('1 séance de Laser',                               'Ophelie Perrin'),
  ('1 séance de Laser',                               'Claire Balbo'),
  ('1 séance de Laser',                               'Juliette Le Mentec'),
  ('1 séance de Laser',                               'Gwendoline Boursault'),

  -- ── Soins ─────────────────────────────────────────────────────────────────
  ('PRP visage',                                      'Ophelie Perrin'),
  ('PRP visage',                                      'Claire Balbo'),
  ('PRP visage',                                      'Juliette Le Mentec'),
  ('PRP visage',                                      'Gwendoline Boursault'),

  ('Microneedling',                                   'Ophelie Perrin'),
  ('Microneedling',                                   'Claire Balbo'),
  ('Microneedling',                                   'Juliette Le Mentec'),
  ('Microneedling',                                   'Gwendoline Boursault'),

  ('Peeling médical',                                 'Ophelie Perrin'),
  ('Peeling médical',                                 'Claire Balbo'),
  ('Peeling médical',                                 'Juliette Le Mentec'),
  ('Peeling médical',                                 'Gwendoline Boursault'),

  ('Soin signature',                                  'Ophelie Perrin'),
  ('Soin signature',                                  'Claire Balbo'),
  ('Soin signature',                                  'Juliette Le Mentec'),
  ('Soin signature',                                  'Gwendoline Boursault')
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
