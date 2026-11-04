-- =====================================================================
-- Per-insurer tariff point values (valeur du point tarifaire / Taxpunktwert)
-- =====================================================================
-- Problem this solves:
--
-- The tax point value was resolved in the browser as
--     CANTON_TAX_POINT_VALUES[canton] ?? 0.96
-- a hardcoded constant keyed on CANTON ONLY. In Swiss TARDOC/TARMED billing
-- the value is negotiated per cost-bearer group (tarifsuisse, HSK, CSS, …)
-- AND per canton, and it changes over time. With a single canton-wide number,
-- every invoice to an insurer on a different rate is wrong, which is why
-- billing staff correct them by hand and why insurers reject with
--   59109    "Valeurs du point tarifaire trop élevées"
--   eK6.T001 "La taxe de valeur est trop grande"
--
-- This table makes the value data, not code: resolvable per insurer, per
-- canton, per law, with validity dates so a mid-year change is just a new row.
--
-- IMPORTANT — no tariff values have been invented here.
-- The seed below contains ONLY the canton defaults that were already present
-- in src/lib/tardoc.ts, moved verbatim. Insurer-specific rates must be entered
-- from your actual contracts; until a row exists for an insurer the resolver
-- falls back to the canton default, i.e. exactly today's behaviour.
-- =====================================================================

create table if not exists public.tariff_point_values (
  id            uuid primary key default gen_random_uuid(),

  -- Scope. NULL means "applies to anything" for that dimension, so a row can
  -- be a canton default (insurer_gln null) or an insurer-specific override.
  insurer_gln   text,
  insurer_group text,            -- e.g. 'tarifsuisse', 'HSK', 'CSS'
  canton        text not null,
  law_type      text,            -- KVG / UVG / IVG / MVG; null = any
  tariff_type   text not null default '007',  -- 007 TARDOC, 001 TARMED

  value         numeric(6,4) not null check (value > 0 and value < 10),

  valid_from    date not null default '2000-01-01',
  valid_to      date,            -- null = still in force

  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table public.tariff_point_values is
  'Tariff point values (TPV) per insurer/canton/law/period. Replaces the hardcoded CANTON_TAX_POINT_VALUES constant. Most specific match wins; see src/lib/tariffPointValues.ts.';
comment on column public.tariff_point_values.insurer_gln is
  'Exact cost bearer. Most specific match. NULL = applies to any insurer.';
comment on column public.tariff_point_values.insurer_group is
  'Purchasing group (tarifsuisse / HSK / CSS). Used when no GLN-specific row exists.';
comment on column public.tariff_point_values.valid_to is
  'NULL = currently in force. Supersede a rate by closing the old row and inserting a new one, so historical invoices stay reproducible.';

create index if not exists tariff_point_values_lookup_idx
  on public.tariff_point_values (canton, tariff_type, valid_from desc);
create index if not exists tariff_point_values_gln_idx
  on public.tariff_point_values (insurer_gln) where insurer_gln is not null;

-- One rate per scope per period.
create unique index if not exists tariff_point_values_scope_idx
  on public.tariff_point_values (
    coalesce(insurer_gln, ''), coalesce(insurer_group, ''), canton,
    coalesce(law_type, ''), tariff_type, valid_from
  );

-- ---------------------------------------------------------------------
-- RLS: staff read, admins write. Never anon.
-- ---------------------------------------------------------------------
alter table public.tariff_point_values enable row level security;

drop policy if exists tariff_point_values_authenticated_read on public.tariff_point_values;
create policy tariff_point_values_authenticated_read
  on public.tariff_point_values for select to authenticated using (true);

revoke all on public.tariff_point_values from anon;
grant select on public.tariff_point_values to authenticated;

-- ---------------------------------------------------------------------
-- Seed: the canton defaults that were already hardcoded in src/lib/tardoc.ts.
-- Verbatim, nothing invented. insurer_gln NULL = canton-wide default.
-- ---------------------------------------------------------------------
insert into public.tariff_point_values (canton, tariff_type, value, note)
values
  ('AG','007',0.8900,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('AI','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('AR','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('BE','007',0.8900,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('BL','007',0.9100,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('BS','007',0.9600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('FR','007',0.8800,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('GE','007',0.9600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('GL','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('GR','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('JU','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('LU','007',0.8900,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('NE','007',0.8900,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('NW','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('OW','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('SG','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('SH','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('SO','007',0.8900,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('SZ','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('TG','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('TI','007',0.9000,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('UR','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('VD','007',0.9300,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('VS','007',0.8600,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('ZG','007',0.9300,'Canton default migrated from CANTON_TAX_POINT_VALUES'),
  ('ZH','007',0.9300,'Canton default migrated from CANTON_TAX_POINT_VALUES')
on conflict do nothing;

do $$
begin
  raise notice 'tariff_point_values created and seeded with % canton defaults. Insurer-specific rates must be entered from contracts.',
    (select count(*) from public.tariff_point_values);
end $$;
