-- =====================================================================
-- Phase 4 — PREVENT RECURRENCE
-- =====================================================================
-- An event trigger that enables RLS on any new table in `public` the
-- moment it is created, so the Phase 1 gap cannot reopen by accident
-- (ad-hoc `CREATE TABLE AS` during a migration is how tmp_* tables with
-- patient data appeared in the first place).
--
-- Event triggers require superuser. On Supabase the migration runs as a
-- role that has it; if the platform refuses, this migration fails
-- loudly and the CI check in .github/workflows/security-guardrails.yml
-- is the fallback control.
-- =====================================================================

create schema if not exists private;

-- `private` must not be reachable through the API.
revoke all on schema private from anon, authenticated;

comment on schema private is
  'Internal helpers that must never be exposed via PostgREST. Not in the API schema list.';

create or replace function private.rls_auto_enable()
returns event_trigger
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
  cmd record;
begin
  for cmd in
    select *
      from pg_event_trigger_ddl_commands()
     where command_tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
       and object_type = 'table'
       and schema_name = 'public'
  loop
    execute format('alter table %s enable row level security', cmd.object_identity);
    raise notice 'rls_auto_enable: RLS enabled on %', cmd.object_identity;
  end loop;
end $$;

comment on function private.rls_auto_enable() is
  'Event trigger function: forces RLS on every new public table. See docs/security/pre-production-checklist.md.';

-- CREATE EVENT TRIGGER has no IF NOT EXISTS, so drop first for idempotency.
drop event trigger if exists ensure_rls;

create event trigger ensure_rls
  on ddl_command_end
  execute function private.rls_auto_enable();

-- ---------------------------------------------------------------------
-- Verify it actually took effect, rather than trusting that it did.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_catalog.pg_event_trigger where evtname = 'ensure_rls') then
    raise exception 'ensure_rls event trigger was not created — rely on the CI guardrail instead';
  end if;
  raise notice 'Phase 4: ensure_rls event trigger active';
end $$;
