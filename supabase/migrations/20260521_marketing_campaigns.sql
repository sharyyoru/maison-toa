-- Marketing Campaigns: filter-based lists + bulk template emails
-- Adds three tables plus an opt-out column on patients.

-- Opt-out flag for marketing emails (transactional emails still go through)
alter table public.patients
  add column if not exists marketing_opt_out boolean not null default false;

-- Saved audience filters ("Lists")
create table if not exists public.marketing_lists (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  -- JSON filter definition. Shape is interpreted server-side.
  filter jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_marketing_lists_created_at
  on public.marketing_lists(created_at desc);

-- Campaign headers (one row per send)
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  -- Either references a saved list, or carries an inline snapshot of the filter used
  list_id uuid references public.marketing_lists(id) on delete set null,
  filter_snapshot jsonb,
  template_id uuid,
  subject text not null,
  html_snapshot text,                        -- rendered HTML before variable substitution (for audit)
  status text not null default 'draft',      -- draft | sending | sent | partial | failed | cancelled
  total_recipients int not null default 0,
  total_sent int not null default 0,
  total_failed int not null default 0,
  total_opened int not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists idx_marketing_campaigns_created_at
  on public.marketing_campaigns(created_at desc);
create index if not exists idx_marketing_campaigns_status
  on public.marketing_campaigns(status);

-- Per-recipient rows for tracking
create table if not exists public.marketing_campaign_recipients (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.marketing_campaigns(id) on delete cascade,
  patient_id uuid references public.patients(id) on delete set null,
  email text not null,
  status text not null default 'pending',   -- pending | sent | failed | skipped | opened
  email_id uuid,                            -- FK to emails.id (no FK constraint; table may not always exist)
  error text,
  sent_at timestamptz,
  opened_at timestamptz
);

create index if not exists idx_marketing_recipients_campaign
  on public.marketing_campaign_recipients(campaign_id);
create index if not exists idx_marketing_recipients_patient
  on public.marketing_campaign_recipients(patient_id);
create index if not exists idx_marketing_recipients_status
  on public.marketing_campaign_recipients(campaign_id, status);

-- RLS: service role does all writes; authenticated users can read
alter table public.marketing_lists enable row level security;
alter table public.marketing_campaigns enable row level security;
alter table public.marketing_campaign_recipients enable row level security;

drop policy if exists "marketing_lists authenticated read" on public.marketing_lists;
create policy "marketing_lists authenticated read"
  on public.marketing_lists for select
  to authenticated
  using (true);

drop policy if exists "marketing_lists authenticated write" on public.marketing_lists;
create policy "marketing_lists authenticated write"
  on public.marketing_lists for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "marketing_campaigns authenticated read" on public.marketing_campaigns;
create policy "marketing_campaigns authenticated read"
  on public.marketing_campaigns for select
  to authenticated
  using (true);

drop policy if exists "marketing_campaigns authenticated write" on public.marketing_campaigns;
create policy "marketing_campaigns authenticated write"
  on public.marketing_campaigns for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "marketing_recipients authenticated read" on public.marketing_campaign_recipients;
create policy "marketing_recipients authenticated read"
  on public.marketing_campaign_recipients for select
  to authenticated
  using (true);

drop policy if exists "marketing_recipients authenticated write" on public.marketing_campaign_recipients;
create policy "marketing_recipients authenticated write"
  on public.marketing_campaign_recipients for all
  to authenticated
  using (true)
  with check (true);
