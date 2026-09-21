-- EMAIL-008: Email Template Management
-- Adds template metadata (category, draft/published status, description,
-- language) and a version history table with restore support.

alter table email_templates
  add column if not exists category text,
  add column if not exists status text not null default 'published',
  add column if not exists description text,
  add column if not exists language text not null default 'fr';

create table if not exists email_template_versions (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references email_templates(id) on delete cascade,
  name text,
  subject_template text,
  body_template text,
  design_json jsonb,
  html_content text,
  category text,
  status text,
  description text,
  language text,
  created_by_name text,
  created_at timestamptz default now()
);

create index if not exists email_template_versions_template_idx
  on email_template_versions(template_id, created_at desc);

alter table email_template_versions enable row level security;

-- Same access model as email_templates: authenticated users manage versions.
drop policy if exists email_template_versions_all on email_template_versions;
create policy email_template_versions_all on email_template_versions
  for all to authenticated using (true) with check (true);
