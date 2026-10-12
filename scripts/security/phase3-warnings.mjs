#!/usr/bin/env node
/**
 * Phase 3 — advisor warnings.
 *
 * Two halves:
 *
 *  A. Auth configuration (leaked-password protection, OTP expiry, MFA).
 *     These are often assumed to be dashboard-only; they are writable via
 *     PATCH /v1/projects/{ref}/config/auth, so `--fix-auth` applies them.
 *
 *  B. Database warnings that need a migration (mutable function
 *     search_path, extensions in public). We do NOT silently rewrite
 *     function bodies — pinning `search_path = ''` requires every object
 *     reference inside the function to be schema-qualified, and getting
 *     that wrong breaks the function at runtime. Instead we GENERATE a
 *     migration plus a per-function report so a human can qualify the
 *     bodies, and we flag which functions look risky to change.
 *
 * Usage:
 *   node scripts/security/phase3-warnings.mjs                 # audit only
 *   node scripts/security/phase3-warnings.mjs --fix-auth      # apply auth settings
 *   node scripts/security/phase3-warnings.mjs --emit-migration
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql, getAuthConfig, patchAuthConfig, advisors } from './lib/mgmt.mjs';
import { functionSearchPathMutable } from './lib/inventory.mjs';

const argv = process.argv.slice(2);
const FIX_AUTH = argv.includes('--fix-auth');
const EMIT = argv.includes('--emit-migration');
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];

/** Hardened auth baseline. Each entry explains why. */
const AUTH_BASELINE = {
  security_update_password_require_reauthentication: {
    value: true,
    why: 'Password change must require a fresh login, limiting session-hijack damage.',
  },
  password_min_length: {
    value: 12,
    why: 'Health data: 12 chars minimum.',
  },
  password_required_characters: {
    value: 'abcdefghijklmnopqrstuvwxyz:ABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789',
    why: 'Require mixed case and digits.',
  },
  security_manual_linking_enabled: {
    value: false,
    why: 'Manual identity linking enables account-takeover paths; keep off unless needed.',
  },
  mailer_otp_exp: {
    value: 3600,
    why: 'Advisor flags email OTP lifetimes over 1 hour.',
  },
  sms_otp_exp: {
    value: 600,
    why: 'Short SMS OTP lifetime.',
  },
  mfa_totp_enroll_enabled: {
    value: true,
    why: 'Clinical staff accounts should be able to enrol TOTP.',
  },
  mfa_totp_verify_enabled: {
    value: true,
    why: 'TOTP verification must be on for enrolment to be useful.',
  },
  refresh_token_rotation_enabled: {
    value: true,
    why: 'Rotate refresh tokens so a stolen token has a short useful life.',
  },
  security_refresh_token_reuse_interval: {
    value: 10,
    why: 'Narrow reuse window for rotated refresh tokens.',
  },
};

/**
 * HIBP-backed leaked-password protection. The field name has changed
 * across Supabase versions, so set whichever the project exposes.
 */
const HIBP_FIELDS = ['password_hibp_enabled', 'security_password_hibp_enabled'];

async function auditAuth(ref) {
  const cfg = await getAuthConfig(ref);
  const diffs = [];

  for (const [key, spec] of Object.entries(AUTH_BASELINE)) {
    if (!(key in cfg)) continue; // not supported on this project version
    if (cfg[key] !== spec.value) {
      diffs.push({ key, current: cfg[key], desired: spec.value, why: spec.why });
    }
  }
  for (const f of HIBP_FIELDS) {
    if (f in cfg && cfg[f] !== true) {
      diffs.push({ key: f, current: cfg[f], desired: true, why: 'Reject passwords found in known breach corpora.' });
    }
  }
  return { cfg, diffs };
}

const FN_BODIES = `
  select n.nspname as schema_name,
         p.proname  as function_name,
         pg_catalog.pg_get_function_identity_arguments(p.oid) as args,
         p.prosecdef as security_definer,
         coalesce(p.proconfig, '{}') as config,
         pg_catalog.pg_get_functiondef(p.oid) as definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prokind = 'f'
   order by p.proname;`;

