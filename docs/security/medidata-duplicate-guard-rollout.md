# Rolling out the MediData duplicate guard to a second project

The code fix is shared, so deploying the application covers every project. The
**database** changes and the **backfill/reconciliation** are per-project and
must be run against each one.

This was applied and verified on `maisontoa-clinic` (`mwtdhbllkzuryswrumrd`).
It has **not** been applied to Aesthetic Clinic (`chjswljpjxjcsbiresnb`) because
that project is not visible to the Supabase token currently available — see
"Access" below.

## Order matters

The unique index cannot be created while any invoice still has more than one
active submission, so reconciliation has to come first. The migration fails
with an explicit message rather than a constraint error if you get this wrong.

```bash
# 0. Point the tooling at the project (or pass --refs to each command).
#    .env.security must contain a SUPABASE_ACCESS_TOKEN that can see it.
export SUPABASE_PROJECT_REFS=chjswljpjxjcsbiresnb

# 1. Schema: response-error table + superseding columns.
node scripts/security/apply-sql.mjs \
  supabase/migrations/20261013_medidata_duplicate_guard.sql --confirm

# 2. Parse the insurer error codes out of the XML already stored on every
#    response. Read-only against `content`; additive and idempotent.
npx tsx scripts/medidata/backfill-response-errors.ts --dry-run   # inspect first
npx tsx scripts/medidata/backfill-response-errors.ts

# 3. Retire redundant active submissions and produce the worklist.
npx tsx scripts/medidata/reconcile-submissions.ts                # dry run
npx tsx scripts/medidata/reconcile-submissions.ts --confirm

# 4. Enforcement. Only succeeds once step 3 reports 0 remaining.
node scripts/security/apply-sql.mjs \
  supabase/migrations/20261013_medidata_unique_active_index.sql --confirm
```

## Verify

```bash
# Must return 0.
# (via apply-sql.mjs or the SQL editor)
select count(*) from (
  select invoice_id from medidata_submissions
   where invoice_id is not null
     and coalesce(is_storno,false) = false
     and coalesce(is_superseded,false) = false
     and status in ('pending','transmitted','delivered','accepted')
   group by invoice_id having count(*) > 1) t;

# No new Security Advisor errors; the new table must have RLS + a policy.
node scripts/security/ci-check.mjs
```

Expected result on `maisontoa-clinic`, for comparison:

| Check | Value |
|---|---|
| Invoices with >1 active submission | 0 (was 10) |
| Redundant submissions retired | 12 |
| Insurer error rows parsed | 892 across 31 distinct codes |
| Submissions with a real insurer reject code | 198 (was 0; 290 were null/`unknown`) |
| Rejections classified | 97% (10 of 331 unclassified, all safely `manual_only`) |
| Advisor errors | 0 |

## Expect a different code distribution

Reject codes are **not** a single namespace. `maisontoa-clinic` alone produced
6-digit (`000125`), 3-digit (`406`, `853`, `13`), 5-digit (`59109`) and
alphanumeric dotted (`eK6.2.1`, `5.113.002`, `S_000772`) codes from different
insurers. A second project with a different insurer mix will almost certainly
surface codes that `src/lib/medidataRejectionCodes.ts` has never seen.

That is safe by construction — an unrecognised code classifies as `UNKNOWN`,
whose policy is `manual_only`, so it can never silently authorise a resend. But
it does mean the worklist will show more "Unclassified" entries until the new
codes are mapped.

**After the backfill, review the unclassified codes and extend `CODE_RULES`:**

```sql
select e.code, left(e.text, 120) as text, count(*) as n, max(e.received_at)::date as last_seen
  from medidata_response_errors e
 group by 1, 2
 order by n desc
 limit 40;
```

Add genuinely new codes to `CODE_RULES` in
`src/lib/medidataRejectionCodes.ts`, add a case to
`src/__tests__/medidataRejectionCodes.test.ts` using the verbatim insurer text,
and re-run `npm test`.

## Configuration

`MEDIDATA_STALE_PENDING_DAYS` (default **45**) controls when a `pending`
submission with no insurer response is treated as stale and may be resent. Set
it identically for the app and for `reconcile-submissions.ts`, otherwise the
worklist and the guard will disagree about which invoices are billable.

## Rollback

Each piece is independently reversible, and none of it deletes data:

```sql
-- Stop enforcing (the application guard keeps working).
drop index if exists public.medidata_submissions_one_active_per_invoice;

-- Undo the reconciliation (restores the previous active rows).
update public.medidata_submissions
   set is_superseded = false,
       superseded_by_submission_id = null,
       superseded_reason = null,
       superseded_at = null
 where superseded_reason like 'Reconciliation %';
```

The parsed error rows can be left in place; they are additive and reading them
is what makes rejections explainable.

## Access

`chjswljpjxjcsbiresnb` is not reachable with the current token, so for that
project the following remain **unverified**: row counts, how many invoices have
multiple active submissions, its insurer code distribution, and whether the four
`SECURITY DEFINER` views from the original incident report (`distribution_stats`,
`v_invoices_enriched`, `v_invoice_lines_enriched`, `v_debiteurs`) live there —
they do **not** exist on `maisontoa-clinic`.

A fine-grained Supabase token covering that project (database read+write,
secrets read+write, analytics read, projects read) makes all of the above
runnable and verifiable in one pass.
