ALTER TABLE scheduled_emails
  DROP CONSTRAINT IF EXISTS scheduled_emails_appointment_id_fkey;

ALTER TABLE scheduled_emails
  ADD CONSTRAINT scheduled_emails_appointment_id_fkey
  FOREIGN KEY (appointment_id)
  REFERENCES appointments(id)
  ON DELETE CASCADE;
