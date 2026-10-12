# Security incident report

**Status:** OPEN — Step 0 partially complete, containment not yet applied.
**Owner:** _unassigned_
**Last updated:** 2026-10-09

Sections marked _PENDING_ are filled in automatically by
`scripts/security/step0-evidence.mjs` once a Management API token is available.
Nothing in this document should be treated as final while that is true.

---

## 1. Summary

Two distinct but compounding problems were identified in the Maison TOA
Supabase estate:

1. **Publicly leaked `service_role` credentials** (confirmed). Live
   full-database keys for two Supabase projects were committed to a **public**
   GitHub repository for approximately **203 days**.
2. **Missing Row Level Security** on tables in the `public` schema (reported:
   77 Security Advisor errors, 111 warnings), plus four `SECURITY DEFINER`
   views and leftover migration tables containing patient data.

These interact badly. `service_role` bypasses RLS entirely, so for as long as
problem 1 was live, problem 2 was irrelevant to an attacker holding the key —
and fixing problem 2 alone would have provided no protection.

The data at risk is Swiss patient health data, which is special-category
personal data under the nFADP.

## 2. Timeline

| Date | Event | Source |
|---|---|---|
| 2025-12-09 | `service_role` key for project B issued (`iat` claim) | JWT claim |
| 2026-03-20 | `service_role` + `anon` keys committed in `.env.example` (`8ab6ab5`) | `git log` |
| 2026-03-20 | `service_role` key for project B committed in `scripts/run-payrexx-migration.ts` (`f70a333`) | `git log` |
| 2026-03-20 | `service_role` key for project A issued (`iat` claim) | JWT claim |
| 2026-03-21 | `service_role` key committed in `push-schema.js` (`f9790b6`) | `git log` |
| 2026-07-14 | `service_role` key committed in `scripts/test-booking-deposit-flow.mjs` (`2ff235e`) | `git log` |
| 2026-10-09 | Remediation begins; leak discovered during Step 0 | this engagement |
| 2026-10-09 | All hardcoded credentials removed from the working tree | `git diff` |
| _PENDING_ | Keys rotated / legacy keys disabled | |
| _PENDING_ | Phase 1 containment applied | |

**Exposure window for credentials: 2026-03-20 → 2026-10-09, ~203 days.**
Both leaked keys carry ~10-year expiries (2035 and 2036) and were valid
throughout.

## 3. Root cause

**Immediate cause.** Operational scripts were written with credentials inlined
as literals rather than read from the environment, and `.env.example` was
populated with real values instead of placeholders.

**Why it persisted.** `.gitignore` contains `.env*`, which gives the impression
that env files are protected. It has no effect on `.env.example` because the
file was already tracked when the rule was added — `.gitignore` is only
consulted for *untracked* files. The control looked present but was inert.

**Why it was not detected.** The repository is public with no secret scanning
or push protection enabled, and there was no CI check for committed
credentials.

**Contributing cause for the RLS gap.** Tables were created by ad-hoc scripts
and `CREATE TABLE AS` statements during data migration (hence `tmp_*` tables
holding patient data), where Supabase's default of RLS-on-new-tables via the
dashboard does not apply. No guardrail enforced RLS at the database level.

## 4. Data categories exposed

_PENDING — populated from `reports/<ref>/findings.md`._

Preliminary, from the one project reachable at the time of writing (a
development project, empty of patient data):

- `users` — 8 rows, readable with the `anon` key
- `patients`, `appointments`, `invoices`, `consultations`, `providers` —
  reachable by `anon` (HTTP 200, no RLS block) but containing 0 rows

Expected categories on the production projects, to be confirmed: patient
identity, dates of birth, AHV/AVS social-insurance numbers, addresses,
contact details, insurance membership, diagnoses (ICD-10), clinical notes,
and billing/IBAN data.

## 5. Log findings

_PENDING — see `reports/<ref>/access_logs_summary.md`._

**Known constraint, recorded now because it will not change:** Supabase log
retention is plan-capped at roughly 1 day (Free), 7 days (Pro), or 28 days
(Team). The credential exposure window is ~203 days. The logs therefore cannot
establish whether the leaked keys were used for the great majority of the
exposure period.

**Absence of evidence in the logs is not evidence that no access occurred.**
Any nFADP assessment must be made on that basis. A `service_role` request is
also indistinguishable from legitimate backend traffic except by origin IP, so
even within the retained window, attribution is weak.

## 6. Fixes applied

