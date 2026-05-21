-- Migration: Create booking_blocked_dates table
-- Purpose: Store dates when the clinic is closed and external bookings should be blocked

create table if not exists booking_blocked_dates (
  id uuid primary key default gen_random_uuid(),
  blocked_date date not null unique,
  reason text,
  created_by uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Index for efficient date lookups
create index if not exists booking_blocked_dates_date_idx on booking_blocked_dates(blocked_date);

-- Enable RLS
alter table booking_blocked_dates enable row level security;

-- Policy: Allow authenticated users to view blocked dates
create policy "Allow authenticated users to view blocked dates"
  on booking_blocked_dates for select
  to authenticated
  using (true);

-- Policy: Allow authenticated users to insert blocked dates
create policy "Allow authenticated users to insert blocked dates"
  on booking_blocked_dates for insert
  to authenticated
  with check (true);

-- Policy: Allow authenticated users to delete blocked dates
create policy "Allow authenticated users to delete blocked dates"
  on booking_blocked_dates for delete
  to authenticated
  using (true);

-- Policy: Allow anon users to view blocked dates (for public booking pages)
create policy "Allow anon users to view blocked dates"
  on booking_blocked_dates for select
  to anon
  using (true);
