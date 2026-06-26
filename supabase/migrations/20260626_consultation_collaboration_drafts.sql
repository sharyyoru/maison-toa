alter table consultations
  add column if not exists collab_room_id text,
  add column if not exists is_draft boolean not null default false;

create unique index if not exists consultations_collab_room_id_key
  on consultations(collab_room_id);

create index if not exists consultations_patient_drafts_idx
  on consultations(patient_id, is_draft)
  where is_draft = true;