| # | Fix | Status | Timestamp |
|---|---|---|---|
| 1 | Removed hardcoded credentials from 4 tracked files | done (uncommitted) | 2026-10-09 |
| 2 | `.env.example` reduced to placeholders | done (uncommitted) | 2026-10-09 |
| 3 | Mint new API keys; disable legacy JWT keys | _pending_ | |
| 4 | Phase 1 containment migration (RLS, `security_invoker`, revoke `anon`, private buckets) | _written, not applied_ | |
| 5 | Drop leftover `tmp_*` tables | _blocked: awaiting owner approval_ | |
| 6 | Phase 2 explicit RLS policies | _not started_ | |
| 7 | Phase 3 advisor warnings + auth hardening | _tooling written_ | |
| 8 | Event trigger forcing RLS on new tables | _written, not applied_ | |
| 9 | CI guardrails (`security-guardrails.yml`) | done (uncommitted) | 2026-10-09 |
| 10 | Enable GitHub secret scanning + push protection | _owner action_ | |
| 11 | Consider making the repository private | _owner decision_ | |

## 6a. Event: scratch tables emptied between 2026-10-09 and 2026-10-12

**Unattributed.** Detected 2026-10-12 while regenerating the Phase 1b report.

All 16 leftover scratch tables, which held **430,100 rows** of patient data when
inventoried on 2026-10-09, are now empty. The tables still exist.

Statistics from `pg_stat_user_tables` indicate `TRUNCATE` rather than row-level
deletion — `n_tup_del = 0` against large cumulative `n_tup_ins`, with
`relpages = 0` and `reltuples = -1` (never re-analysed since):

| Table | Rows inserted (cumulative) | Row deletes | Live rows |
|---|---:|---:|---:|
| `temp_patient_treatment_2` | 304,756 | 0 | 0 |
| `tmp_appointments` | 223,654 | 9 | 0 |
| `tmp_invoice_raw` | 88,206 | 0 | 0 |
| `tmp_accounted_medical_invoices` | 86,857 | 0 | 0 |
| `tmp_axenita_invoice_lines` | 41,661 | 0 | 0 |
| `tmp_patients` | 16,192 | 0 | 0 |
| `tmp_contacts_phone` | 16,030 | 0 | 0 |

**Assessment: most likely deliberate housekeeping by the owner or a colleague**
in response to the Phase 1b report. The action was precisely scoped to the
tables flagged as highest risk, and core production data was untouched and has
in fact grown over the same period (`patients` 17,196; `appointments` 129,851;
`consultation_note_events` 92,835 → 96,797). An attacker holding the leaked
`service_role` key would have had no motive to destroy only the redundant
migration artifacts while leaving the live patient database intact.

**This cannot be proven.** There are no API/edge logs on this project (section 5)
and `organization_audit_log` has no entries since 2026-10-09, so the actor,
time, and method are not recoverable from the database. Confirmation must come
from the owner.

**Consequences:**
- Phase 1b becomes zero-data-loss: dropping these tables now destroys nothing.
- If the contents were never exported, that pre-migration source data exists
  only in the managed daily backups, which currently reach back to
  2026-10-02 — i.e. **recoverable now, but on a rolling window**. If that data
  has any retention value it must be extracted from a backup before it ages out.

## 7. Remaining risks

1. **The leaked keys are still live** until the legacy keys are disabled. This
   is the single highest-severity open item.
2. **History cannot be cleaned.** The keys exist in every clone, fork, and
   GitHub archive of the repository. Rewriting history does not help; only
   invalidating the keys does.
3. **No forensic certainty.** See section 5.
4. **Phase 1 is deliberately breaking.** Enabling RLS with no policies is
   deny-all. Public booking and patient-facing forms will stop working until
   Phase 2 defines policies. This was an accepted trade-off.
5. **Third project unaccounted for.** Three distinct project refs appear across
   the repository. Only one was reachable during Step 0. The others must be
   inventoried before this report can be closed.
6. **`service_role` usage in application code** has not yet been audited for
   whether each use genuinely requires RLS bypass. Phase 2 covers this.

## 8. Notification assessment (nFADP)

_PENDING — requires sections 4 and 5._

Trigger for FDPIC notification: a breach likely to result in a high risk to
the data subjects. Factors to weigh: health data is special-category; the
exposure window was ~203 days; credentials granted unrestricted read/write;
and access cannot be ruled out. **Legal advice should be sought rather than
relying on this document.** Preserve all available logs before they age out.

## 9. References

- `reports/CRITICAL-leaked-service-role-keys.md` — credential leak detail
- `reports/<ref>/findings.md` — per-project Step 0 findings
- `reports/<ref>/exposure.md` — per-project exposure window
- `reports/<ref>/phase1_verification.md` — proof `anon` is locked out
- `docs/security/pre-production-checklist.md` — recurrence prevention
- `scripts/security/README.md` — runbook
