-- Keep a durable reference from a patient task to the storage object it concerns.
alter table tasks
  add column if not exists document_name text,
  add column if not exists document_path text,
  add column if not exists document_bucket text;

comment on column tasks.document_path is
  'Storage object path for the patient document related to this task.';

