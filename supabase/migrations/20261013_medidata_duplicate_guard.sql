-- =====================================================================
-- MediData: duplicate-submission guard, part 1 (schema)
-- =====================================================================
-- Context: ~107 of the insurer rejections on this project are duplicates
-- ("Double calcul", "facture déjà reçue/payée"). 68 invoices produced 184 of
-- 360 submissions. Root cause: no idempotency check anywhere in the send path,
-- and insurers' machine-readable reject codes were never parsed, so staff could
-- not see WHY something failed and simply re-sent it.
--
-- This migration only adds structure. The unique index that actually enforces
-- one active submission per invoice is in
-- 20261013_medidata_unique_active_index.sql, which must run AFTER
-- scripts/medidata/reconcile-submissions.mjs has retired existing duplicates.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Structured insurer rejection errors
-- ---------------------------------------------------------------------
-- The response XML already contains these, e.g.
--   <invoice:error record_id="2" code="000412"
--                 text="Prestation TARDOC déjà compensée le même jour"/>
-- but the poller only stored status_out, which is literally "unknown" in the
-- insurer payload. One row per <invoice:error>; record_id ties an error to a
-- specific service line when the insurer provides it.
create table if not exists public.medidata_response_errors (
  id           uuid primary key default gen_random_uuid(),
  response_id  uuid not null references public.medidata_responses(id) on delete cascade,
  submission_id uuid references public.medidata_submissions(id) on delete set null,
  code         text not null,
  text         text,
  record_id    text,
  insurer_gln  text,
  received_at  timestamptz,
  created_at   timestamptz not null default now()
);

comment on table public.medidata_response_errors is
  'One row per <invoice:error> element in an insurer response. Populated by /api/medidata/poll and backfilled by scripts/medidata/backfill-response-errors.mjs.';
comment on column public.medidata_response_errors.record_id is
  'Insurer-provided service line reference, when the error is line-specific rather than invoice-level.';
comment on column public.medidata_response_errors.insurer_gln is
  'Needed because reject codes are NOT a single namespace: Sanitas uses 6-digit codes (000125), other insurers 3-digit (406) and 5-digit (59109). Classification keys on (code, insurer_gln).';

create index if not exists medidata_response_errors_response_id_idx
  on public.medidata_response_errors (response_id);
create index if not exists medidata_response_errors_submission_id_idx
  on public.medidata_response_errors (submission_id);
create index if not exists medidata_response_errors_code_idx
  on public.medidata_response_errors (code);
-- Makes the backfill idempotent and blocks double-parsing of one response.
--
-- NULLS NOT DISTINCT (PG15+; this project runs 17) is required because
-- invoice-level errors have record_id IS NULL. Under default NULLS DISTINCT
-- those rows would never collide and re-running the backfill would duplicate
-- them. It also has to be a plain column list, not coalesce(record_id,''),
-- so that `ON CONFLICT (response_id, code, record_id)` can infer this index.
drop index if exists public.medidata_response_errors_dedupe_idx;
create unique index if not exists medidata_response_errors_dedupe_idx
  on public.medidata_response_errors (response_id, code, record_id)
  nulls not distinct;

-- RLS: required by the Phase 4 event trigger and the CI guardrail.
alter table public.medidata_response_errors enable row level security;

-- Visibility follows the parent submission rather than restating a tenant rule.
-- A subquery inside a policy is evaluated with the caller's own RLS applied to
-- medidata_submissions, so when Phase 2 replaces that table's `USING (true)`
-- with real clinic scoping, this table tightens automatically and cannot drift.
-- Deliberately NOT `USING (true)`.
drop policy if exists "medidata_response_errors_follow_parent" on public.medidata_response_errors;
create policy "medidata_response_errors_follow_parent"
  on public.medidata_response_errors
  for select
  to authenticated
  using (
    submission_id is null
    or exists (
      select 1 from public.medidata_submissions s
       where s.id = public.medidata_response_errors.submission_id
    )
  );

-- No INSERT/UPDATE/DELETE policy: only the poller and the backfill script write
-- here, and both use the service role, which bypasses RLS by design.
grant select on public.medidata_response_errors to authenticated;
revoke all on public.medidata_response_errors from anon;

-- ---------------------------------------------------------------------
-- 2. Superseding
-- ---------------------------------------------------------------------
-- `cancelled` must keep meaning "a Storno was actually transmitted to the
-- insurer", so retiring a stale or redundant row needs its own flag. The
-- unique index in part 2 excludes superseded rows, which is what lets the
-- stale-pending override resend without tripping the constraint.
alter table public.medidata_submissions
  add column if not exists is_superseded boolean not null default false,
  add column if not exists superseded_by_submission_id uuid references public.medidata_submissions(id) on delete set null,
  add column if not exists superseded_reason text,
  add column if not exists superseded_at timestamptz;

comment on column public.medidata_submissions.is_superseded is
  'True when this submission has been retired in favour of a newer one (stale pending override, or reconciliation of pre-existing duplicates). Excluded from the one-active-submission-per-invoice index.';

-- Supports the guard's "latest active submission for this invoice" lookup.
create index if not exists medidata_submissions_invoice_active_idx
  on public.medidata_submissions (invoice_id, created_at desc)
  where coalesce(is_storno, false) = false
    and coalesce(is_superseded, false) = false;

do $$
begin
  raise notice 'medidata duplicate guard part 1 applied: response errors table + superseding columns';
end $$;
