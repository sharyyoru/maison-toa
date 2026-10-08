-- CAL-018: optional manual link between two appointments (kept in sync on reschedule)
alter table appointments
  add column if not exists manual_linked_appointment_id uuid references appointments(id) on delete set null;

create index if not exists appointments_manual_link_idx
  on appointments(manual_linked_appointment_id)
  where manual_linked_appointment_id is not null;
