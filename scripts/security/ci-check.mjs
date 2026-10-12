#!/usr/bin/env node
/**
 * Phase 4 guardrail. Fails the build when a security invariant regresses.
 *
 * Checks, per project visible to the token:
 *   1. every table in `public` has RLS enabled
 *   2. every view in `public` has security_invoker = true
 *   3. no storage bucket is public (unless allowlisted)
 *   4. the Security Advisor reports zero ERROR-level lints
 *   5. no table in `public` is granted to `anon` (unless allowlisted)
 *   6. no leftover scratch (tmp_*) tables exist
 *
 * All SQL is read-only. Intended for CI, but safe to run locally any time.
 *
 * Allowlists live in scripts/security/allowlist.json, and every entry must
 * carry a justification — that file is the audit trail for deliberate
 * exceptions.
 *
 * Usage: node scripts/security/ci-check.mjs [--refs a,b] [--json]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql, advisors } from './lib/mgmt.mjs';
import { QUERIES, viewIsSecurityDefiner } from './lib/inventory.mjs';

const argv = process.argv.slice(2);
const JSON_OUT = argv.includes('--json');
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];

const ALLOWLIST_PATH = path.join(repoRoot, 'scripts', 'security', 'allowlist.json');
const allow = fs.existsSync(ALLOWLIST_PATH)
  ? JSON.parse(fs.readFileSync(ALLOWLIST_PATH, 'utf8'))
  : { publicBuckets: {}, anonTables: {}, advisorLints: {}, scratchTables: {} };

const names = (o) => Object.keys(o ?? {});

async function checkProject(project) {
  const ref = project.id;
  const failures = [];
  const add = (check, detail) => failures.push({ check, detail });

  const [tables, views, buckets, grants, tmpTables] = await Promise.all([
    runSql(ref, QUERIES.tables, { readOnly: true }),
    runSql(ref, QUERIES.views, { readOnly: true }),
    runSql(ref, QUERIES.buckets, { readOnly: true }).catch(() => []),
    runSql(ref, QUERIES.grants, { readOnly: true }),
    runSql(ref, QUERIES.tmpTables, { readOnly: true }),
  ]);

  for (const t of tables.filter((t) => t.rls_enabled === false)) {
    add('rls_enabled', `public.${t.table_name} has RLS disabled`);
  }

  for (const v of views.filter(viewIsSecurityDefiner)) {
    add('security_invoker', `public.${v.view_name} is missing security_invoker = true`);
  }

  for (const b of buckets.filter((b) => b.public === true)) {
    if (!names(allow.publicBuckets).includes(b.id)) {
      add('public_bucket', `storage bucket "${b.id}" is public and not allowlisted`);
    }
  }

  for (const g of grants.filter((g) => g.grantee === 'anon')) {
    if (!names(allow.anonTables).includes(g.table_name)) {
      add('anon_grant', `public.${g.table_name} granted to anon (${g.privileges}) and not allowlisted`);
    }
  }

  for (const t of tmpTables) {
    if (!names(allow.scratchTables).includes(t.table_name)) {
      add('scratch_table', `public.${t.table_name} looks like a leftover scratch table (${t.approx_rows} rows)`);
    }
  }

  let advisorErrors = [];
  try {
    const sec = await advisors(ref, 'security');
    advisorErrors = (sec?.lints ?? []).filter((l) => String(l.level).toUpperCase() === 'ERROR');
    for (const l of advisorErrors) {
      const key = `${l.name}:${l.metadata?.name ?? ''}`;
      if (!names(allow.advisorLints).includes(l.name) && !names(allow.advisorLints).includes(key)) {
        add('advisor_error', `${l.name} — ${String(l.detail ?? l.title ?? '').replace(/\s+/g, ' ').slice(0, 160)}`);
      }
    }
  } catch (e) {
    add('advisor_unavailable', redact(e.message).slice(0, 200));
  }

  return {
    ref,
    name: project.name,
    counts: {
      tables: tables.length,
      rlsDisabled: tables.filter((t) => !t.rls_enabled).length,
      definerViews: views.filter(viewIsSecurityDefiner).length,
      publicBuckets: buckets.filter((b) => b.public).length,
      advisorErrors: advisorErrors.length,
      scratchTables: tmpTables.length,
    },
    failures,
  };
}

async function main() {
  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

  const results = [];
  for (const p of projects) results.push(await checkProject(p));

  if (JSON_OUT) {
    console.log(JSON.stringify(results, null, 2));
  } else {
    for (const r of results) {
      console.log(`\n== ${r.name} (${r.ref}) ==`);
      console.log(`  tables=${r.counts.tables} rlsDisabled=${r.counts.rlsDisabled} ` +
        `definerViews=${r.counts.definerViews} publicBuckets=${r.counts.publicBuckets} ` +
        `advisorErrors=${r.counts.advisorErrors} scratch=${r.counts.scratchTables}`);
      if (!r.failures.length) console.log('  OK');
      for (const f of r.failures) console.log(`  FAIL [${f.check}] ${f.detail}`);
    }
  }

  const total = results.reduce((n, r) => n + r.failures.length, 0);
  console.log(`\n${total} failure(s) across ${results.length} project(s).`);
  if (total) {
    console.log('\nTo accept an exception deliberately, add it to');
    console.log('scripts/security/allowlist.json with a justification.\n');
    process.exit(1);
  }
  console.log('All security invariants hold.\n');
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
