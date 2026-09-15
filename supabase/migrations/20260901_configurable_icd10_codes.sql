CREATE TABLE IF NOT EXISTS icd10_code_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL,
  label text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT icd10_code_options_code_not_blank CHECK (btrim(code) <> ''),
  CONSTRAINT icd10_code_options_label_not_blank CHECK (btrim(label) <> ''),
  CONSTRAINT icd10_code_options_code_unique UNIQUE (code)
);

ALTER TABLE icd10_code_options ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON icd10_code_options TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read ICD-10 codes" ON icd10_code_options;
CREATE POLICY "Authenticated users can read ICD-10 codes"
  ON icd10_code_options FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage ICD-10 codes" ON icd10_code_options;
CREATE POLICY "Authenticated users can manage ICD-10 codes"
  ON icd10_code_options FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO icd10_code_options (code, label, display_order)
SELECT code, label, display_order
FROM (
  VALUES
    ('L68.0', 'Laser hyperpilosité', 0),
    ('F64.0', 'Laser pour patient transgenre', 1),
    ('L72.0', 'Kyste épidermoïde / épilation laser due à un kyste', 2),
    ('B07', 'Verrue', 3),
    ('L71.9', 'Rosacée', 4),
    ('L70.9', 'Acné', 5),
    ('L72.1', 'Kyste pilaire (cuir chevelu)', 6),
    ('D23.9', 'Excision de lésion cutanée bénigne', 7),
    ('D48.5', 'Lésion cutanée d''évolution incertaine', 8),
    ('D22.9', 'Naevus (grain de beauté)', 9),
    ('D18.0', 'Angiome rubis', 10),
    ('I78.1', 'Télangiectasies', 11),
    ('L90.5', 'Cicatrice', 12),
    ('L91.0', 'Cicatrice chéloïdienne', 13),
    ('L81.1', 'Mélasma', 14),
    ('L81.4', 'Lentigos solaires', 15),
    ('L81.9', 'Trouble de la pigmentation', 16),
    ('L20.9', 'Dermatite atopique', 17),
    ('L30.9', 'Dermatite / Eczéma', 18),
    ('L40.9', 'Psoriasis', 19),
    ('L64.9', 'Alopécie androgénétique', 20),
    ('L63.9', 'Pelade (alopécie areata)', 21),
    ('L65.9', 'Chute de cheveux diffuse', 22),
    ('R61.0', 'Hyperhidrose localisée', 23),
    ('B35.1', 'Onychomycose', 24),
    ('B35.4', 'Mycose cutanée', 25),
    ('B08.1', 'Molluscum contagiosum', 26),
    ('B00.1', 'Herpès labial', 27),
    ('B02.9', 'Zona', 28),
    ('L50.9', 'Urticaire', 29),
    ('L29.9', 'Prurit', 30),
    ('Z48.0', 'Contrôle avec ablation des fils', 31),
    ('Z48.8', 'Contrôle postopératoire', 32),
    ('Z09', 'Contrôle après traitement', 33),
    ('Z41.1', 'Consultation / chirurgie à visée esthétique', 34),
    ('L57.0', 'Kératose actinique', 35),
    ('C44.0', 'Carcinome cutané malin de la lèvre', 36),
    ('C44.1', 'Carcinome cutané malin de la paupière', 37),
    ('C44.2', 'Carcinome cutané malin de l''oreille', 38),
    ('C44.3', 'Carcinome cutané malin du visage (nez, joue, front, menton…)', 39),
    ('C44.4', 'Carcinome cutané malin du cuir chevelu et du cou', 40),
    ('C44.5', 'Carcinome cutané malin du tronc', 41),
    ('C44.6', 'Carcinome cutané malin du membre supérieur / épaule', 42),
    ('C44.7', 'Carcinome cutané malin du membre inférieur / hanche', 43),
    ('C44.9', 'Carcinome cutané malin, localisation non précisée', 44),
    ('D04.9', 'Carcinome cutané in situ / maladie de Bowen, localisation non précisée', 45),
    ('C43.9', 'Mélanome malin cutané, localisation non précisée', 46),
    ('D03.9', 'Mélanome in situ, localisation non précisée', 47),
    ('Z71.9', 'Conseil médical, sans précision', 48),
    ('Z76.0', 'Renouvellement d''une prescription', 49)
) AS icd(code, label, display_order)
ON CONFLICT (code) DO NOTHING;
