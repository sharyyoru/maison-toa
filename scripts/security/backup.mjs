#!/usr/bin/env node
/**
 * Pre-change backup. Run this before ANY phase that mutates a database.
 *
 * Two independent safety nets per project:
 *   1. A native Supabase restore point (always, needs only the API token).
 *   2. A full `pg_dump` (schema + data), gzipped and AES-256-GCM encrypted,
 *      written OUTSIDE the repository — only if a DB URL is configured.
 *
 * Usage:
 *   node scripts/security/backup.mjs [--refs a,b] [--restore-point-only]
 *
 * Requires for the pg_dump path:
 *   SUPABASE_DB_URL_<ref>   session-pooler URI (port 5432, NOT 6543)
 *   BACKUP_PASSPHRASE       used to derive the AES key (scrypt)
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { env, dbUrlFor, redact, optional } from './lib/env.mjs';
import { listProjects, createRestorePoint, listBackups } from './lib/mgmt.mjs';
import { encryptStreamToFile } from './lib/crypt.mjs';

const argv = process.argv.slice(2);
const RP_ONLY = argv.includes('--restore-point-only');
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];

const BACKUP_DIR = env.BACKUP_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.secure-backups');
const PG_BIN = env.PG_BIN || path.join(process.env.USERPROFILE || process.env.HOME, '.pgtools', 'pgsql', 'bin');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');

function pgDumpPath() {
  const exe = process.platform === 'win32' ? 'pg_dump.exe' : 'pg_dump';
  const local = path.join(PG_BIN, exe);
  return fs.existsSync(local) ? local : exe; // fall back to PATH
}

/**
 * Streams pg_dump -> gzip -> AES-256-GCM -> file (see lib/crypt.mjs for the
 * container format). Nothing is buffered, so dump size is not bounded by RAM.
 */
async function encryptedDump(ref, dbUrl, passphrase) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const outFile = path.join(BACKUP_DIR, `${ref}_${stamp}.sql.gz.enc`);

  const child = spawn(pgDumpPath(), [
    dbUrl,
    '--no-owner',
    '--no-privileges',
    '--quote-all-identifiers',
    // Platform-managed schemas cannot be restored and bloat the dump.
    '--exclude-schema=pgsodium',
    '--exclude-schema=vault',
    '--exclude-schema=_analytics',
    '--exclude-schema=_realtime',
    '--exclude-schema=supabase_functions',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += d.toString(); });

  const { size, sha256 } = await encryptStreamToFile(child.stdout, outFile, passphrase);

  const code = await new Promise((res) => child.on('close', res));
  if (code !== 0) {
    // A partial artifact is worse than none — it looks like a backup.
    fs.rmSync(outFile, { force: true });
    throw new Error(`pg_dump exited ${code}: ${redact(stderr).slice(0, 500)}`);
  }

  return { outFile, size, sha256, stderr: redact(stderr) };
}

async function main() {
  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

  if (!projects.length) {
    console.error('No projects in scope.');
    process.exit(1);
  }

  const passphrase = optional('BACKUP_PASSPHRASE');
  const manifest = [];

  for (const p of projects) {
    const ref = p.id;
    console.log(`\n== ${p.name} (${ref}) ==`);

    const entry = { ref, name: p.name, at: new Date().toISOString() };

    // 1. Restore point — cheap, native, always.
    try {
      // The API caps restore point names at 20 characters.
      const d = new Date();
      const p2 = (n) => String(n).padStart(2, '0');
      const name = `presec_${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}`
        + `_${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}`;
      await createRestorePoint(ref, name);
      entry.restorePoint = name;
      console.log(`  restore point created: ${name}`);
    } catch (e) {
      entry.restorePointError = redact(e.message);
      console.warn(`  ! restore point failed: ${redact(e.message).slice(0, 200)}`);
      console.warn('    (needs a paid plan with PITR; the pg_dump below is then your only backup)');
    }

    try {
      const b = await listBackups(ref);
      // The API returns backups newest-first; sort explicitly rather than
      // assuming an order (taking .at(-1) reported the OLDEST as newest).
      const times = (b?.backups ?? []).map((x) => x.inserted_at).filter(Boolean).sort();
      const newest = times.at(-1) ?? null;
      entry.managedBackups = {
        pitrEnabled: b?.pitr_enabled ?? null,
        count: times.length,
        oldest: times[0] ?? null,
        newest,
        newestAgeHours: newest ? +((Date.now() - new Date(newest).getTime()) / 3600000).toFixed(1) : null,
      };
      console.log(`  managed backups: ${entry.managedBackups.count}, PITR=${entry.managedBackups.pitrEnabled}` +
        `, newest ${entry.managedBackups.newestAgeHours}h old`);
    } catch (e) {
      console.warn(`  ! backup listing failed: ${redact(e.message).slice(0, 160)}`);
    }

    // 2. Own encrypted dump.
    const dbUrl = dbUrlFor(ref);
    if (RP_ONLY) {
      console.log('  pg_dump skipped (--restore-point-only)');
    } else if (!dbUrl) {
      entry.dumpSkipped = `no SUPABASE_DB_URL_${ref}`;
      console.warn(`  ! no SUPABASE_DB_URL_${ref} — skipping pg_dump (no off-site artifact for this project)`);
    } else if (!passphrase) {
      entry.dumpSkipped = 'no BACKUP_PASSPHRASE';
      console.warn('  ! BACKUP_PASSPHRASE not set — refusing to write an unencrypted dump');
    } else {
      if (/:6543\//.test(dbUrl)) {
        console.warn('  ! that URL uses port 6543 (transaction pooler); pg_dump needs 5432 (session). Trying anyway.');
      }
      console.log('  pg_dump (schema + data) -> gzip -> AES-256-GCM ...');
      try {
        const r = await encryptedDump(ref, dbUrl, passphrase);
        entry.dump = { file: r.outFile, bytes: r.size, sha256: r.sha256 };
        console.log(`  wrote ${r.outFile} (${(r.size / 1048576).toFixed(1)} MiB)`);
        console.log(`  sha256 ${r.sha256}`);
      } catch (e) {
        entry.dumpError = redact(e.message);
        console.error(`  ! pg_dump FAILED: ${redact(e.message).slice(0, 400)}`);
      }
    }

    manifest.push(entry);
  }

  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const mf = path.join(BACKUP_DIR, `manifest_${stamp}.json`);
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));
  console.log(`\nManifest: ${mf}`);

  const none = manifest.filter((m) => !m.dump && !m.restorePoint && !(m.managedBackups?.count > 0));
  if (none.length) {
    console.error(`\n${none.map((m) => m.ref).join(', ')} has NO backup of any kind. Do not proceed to Phase 1.`);
    process.exit(1);
  }

  const weak = manifest.filter((m) => !m.dump && !m.restorePoint);
  if (weak.length) {
    console.warn('\nWEAK recovery path — managed daily backups only, no off-site artifact:');
    for (const m of weak) {
      console.warn(`  ${m.ref}: newest backup ${m.managedBackups.newestAgeHours}h old ` +
        `(restoring loses everything since then)`);
    }
    console.warn('Pass --accept-managed-backup to phase1-apply.mjs to proceed on that basis.');
  }
  console.log('\nEvery project has at least one recovery path.\n');
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
