create table if not exists public.exceptional_booking_availability (
  id uuid primary key default gen_random_uuid(),
  booking_doctor_id uuid not null references public.booking_doctors(id) on delete cascade,
  exception_date date not null,
  start_time time without time zone not null,
  end_time time without time zone not null,
  treatment_ids uuid[] not null default '{}',
  label text,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exceptional_booking_availability_time_order check (start_time < end_time),
  constraint exceptional_booking_availability_treatments check (cardinality(treatment_ids) > 0)
);

create index if not exists exceptional_booking_availability_doctor_date_idx
  on public.exceptional_booking_availability (booking_doctor_id, exception_date)
  where enabled = true;

alter table public.exceptional_booking_availability enable row level security;

comment on table public.exceptional_booking_availability is
  'One-off online booking windows that are limited to explicitly selected treatments.';
