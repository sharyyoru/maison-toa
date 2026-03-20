-- Migration: Swiss Insurer Laws Junction Table
-- Purpose: Enable many-to-many relationship between insurers and law types
-- Date: 2026-01-26
-- 
-- Changes:
-- 1. Create swiss_insurer_laws junction table
-- 2. Migrate existing law_type data from swiss_insurers
-- 3. Remove law_type column from swiss_insurers
-- 4. Update indexes

-- Step 1: Create junction table for many-to-many relationship
create table if not exists swiss_insurer_laws (
  id uuid primary key default gen_random_uuid(),
  insurer_id uuid not null references swiss_insurers(id) on delete cascade,
  law_type text check (law_type in ('KVG', 'UVG', 'IVG', 'MVG', 'VVG')) not null,
  created_at timestamptz default now(),
  unique(insurer_id, law_type)
);

-- Create indexes for efficient querying
create index if not exists swiss_insurer_laws_insurer_id_idx on swiss_insurer_laws(insurer_id);
create index if not exists swiss_insurer_laws_law_type_idx on swiss_insurer_laws(law_type);

-- Step 2: Migrate existing data from swiss_insurers.law_type to swiss_insurer_laws
-- Only migrate if the law_type column exists and has data
do $$
begin
  if exists (
    select 1 
    from information_schema.columns 
    where table_name = 'swiss_insurers' 
    and column_name = 'law_type'
  ) then
    insert into swiss_insurer_laws (insurer_id, law_type)
    select id, law_type 
    from swiss_insurers 
    where law_type is not null
    on conflict (insurer_id, law_type) do nothing;
  end if;
end $$;

-- Step 3: Drop the old law_type column from swiss_insurers
alter table if exists swiss_insurers drop column if exists law_type;

-- Step 4: Drop the old index on law_type (if it exists)
drop index if exists swiss_insurers_law_type_idx;

-- Verification query (commented out - uncomment to test)
-- select 
--   si.name,
--   si.gln,
--   array_agg(sil.law_type order by sil.law_type) as law_types
-- from swiss_insurers si
-- left join swiss_insurer_laws sil on sil.insurer_id = si.id
-- group by si.id, si.name, si.gln
-- order by si.name;