/** Unqualified references inside a body are what break under search_path=''. */
function risk(def) {
  const body = String(def ?? '');
  const unqualified = [
    ...body.matchAll(/\b(from|join|update|insert\s+into|delete\s+from)\s+(?!")(\w+)\b/gi),
  ].map((m) => m[2]).filter((t) => !/^(select|lateral|unnest|generate_series|only)$/i.test(t));
  return [...new Set(unqualified)];
}

async function main() {
  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

  for (const project of projects) {
    const ref = project.id;
    console.log(`\n== ${project.name} (${ref}) ==`);

    // --- A. auth config -------------------------------------------------
    let authDiffs = [];
    try {
      const { diffs } = await auditAuth(ref);
      authDiffs = diffs;
      if (!diffs.length) console.log('  auth config: already at baseline');
      for (const d of diffs) console.log(`  auth: ${d.key}: ${JSON.stringify(d.current)} -> ${JSON.stringify(d.desired)}`);

      if (FIX_AUTH && diffs.length) {
        const patch = Object.fromEntries(diffs.map((d) => [d.key, d.desired]));
        await patchAuthConfig(ref, patch);
        console.log(`  auth: applied ${diffs.length} setting(s)`);
      } else if (diffs.length) {
        console.log('  (re-run with --fix-auth to apply)');
      }
    } catch (e) {
      console.warn(`  ! auth config: ${redact(e.message).slice(0, 200)}`);
    }

    // --- B. database warnings ------------------------------------------
    const fns = await runSql(ref, FN_BODIES, { readOnly: true });
    const mutable = fns.filter(functionSearchPathMutable);
    const exts = await runSql(ref,
      `select e.extname, n.nspname as schema_name from pg_catalog.pg_extension e
         join pg_catalog.pg_namespace n on n.oid = e.extnamespace where n.nspname = 'public';`,
      { readOnly: true });

    console.log(`  functions with mutable search_path: ${mutable.length}`);
    console.log(`  extensions in public: ${exts.map((e) => e.extname).join(', ') || 'none'}`);

    const rows = mutable.map((f) => {
      const refs = risk(f.definition);
      return {
        signature: `public.${f.function_name}(${f.args})`,
        security_definer: f.security_definer,
        unqualified_refs: refs,
        safe_to_auto_pin: refs.length === 0,
      };
    });

    const dir = path.join(repoRoot, 'reports', ref);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'phase3_warnings.json'),
      JSON.stringify({ authDiffs, functions: rows, extensionsInPublic: exts }, null, 2));

    const autoSafe = rows.filter((r) => r.safe_to_auto_pin);
    const manual = rows.filter((r) => !r.safe_to_auto_pin);

    fs.writeFileSync(path.join(dir, 'phase3_warnings.md'), redact(`# Phase 3 warnings — ${project.name} (\`${ref}\`)

## Auth settings needing change: ${authDiffs.length}

${authDiffs.length
      ? `| Setting | Current | Desired | Why |\n|---|---|---|---|\n${authDiffs
        .map((d) => `| \`${d.key}\` | ${JSON.stringify(d.current)} | ${JSON.stringify(d.desired)} | ${d.why} |`)
        .join('\n')}`
      : '_at baseline_'}

## Functions with mutable \`search_path\`: ${rows.length}

**${autoSafe.length}** reference no unqualified objects and can be pinned mechanically.
**${manual.length}** reference unqualified objects and need their bodies schema-qualified
first — pinning \`search_path = ''\` without that will break them at runtime.

${manual.length
      ? `### Needs manual qualification\n\n${manual.map((r) => `- \`${r.signature}\`${r.security_definer ? ' **[SECURITY DEFINER]**' : ''} — unqualified: ${r.unqualified_refs.map((x) => `\`${x}\``).join(', ')}`).join('\n')}`
      : ''}

${autoSafe.length
      ? `### Safe to pin automatically\n\n${autoSafe.map((r) => `- \`${r.signature}\`${r.security_definer ? ' **[SECURITY DEFINER]**' : ''}`).join('\n')}`
      : ''}

## Extensions in \`public\`: ${exts.length}

${exts.length
      ? exts.map((e) => `- \`${e.extname}\` — move to the \`extensions\` schema`).join('\n')
      : '_none_'}
`));
    console.log(`  wrote reports/${ref}/phase3_warnings.{json,md}`);

    if (EMIT && autoSafe.length) {
      const file = path.join(repoRoot, 'supabase', 'migrations',
        `20261011_security_pin_search_path_${ref}.sql`);
      fs.writeFileSync(file, `-- Phase 3: pin search_path on functions that need no body changes.
-- Generated by scripts/security/phase3-warnings.mjs for project ${ref}.
-- Functions requiring manual schema-qualification are deliberately EXCLUDED;
-- see reports/${ref}/phase3_warnings.md.

${autoSafe.map((r) => `alter function ${r.signature} set search_path = '';`).join('\n')}
`);
      console.log(`  emitted ${path.relative(repoRoot, file)}`);
    }
  }

  console.log('\nDashboard-only items, if any, are listed in each phase3_warnings.md.\n');
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
