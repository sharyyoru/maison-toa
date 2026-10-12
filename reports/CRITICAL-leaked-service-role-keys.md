# CRITICAL — Live `service_role` keys committed to a PUBLIC repository

Status: **confirmed, unremediated**. Discovered during Step 0 of the security remediation.
No key values are reproduced in this file. Locations are given as `file:line`.

## Summary

`github.com/sharyyoru/maison-toa` is a **public** repository (827 commits, 0 forks at time of
writing). It contains hardcoded Supabase **`service_role`** JWTs in four tracked files, for
**two different Supabase projects**.

`service_role` bypasses Row Level Security entirely. While these keys are valid and public,
every other item in this remediation plan — enabling RLS, `security_invoker` views, revoking
`anon` — provides **no protection whatsoever** against anyone holding them.

## Locations (tracked in `HEAD` on `main`)

| File | Line | Key type | Project ref |
|---|---|---|---|
| `.env.example` | 3 | `anon` | ref A |
| `.env.example` | 6 | **`service_role`** | ref A |
| `push-schema.js` | 6 | **`service_role`** (inline literal) | ref A |
| `scripts/test-booking-deposit-flow.mjs` | 25 | **`service_role`** (inline literal) | ref A |
| `scripts/run-payrexx-migration.ts` | 9 | **`service_role`** (inline fallback) | ref B |

Because these are present in `HEAD`, they are in the full git history and in any clone, fork,
cache, or GitHub-hosted archive. Rewriting history does **not** make them safe — rotation is the
only remedy.

## Validity window

Decoded JWT claims (no signatures reproduced):

- Ref A keys: `iat` ≈ 2026-03-20, `exp` ≈ 2036 → **~10-year lifetime, currently valid**
- Ref B key: `iat` ≈ 2025-12-09, `exp` ≈ 2035 → **~10-year lifetime, currently valid**

## Exposure window

First commit of each file (`git log --follow`, earliest commit):

| File | Introduced | Days public (as of 2026-10-09) |
|---|---|---|
| `.env.example` | 2026-03-20 (`8ab6ab5`) | ~203 |
| `scripts/run-payrexx-migration.ts` | 2026-03-20 (`f70a333`) | ~203 |
| `push-schema.js` | 2026-03-21 (`f9790b6`) | ~202 |
| `scripts/test-booking-deposit-flow.mjs` | 2026-07-14 (`2ff235e`) | ~87 |

**Minimum exposure window: ~203 days of public availability of full-database credentials.**

## Why `.env.example` is tracked despite `.gitignore`

`.gitignore:38` contains `.env*`, which would match `.env.example`. It has no effect because the
file was already tracked when the rule was added — `.gitignore` is only consulted for untracked
files. The ignore rule gives a false sense of safety here.

## Recommended sequence (pending owner approval)

1. **Rotate the `service_role` and `anon` keys on both projects** (dashboard → API keys → the
   legacy JWT secret, or migrate to publishable/secret keys). This invalidates the leaked keys.
   *Requires approval — will break every deployment until new keys are set in Vercel/Railway.*
2. Replace all inline literals with `process.env.*` reads and make the scripts fail loudly if the
   variable is absent (no fallback literals).
3. Reduce `.env.example` to placeholder values only; `git rm --cached` is not sufficient on its own.
4. Review Supabase logs for `service_role` requests from unexpected IPs across the whole retention
   window — a `service_role` request is indistinguishable from legitimate backend traffic except by
   origin, so this is the only available indicator of compromise.
5. Enable GitHub secret scanning + push protection, and consider making the repository private.

## Note on nFADP

If the logs show third-party access to patient data, this is likely a reportable breach to the
FDPIC under the Swiss nFADP. Preserve logs before they age out of the retention window.
