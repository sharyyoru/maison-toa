#!/usr/bin/env node
/**
 * Applies a SQL migration file to every project in scope.
 *
 * Unlike phase1-apply.mjs this has no backup preflight, so it is for
 * follow-up migrations once containment is already in place. It still
 * requires --confirm.
 *
 * The Management API runs each request in a transaction, so a migration
 * either applies completely or not at all.
 *
 * Usage:
 *   node scripts/security/apply-sql.mjs <file.sql> --confirm [--refs a,b]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql } from './lib/mgmt.mjs';

const argv = process.argv.slice(2);
const file = argv.find((a) => !a.startsWith('--'));
const CONFIRM = argv.includes('--confirm');
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];

if (!file) {
  console.error('usage: apply-sql.mjs <file.sql> --confirm [--refs a,b]');
  process.exit(2);
}

const full = path.isAbsolute(file) ? file : path.join(repoRoot, file);
if (!fs.existsSync(full)) {
  console.error(`Not found: ${full}`);
  process.exit(1);
}
const sql = fs.readFileSync(full, 'utf8');

const all = await listProjects();
const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

console.log(`\n${path.relative(repoRoot, full)} -> ${projects.map((p) => p.id).join(', ')}`);

if (!CONFIRM) {
  console.log(`\n${sql.split('\n').length} lines. Re-run with --confirm to apply.\n`);
  process.exit(0);
}

let failed = 0;
for (const p of projects) {
  try {
    await runSql(p.id, sql);
    console.log(`  ${p.id}: applied OK`);
  } catch (e) {
    console.error(`  ${p.id}: FAILED — ${redact(e.message).slice(0, 400)}`);
    failed++;
  }
}
console.log('');
process.exit(failed ? 1 : 0);
