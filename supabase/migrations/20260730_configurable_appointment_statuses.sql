CREATE TABLE IF NOT EXISTS appointment_status_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  emoji text NOT NULL DEFAULT '',
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT appointment_status_options_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT appointment_status_options_name_unique UNIQUE (name)
);

ALTER TABLE appointment_status_options ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON appointment_status_options TO authenticated;

DROP POLICY IF EXISTS "Authenticated users can read appointment statuses" ON appointment_status_options;
CREATE POLICY "Authenticated users can read appointment statuses"
  ON appointment_status_options FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated users can manage appointment statuses" ON appointment_status_options;
CREATE POLICY "Authenticated users can manage appointment statuses"
  ON appointment_status_options FOR ALL TO authenticated
  USING (true) WITH CHECK (true);

INSERT INTO appointment_status_options (name, display_order)
SELECT status.name, status.display_order
FROM (
  VALUES
    ('Aucune sélection', 0),
    ('Vidéo conférence / appel', 1),
    ('Bon/Solde/Voucher', 2),
    ('CONTROLE INFOS PATIENT', 3),
    ('PAIEMENT PARTIEL', 4),
    ('FACTURATION TARMED', 5),
    ('PAYE', 6),
    ('FACTURE ENVOYEE', 7),
    ('CB', 8),
    ('Salle d''attente', 9),
    ('Chez le médecin/dans la salle de consult.', 10),
    ('Patient parti, hors du cabinet', 11),
    ('à faire', 12),
    ('fait', 13),
    ('Attention', 14),
    ('Annulé', 15),
    ('Téléphone', 16),
    ('N''est pas venu', 17),
    ('en retard', 18),
    ('à payer', 19),
    ('Urgent', 20),
    ('Déplacé', 21),
    ('MANQUE', 22),
    ('NUIT', 23),
    ('ESPECES', 24)
) AS status(name, display_order)
ON CONFLICT (name) DO NOTHING;

UPDATE appointment_status_options
SET emoji = CASE name
  WHEN 'Salle d''attente' THEN '🕐'
  WHEN 'Chez le médecin/dans la salle de consult.' THEN '👤'
  WHEN 'fait' THEN '☑'
  WHEN 'Attention' THEN '⚠️'
  WHEN 'Annulé' THEN '☒'
  WHEN 'N''est pas venu' THEN '🚫'
  WHEN 'en retard' THEN '📞'
  WHEN 'Urgent' THEN '🆘'
  WHEN 'Déplacé' THEN '📝'
  ELSE emoji
END;
