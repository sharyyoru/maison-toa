BEGIN;

ALTER TABLE appointments
  DROP CONSTRAINT IF EXISTS appointments_linked_parent_appointment_id_fkey;

ALTER TABLE appointments
  ADD CONSTRAINT appointments_linked_parent_appointment_id_fkey
  FOREIGN KEY (linked_parent_appointment_id)
  REFERENCES appointments(id)
  ON DELETE CASCADE;

COMMIT;
