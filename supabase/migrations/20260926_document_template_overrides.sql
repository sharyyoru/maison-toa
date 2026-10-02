-- DOC-003 follow-up: allow renaming and deleting built-in document templates.
-- Built-in templates live in the app bundle (public/documents) and cannot be
-- physically removed at runtime, so overrides record a display name and/or a
-- hidden flag per file.
create table if not exists document_template_overrides (
  file_name text primary key,
  display_name text,
  hidden boolean not null default false,
  updated_at timestamptz default now()
);

alter table document_template_overrides enable row level security;

drop policy if exists document_template_overrides_all on document_template_overrides;
create policy document_template_overrides_all on document_template_overrides
  for all to authenticated using (true) with check (true);
