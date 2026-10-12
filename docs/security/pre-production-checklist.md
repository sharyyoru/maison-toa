# Pre-production security checklist

Every item must be checked before a release reaches production. The automated
items are enforced by `.github/workflows/security-guardrails.yml`; the rest are
human judgement and cannot be delegated to CI.

Scope: Maison TOA handles Swiss patient health data. Health data is
*special-category* personal data under the nFADP, so the bar is higher than for
a typical SaaS app, and a breach is reportable to the FDPIC.

---

## 1. Advisors

- [ ] Supabase Security Advisor reports **zero ERROR**-level findings on every project
- [ ] Every remaining WARNING is either fixed or recorded in
      `scripts/security/allowlist.json` with a written justification and an owner
- [ ] `node scripts/security/ci-check.mjs` exits 0 for every project

## 2. Row Level Security

- [ ] RLS is **enabled** on every table in `public` (no exceptions)
- [ ] Every table has an explicit policy per operation it actually needs
      (SELECT / INSERT / UPDATE / DELETE) — RLS enabled with no policy is
      deny-all and will silently break features
- [ ] **No policy uses `USING (true)` for `authenticated` on patient data.**
      CI fails the build on this pattern
- [ ] `auth.uid()` is wrapped as `(SELECT auth.uid())` in policy expressions
      so Postgres evaluates it once per query, not once per row
- [ ] Every column referenced in a policy is indexed
- [ ] Materialized views over patient data are accounted for — they ignore RLS
      and run as their owner, so API access must be revoked instead
- [ ] `storage.objects` has policies scoped by clinic for every
      patient-document bucket
- [ ] No storage bucket has `public = true` unless it holds only
      non-personal marketing assets (allowlisted, with justification)

## 3. Tenant isolation

- [ ] The tenant model is documented in `docs/security/access-matrix.md`
- [ ] A test proves a user of clinic A cannot **read** clinic B data, for every
      table
- [ ] A test proves a user of clinic A cannot **write** clinic B data
      (INSERT, UPDATE, DELETE — a read-only test is not sufficient)
- [ ] A test proves the **anon** key retrieves zero rows from every relation
      (`node scripts/security/verify-anon.mjs`)
- [ ] Tests run against a Supabase branch or staging database, never production

## 4. Credentials

- [ ] No `service_role` or secret key anywhere in client-side code
      (`src/app/**` client components, `NEXT_PUBLIC_*` variables)
- [ ] `src/lib/supabaseAdmin.ts` is imported only from `src/app/api/**`,
      scripts, or server-only modules
- [ ] No JWT, `sbp_` token, or `sb_secret_` key in tracked files or git history
      (CI scans for this)
- [ ] No real `.env` file is tracked. Note `.gitignore` does **not** apply to
      files that are already tracked — verify with `git ls-files`
- [ ] Keys have been rotated since the last known exposure
- [ ] Legacy JWT `anon`/`service_role` keys are disabled in favour of
      publishable/secret keys

## 5. Data hygiene

- [ ] No `tmp_*`, `*_backup`, `*_old`, or ad-hoc migration tables holding
      personal data exist in `public`
- [ ] Scratch tables created during a migration are dropped in the **same**
      migration
- [ ] The `private` schema is not in the exposed API schema list
- [ ] `SECURITY DEFINER` functions are either in a non-exposed schema or have
      `EXECUTE` revoked from `anon` and `authenticated`
- [ ] Every function has `search_path` pinned, with its body fully
      schema-qualified

## 6. Process

- [ ] A **second person** has reviewed every migration that touches RLS
      policies, grants, or `storage.buckets`
- [ ] A backup exists and is younger than the change
      (`node scripts/security/backup.mjs`)
- [ ] The backup has been **test-decrypted** — a dump that has never been
      restored is not a backup
      (`node scripts/security/restore-decrypt.mjs <file> --verify-only`)
- [ ] The change was applied to staging first, with the test suite green
- [ ] The rollback path is written down before the change is applied

## 7. Auth settings

- [ ] Leaked-password protection (HIBP) enabled
- [ ] Email OTP expiry ≤ 1 hour; SMS OTP expiry ≤ 10 minutes
- [ ] MFA (TOTP) enrolment and verification enabled for staff accounts
- [ ] Refresh token rotation enabled
- [ ] Password minimum length ≥ 12 with mixed character classes
- [ ] Re-authentication required for password change

Audit and apply with `node scripts/security/phase3-warnings.mjs [--fix-auth]`.

---

## Running the checks

```bash
# Read-only: inventory, advisors, logs
node scripts/security/step0-evidence.mjs

# Invariants only (what CI runs)
node scripts/security/ci-check.mjs

# Prove anon is locked out
node scripts/security/verify-anon.mjs
```

## Why the automation is not enough

CI checks the database's current state. It cannot tell you whether a policy is
*correct* — a policy that lets every authenticated user read every patient will
pass every automated check here. Sections 2, 3, and 6 exist because only a
human can judge whether the tenant scoping actually matches the clinic model.
