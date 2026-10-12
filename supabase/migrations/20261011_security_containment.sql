-- =====================================================================
-- Phase 1 — SECURITY CONTAINMENT
-- =====================================================================
-- Closes unauthenticated access to the `public` schema.
--
-- THIS MIGRATION IS INTENTIONALLY BLUNT AND WILL BREAK FEATURES.
-- Enabling RLS with no policies is deny-all for everyone except
-- `service_role`. Anything that reads the database with the anon key
-- (public booking pages, landing pages, patient-facing forms) stops
-- working until Phase 2 adds explicit policies.
--
-- It is written to be idempotent and safe to re-run.
--
-- Prerequisites: Step 0 evidence collected, backup taken (see
-- scripts/security/backup.mjs). Apply with
-- `node scripts/security/phase1-apply.mjs --confirm`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Enable RLS on every table in `public`
-- ---------------------------------------------------------------------
-- Covers ordinary and partitioned tables. Child partitions inherit the
-- parent's RLS, but we set them anyway so a partition detached later
-- does not silently become readable.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.oid::regclass as rel
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind in ('r', 'p')
       and c.relrowsecurity = false
  loop
    execute format('alter table %s enable row level security', r.rel);
    raise notice 'RLS enabled on %', r.rel;
    n := n + 1;
  end loop;
  raise notice 'Phase 1.1: enabled RLS on % table(s)', n;
end $$;

-- ---------------------------------------------------------------------
-- 2. Make views run with the CALLER's permissions
-- ---------------------------------------------------------------------
-- A view without `security_invoker` executes as its owner (typically
-- `postgres`), so it reads straight through the RLS we just enabled.
-- Done dynamically: the four views named in the incident report are not
-- necessarily the only ones, and new ones must not be missed.
--
-- NOTE: materialized views do not support security_invoker and always
-- run as their owner. Any matview over patient data must instead have
-- API access revoked; they are reported in section 5 below.
do $$
declare
  r record;
  n int := 0;
begin
  for r in
    select c.oid::regclass as rel
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public'
       and c.relkind = 'v'
       and not exists (
         select 1 from unnest(coalesce(c.reloptions, '{}')) o
          where o ilike 'security_invoker=true' or o ilike 'security_invoker=on'
       )
  loop
    execute format('alter view %s set (security_invoker = true)', r.rel);
    raise notice 'security_invoker set on %', r.rel;
    n := n + 1;
  end loop;
  raise notice 'Phase 1.2: fixed % view(s)', n;
end $$;

-- ---------------------------------------------------------------------
-- 3. Remove anonymous access, now and for the future
-- ---------------------------------------------------------------------
revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;

-- Do not let anon discover the schema at all.
revoke usage on schema public from anon;

-- Default privileges are per-creating-role, so a single statement only
-- covers objects created by the role running this migration. Apply for
-- every role that actually creates objects here.
-- Changing another role's default privileges requires membership of that
-- role. The migration runs as `postgres`, which is not a member of
-- `supabase_admin`, so that one raises 42501. Skip what we cannot change
-- rather than aborting the whole containment migration for it.
do $$
declare
  role_name text;
  obj_type  text;
begin
  foreach role_name in array array['postgres', 'supabase_admin', 'supabase_auth_admin', 'authenticator']
  loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = role_name) then
      continue;
    end if;
    begin
      foreach obj_type in array array['tables', 'sequences', 'functions']
      loop
        execute format(
          'alter default privileges for role %I in schema public revoke all on %s from anon',
          role_name, obj_type);
      end loop;
      raise notice 'default privileges revoked from anon for creator role %', role_name;
    exception
      when insufficient_privilege then
        raise warning 'cannot alter default privileges for role % (insufficient privilege) — '
          'objects created by that role may still be granted to anon; the Phase 4 '
          'event trigger and CI check are the compensating controls', role_name;
    end;
  end loop;
end $$;

-- Also covers the role executing this migration, whoever that is.
alter default privileges in schema public revoke all on tables    from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- ---------------------------------------------------------------------
-- 4. Make storage buckets private
-- ---------------------------------------------------------------------
-- Deliberately NOT a blanket `update storage.buckets set public = false`:
-- that would also take down genuinely public assets (marketing images,
-- booking-page media) with no record of what changed.
--
-- Buckets listed in `keep_public` stay public. Populate it from the
-- Step 0 inventory after review; everything else is made private and
-- logged by name.
do $$
declare
  keep_public text[] := array[]::text[];  -- e.g. array['booking-images']
  r record;
  n int := 0;
begin
  if not exists (
    select 1 from information_schema.tables
     where table_schema = 'storage' and table_name = 'buckets'
  ) then
    raise notice 'Phase 1.4: storage not provisioned, skipping';
    return;
  end if;

  for r in
    select id from storage.buckets where public = true and not (id = any (keep_public))
  loop
    update storage.buckets set public = false where id = r.id;
    raise notice 'bucket made private: %', r.id;
    n := n + 1;
  end loop;

  raise notice 'Phase 1.4: made % bucket(s) private; kept public: %',
    n, coalesce(array_to_string(keep_public, ', '), '(none)');
end $$;

-- ---------------------------------------------------------------------
-- 5. Report residual risk that this migration cannot fix
-- ---------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select c.relname
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace ns on ns.oid = c.relnamespace
     where ns.nspname = 'public' and c.relkind = 'm'
  loop
    raise warning 'materialized view public.% runs as its owner and ignores RLS — review in Phase 2', r.relname;
  end loop;

  for r in
    select p.proname
      from pg_catalog.pg_proc p
      join pg_catalog.pg_namespace ns on ns.oid = p.pronamespace
     where ns.nspname = 'public' and p.prosecdef
  loop
    raise warning 'SECURITY DEFINER function public.% bypasses RLS — review in Phase 3', r.proname;
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- Reminder: `service_role` bypasses everything above by design. This
-- migration provides NO protection while a service_role key is leaked.
-- See reports/CRITICAL-leaked-service-role-keys.md.
-- ---------------------------------------------------------------------
