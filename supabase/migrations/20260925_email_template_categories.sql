-- EMAIL-008 (follow-up): user-managed email template categories.
create table if not exists email_template_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  created_at timestamptz default now()
);

alter table email_template_categories enable row level security;

drop policy if exists email_template_categories_all on email_template_categories;
create policy email_template_categories_all on email_template_categories
  for all to authenticated using (true) with check (true);

-- Seed with the predefined categories so existing choices keep working.
insert into email_template_categories (name) values
  ('Appointment'), ('Treatment'), ('Marketing'), ('Billing'), ('Aftercare'), ('Other')
on conflict (name) do nothing;
