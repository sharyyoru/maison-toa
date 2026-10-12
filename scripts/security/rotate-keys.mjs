#!/usr/bin/env node
/**
 * Credential cutover for the leaked `service_role` / `anon` keys.
 *
 * There is no "rotate the JWT secret" endpoint. The supported path is:
 *   1. --status          inspect what exists today
 *   2. --mint            create new publishable + secret API keys
 *   3. (you) update Vercel / Railway / .env.local with the new values
 *   4. --disable-legacy  switch off the JWT-based anon + service_role keys,
 *                        which immediately invalidates every leaked key
 *
 * Step 4 is destructive to any client still using an old key, so it requires
 * --confirm and prints the blast radius first.
 *
 * New key VALUES are written to a gitignored file outside the repo. They are
 * never printed to the terminal and never enter a transcript.
 *
 * Usage:
 *   node scripts/security/rotate-keys.mjs --status
 *   node scripts/security/rotate-keys.mjs --mint [--refs a,b]
 *   node scripts/security/rotate-keys.mjs --disable-legacy --confirm [--refs a,b]
 *   node scripts/security/rotate-keys.mjs --reenable-legacy --confirm   # rollback
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, redact } from './lib/env.mjs';
import { listProjects, apiKeys, legacyKeysEnabled, setLegacyKeysEnabled, api } from './lib/mgmt.mjs';

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];

const OUT_DIR = env.BACKUP_DIR || path.join(process.env.USERPROFILE || process.env.HOME, '.secure-backups');

async function scope() {
  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  return wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;
}

async function status(projects) {
  for (const p of projects) {
    console.log(`\n== ${p.name} (${p.id}) ==`);
    const legacy = await legacyKeysEnabled(p.id);
    console.log(`  legacy JWT keys (anon/service_role): ${legacy.removed ? 'endpoint gone (already migrated)' : legacy.enabled ? 'ENABLED — leaked keys still work' : 'disabled'}`);
    const keys = await apiKeys(p.id);
    for (const k of keys) {
      console.log(`  key: name=${k.name ?? '-'} type=${k.type ?? '-'} id=${k.id ?? '-'}`);
    }
  }
}

async function mint(projects) {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(OUT_DIR, `new-api-keys_${stamp}.env`);
  const lines = [
    '# New Supabase API keys minted by scripts/security/rotate-keys.mjs',
    '# Copy these into Vercel / Railway / .env.local, then run --disable-legacy.',
    '# TREAT AS SECRET. Delete this file once the values are in your secret stores.',
    '',
  ];

  for (const p of projects) {
    console.log(`\n== ${p.name} (${p.id}) ==`);
    lines.push(`# --- ${p.name} (${p.id}) ---`);

    for (const [type, name] of [['publishable', 'default'], ['secret', 'default']]) {
      const { status: st, body } = await api('POST', `/v1/projects/${p.id}/api-keys`, {
        query: { reveal: true },
        body: { type, name, description: 'minted during security remediation' },
      });
      if (st < 200 || st >= 300) {
        console.warn(`  ! could not mint ${type} key: ${st} ${redact(JSON.stringify(body)).slice(0, 200)}`);
        lines.push(`# ${type}: FAILED (${st})`);
        continue;
      }
      console.log(`  minted ${type} key (value written to file, not shown)`);
      const varName = type === 'publishable' ? 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY' : 'SUPABASE_SECRET_KEY';
      lines.push(`${varName}_${p.id}=${body.api_key}`);
    }
    lines.push('');
  }

  fs.writeFileSync(outFile, lines.join('\n'), { mode: 0o600 });
  console.log(`\nNew key values: ${outFile}`);
  console.log('That file is outside the repo and mode 0600. Move the values into your');
  console.log('secret stores, redeploy, then run --disable-legacy --confirm.\n');
}

async function setLegacy(projects, enabled) {
  if (!has('--confirm')) {
    console.log('\nThis changes live authentication for every client.\n');
    if (!enabled) {
      console.log('Disabling legacy JWT keys will:');
      console.log('  - immediately invalidate the LEAKED anon + service_role keys (the point)');
      console.log('  - break any deployment, script, or integration still using them');
      console.log('  - include the WhatsApp server, cron jobs, and the Medidata proxy if not updated');
    } else {
      console.log('Re-enabling legacy JWT keys restores the OLD LEAKED KEYS to working order.');
      console.log('Only do this as an emergency rollback.');
    }
    console.log(`\nProjects: ${projects.map((p) => p.id).join(', ')}`);
    console.log('\nRe-run with --confirm to proceed.\n');
    return;
  }

  for (const p of projects) {
    try {
      await setLegacyKeysEnabled(p.id, enabled);
      console.log(`  ${p.id}: legacy keys ${enabled ? 're-enabled' : 'DISABLED'}`);
    } catch (e) {
      console.error(`  ! ${p.id}: ${redact(e.message).slice(0, 300)}`);
    }
  }
  if (!enabled) {
    console.log('\nLeaked keys are now dead. Verify the app still works, then run');
    console.log('node scripts/security/verify-anon.mjs to re-baseline.\n');
  }
}

async function main() {
  const projects = await scope();
  if (!projects.length) { console.error('No projects in scope.'); process.exit(1); }

  if (has('--status')) return status(projects);
  if (has('--mint')) return mint(projects);
  if (has('--disable-legacy')) return setLegacy(projects, false);
  if (has('--reenable-legacy')) return setLegacy(projects, true);

  console.log('Pick one: --status | --mint | --disable-legacy | --reenable-legacy');
  process.exit(2);
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
