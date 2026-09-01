create table if not exists public.colored_line_configurations (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('user', 'billing_entity')),
  target_id uuid not null,
  hex_color text not null check (hex_color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (target_type, target_id)
);

alter table public.colored_line_configurations enable row level security;

comment on table public.colored_line_configurations is
  'Color used for system lines associated with a user/doctor or billing entity.';
