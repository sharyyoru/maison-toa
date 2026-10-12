-- =====================================================================
-- MediData: duplicate-submission guard, part 2 (enforcement)
-- =====================================================================
-- The database backstop for the application guard in
-- src/lib/medidataSubmissionGuard.ts. The app check gives users a friendly
-- message; this index is what makes the invariant actually hold when two
-- people click "Send to insurance" at the same moment, or when a script
-- bypasses the API entirely.
--
-- PREREQUISITE: scripts/medidata/reconcile-submissions.ts --confirm must have
-- run first. 10 invoices had more than one active submission; the index cannot
-- be created while they exist. The guard below aborts with a clear message
-- rather than failing on an opaque constraint violation.
-- =====================================================================

do $$
declare
  offenders int;
  detail text;
begin
  select count(*) into offenders from (
    select invoice_id
      from public.medidata_submissions
     where invoice_id is not null
       and coalesce(is_storno, false) = false
       and coalesce(is_superseded, false) = false
       and status in ('pending','transmitted','delivered','accepted')
     group by invoice_id
    having count(*) > 1
  ) t;

  if offenders > 0 then
    select string_agg(invoice_number, ', ') into detail from (
      select max(invoice_number) as invoice_number
        from public.medidata_submissions
       where invoice_id is not null
         and coalesce(is_storno, false) = false
         and coalesce(is_superseded, false) = false
         and status in ('pending','transmitted','delivered','accepted')
       group by invoice_id
      having count(*) > 1
      limit 20
    ) t;

    raise exception
      'Cannot create the one-active-submission-per-invoice index: % invoice(s) still have multiple active submissions (%). Run: npx tsx scripts/medidata/reconcile-submissions.ts --confirm',
      offenders, coalesce(detail, 'unknown');
  end if;
end $$;

-- A plain (non-CONCURRENT) index is used deliberately: this table holds a few
-- hundred rows, so the build is effectively instantaneous and the brief lock is
-- harmless, whereas CREATE INDEX CONCURRENTLY cannot run inside the
-- transaction that migrations execute in. If this is ever applied to a project
-- where medidata_submissions has grown large, build it CONCURRENTLY outside a
-- transaction instead.
--
-- Predicate rationale:
--   is_storno       - a Storno is a second, legitimate message about the same
--                     invoice and must never collide with the original.
--   is_superseded   - lets the stale-pending override retire the old row and
--                     insert a new one without tripping the constraint.
--   status IN (...) - `draft` never blocks, and `rejected`/`cancelled` are
--                     terminal, so a corrected resend after a data-error
--                     rejection stays possible without a Storno.
create unique index if not exists medidata_submissions_one_active_per_invoice
  on public.medidata_submissions (invoice_id)
  where invoice_id is not null
    and coalesce(is_storno, false) = false
    and coalesce(is_superseded, false) = false
    and status in ('pending','transmitted','delivered','accepted');

comment on index public.medidata_submissions_one_active_per_invoice is
  'At most one live submission per invoice. Violations surface as SQLSTATE 23505 and are translated into a friendly "already submitted" response by /api/medidata/queue-submission and /api/medidata/send-invoice.';

do $$
begin
  raise notice 'medidata duplicate guard part 2 applied: one active submission per invoice is now enforced';
end $$;
