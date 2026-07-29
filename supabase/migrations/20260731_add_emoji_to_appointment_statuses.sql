ALTER TABLE appointment_status_options
ADD COLUMN IF NOT EXISTS emoji text NOT NULL DEFAULT '';

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
END
WHERE emoji = '';
