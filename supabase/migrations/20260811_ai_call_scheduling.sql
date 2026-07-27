-- Phase 3: AI Call scheduling from patient page
-- Adds tables + columns for scheduled outbound Retell calls and call logs.

-- Scheduled calls queue (dispatcher reads this every minute)
create table if not exists retell_scheduled_calls (
  id uuid primary key default gen_random_uuid(),
  patient_id uuid not null references patients(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'dispatched', 'failed', 'cancelled')),
  user_name text not null,
  service_name text not null,
  to_number text not null,
  retell_call_id text,
  error_message text,
  created_at timestamptz default now(),
  dispatched_at timestamptz,
  prompt text,
  task_id uuid references tasks(id) on delete set null,
  agent_id text,
  scheduled_by_email text,
  scheduled_by_name text
);

create index if not exists retell_scheduled_calls_status_scheduled_idx
  on retell_scheduled_calls(status, scheduled_for);
create index if not exists retell_scheduled_calls_patient_id_idx
  on retell_scheduled_calls(patient_id);
create index if not exists idx_retell_scheduled_calls_task_id
  on retell_scheduled_calls(task_id);

-- Per-call Retell webhook outcomes
create table if not exists retell_call_logs (
  id uuid primary key default gen_random_uuid(),
  retell_call_id text not null unique,
  patient_id uuid references patients(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  scheduled_call_id uuid references retell_scheduled_calls(id) on delete set null,
  event_type text,
  call_status text,
  duration_seconds integer,
  transcript text,
  call_summary text,
  recording_url text,
  raw_payload jsonb,
  created_at timestamptz default now()
);

create index if not exists retell_call_logs_patient_id_idx
  on retell_call_logs(patient_id);
create index if not exists retell_call_logs_retell_call_id_idx
  on retell_call_logs(retell_call_id);

-- Unified call log store used by the CRM
create table if not exists call_logs (
  id uuid primary key default gen_random_uuid(),
  call_id text unique,
  patient_id uuid references patients(id) on delete cascade,
  deal_id uuid references deals(id) on delete set null,
  direction text,
  agent_id text,
  from_number text,
  to_number text,
  call_status text,
  disconnection_reason text,
  duration_seconds integer,
  summary text,
  transcript text,
  transcript_turns jsonb,
  recording_url text,
  service_interest text,
  task_id uuid references tasks(id) on delete set null,
  assigned_user_id uuid references auth.users(id) on delete set null,
  assigned_user_name text,
  source text default 'retell',
  scheduled_call_id uuid references retell_scheduled_calls(id) on delete set null,
  prompt text,
  started_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_call_logs_patient_id on call_logs(patient_id);
create index if not exists idx_call_logs_created_at on call_logs(created_at desc);
create index if not exists idx_call_logs_direction on call_logs(direction);
create index if not exists idx_call_logs_scheduled_call_id on call_logs(scheduled_call_id);

alter table call_logs enable row level security;

drop policy if exists "Authenticated users can read call logs" on call_logs;
create policy "Authenticated users can read call logs"
  on call_logs for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users can insert call logs" on call_logs;
create policy "Authenticated users can insert call logs"
  on call_logs for insert
  to authenticated
  with check (true);

drop policy if exists "Authenticated users can update call logs" on call_logs;
create policy "Authenticated users can update call logs"
  on call_logs for update
  to authenticated
  using (true);

grant select, insert, update on call_logs to authenticated;
