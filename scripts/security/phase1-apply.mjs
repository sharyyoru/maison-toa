#!/usr/bin/env node
/**
 * Phase 1 — applies the containment migration to every project in scope.
 *
 * Refuses to run unless:
 *   - Step 0 evidence exists for the project (reports/<ref>/inventory.json)
 *   - a backup manifest younger than 24h exists with a recovery path
 *   - --confirm is passed
 *
 * Usage:
 *   node scripts/security/phase1-apply.mjs --confirm [--refs a,b] [--dry-run]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql } from './lib/mgmt.mjs';

const argv = process.argv.slice(2);
const CONFIRM = argv.includes('--confirm');
const DRY = argv.includes('--dry-run');
// Managed daily backups are a weaker recovery path than a pg_dump: restoring
// one can lose up to 24h of data. Accepting that must be a deliberate, logged
// choice, never a silent fallback.
const ACCEPT_MANAGED = argv.includes('--accept-managed-backup');
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];

const MIGRATION = path.join(repoRoot, 'supabase', 'migrations', '20261011_security_containment.sql');
const BACKUP_DIR = env.BACKUP_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.secure-backups');

function latestManifest() {
  if (!fs.existsSync(BACKUP_DIR)) return null;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => /^manifest_.*\.json$/.test(f));
  if (!files.length) return null;
  const newest = files.map((f) => ({ f, t: fs.statSync(path.join(BACKUP_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t)[0];
  return { ...newest, data: JSON.parse(fs.readFileSync(path.join(BACKUP_DIR, newest.f), 'utf8')) };
}

function preflight(ref, manifest) {
  const problems = [];

  if (!fs.existsSync(path.join(repoRoot, 'reports', ref, 'inventory.json'))) {
    problems.push('no Step 0 evidence — run step0-evidence.mjs first');
  }

  if (!manifest) {
    problems.push(`no backup manifest in ${BACKUP_DIR} — run backup.mjs first`);
  } else {
    const ageH = (Date.now() - manifest.t) / 3600000;
    if (ageH > 24) problems.push(`newest backup manifest is ${ageH.toFixed(1)}h old — re-run backup.mjs`);
    const entry = manifest.data.find((m) => m.ref === ref);
    if (!entry) {
      problems.push(`backup manifest has no entry for ${ref}`);
    } else if (!entry.dump && !entry.restorePoint) {
      const managed = entry.managedBackups?.count ?? 0;
      if (managed > 0 && ACCEPT_MANAGED) {
        console.log(`      note: relying on ${managed} managed daily backup(s) for ${ref} ` +
          `(newest ${entry.managedBackups.newest ?? 'unknown'}); restoring may lose up to 24h of data`);
      } else if (managed > 0) {
        problems.push(`only managed daily backups exist for ${ref} (no pg_dump, no restore point) — ` +
          `pass --accept-managed-backup to proceed on that basis`);
      } else {
        problems.push(`no recovery path of any kind recorded for ${ref}`);
      }
    }
  }

  return problems;
}

async function main() {
  if (!fs.existsSync(MIGRATION)) {
    console.error(`Migration not found: ${MIGRATION}`);
    process.exit(1);
  }
  const sql = fs.readFileSync(MIGRATION, 'utf8');

  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

  const manifest = latestManifest();
  console.log(`\nPhase 1 containment — ${projects.length} project(s)`);
  console.log(`Migration: ${path.relative(repoRoot, MIGRATION)}`);
  console.log(`Backup manifest: ${manifest ? manifest.f : 'NONE'}\n`);

  let blocked = false;
  for (const p of projects) {
    const problems = preflight(p.id, manifest);
    console.log(`  ${p.id} (${p.name}): ${problems.length ? 'BLOCKED' : 'ready'}`);
    for (const x of problems) console.log(`      - ${x}`);
    if (problems.length) blocked = true;
  }

  if (blocked) {
    console.error('\nPreflight failed. Nothing applied.\n');
    process.exit(1);
  }

  if (!CONFIRM || DRY) {
    console.log('\nPreflight passed. Re-run with --confirm to apply.');
    console.log('Reminder: this revokes all anon access and enables deny-all RLS.');
    console.log('Public/unauthenticated app features WILL break until Phase 2.\n');
    return;
  }

  const results = [];
  for (const p of projects) {
    console.log(`\n== applying to ${p.name} (${p.id}) ==`);
    try {
      const out = await runSql(p.id, sql);
      console.log('  applied OK');
      results.push({ ref: p.id, ok: true, notices: out });
    } catch (e) {
      console.error(`  ! FAILED: ${redact(e.message).slice(0, 400)}`);
      results.push({ ref: p.id, ok: false, error: redact(e.message) });
    }
  }

  const outPath = path.join(repoRoot, 'reports', 'phase1_apply_results.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ at: new Date().toISOString(), results }, null, 2));
  console.log(`\nResults: reports/phase1_apply_results.json`);

  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    console.error(`\n${failed.length} project(s) failed. Investigate before continuing.\n`);
    process.exit(1);
  }
  console.log('\nNow run: node scripts/security/verify-anon.mjs\n');
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
