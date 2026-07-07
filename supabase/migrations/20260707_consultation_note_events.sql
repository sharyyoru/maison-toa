create table if not exists consultation_note_events (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  consultation_id uuid references consultations(id) on delete cascade,
  collab_room_id text,
  event_type text not null,
  actor_user_id uuid,
  actor_name text,
  actor_email text,
  client_id text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists consultation_note_events_patient_created_idx
  on consultation_note_events(patient_id, created_at desc);

create index if not exists consultation_note_events_consultation_created_idx
  on consultation_note_events(consultation_id, created_at desc);

create index if not exists consultation_note_events_room_created_idx
  on consultation_note_events(collab_room_id, created_at desc);
