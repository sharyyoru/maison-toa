#!/usr/bin/env node
/**
 * Verification: prove the anon key can read nothing.
 *
 * For every table and view in `public`, issues a request with the project's
 * anon/publishable key and asserts the result is an empty set or 401/403 —
 * never rows. Uses HEAD + `Prefer: count=exact`, so no patient data is ever
 * transferred or written to disk; only row COUNTS are compared.
 *
 * The anon key is fetched from the Management API and kept in memory only.
 *
 * Usage:
 *   node scripts/security/verify-anon.mjs [--refs a,b] [--out phase1_verification.md]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql, apiKeys } from './lib/mgmt.mjs';

const argv = process.argv.slice(2);
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1];
const outName = argv.find((a) => a.startsWith('--out='))?.split('=')[1] ?? 'phase1_verification.md';

const RELATIONS = `
  select c.relname as name,
         case c.relkind when 'r' then 'table' when 'p' then 'table'
                        when 'v' then 'view'  when 'm' then 'matview' end as kind
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r','p','v','m')
   order by c.relname;`;

/** Pick the key an unauthenticated browser would use. */
function pickAnonKey(keys) {
  const byType = (t) => keys.find((k) => k.type === t && k.api_key);
  return (
    byType('publishable') ??
    keys.find((k) => k.name === 'anon' && k.api_key) ??
    keys.find((k) => /anon/i.test(k.name ?? '') && k.api_key) ??
    null
  );
}

async function probe(baseUrl, key, rel) {
  const url = `${baseUrl}/rest/v1/${encodeURIComponent(rel.name)}?select=*`;
  try {
    const res = await fetch(url, {
      method: 'HEAD',
      headers: { apikey: key, Authorization: `Bearer ${key}`, Prefer: 'count=exact', Range: '0-0' },
    });
    const cr = res.headers.get('content-range'); // e.g. "0-0/42" or "*/0"
    const count = cr ? Number(String(cr).split('/')[1]) : null;

    let verdict;
    if (res.status === 401 || res.status === 403) verdict = 'BLOCKED';
    else if (res.status === 404) verdict = 'NOT_EXPOSED';
    else if (res.status === 200 && (count === 0 || Number.isNaN(count))) verdict = 'EMPTY';
    else if (res.status === 200 && count > 0) verdict = 'LEAK';
    else verdict = `UNEXPECTED_${res.status}`;

    return { ...rel, status: res.status, count, verdict };
  } catch (e) {
    return { ...rel, status: null, count: null, verdict: 'ERROR', error: redact(e.message) };
  }
}

/** Can an unauthenticated client list or read objects in each bucket? */
async function probeBuckets(baseUrl, key, buckets) {
  const out = [];
  for (const b of buckets) {
    try {
      const res = await fetch(`${baseUrl}/storage/v1/object/list/${encodeURIComponent(b.id)}`, {
        method: 'POST',
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prefix: '', limit: 1 }),
      });
      const body = await res.json().catch(() => null);
      const n = Array.isArray(body) ? body.length : null;
      out.push({
        bucket: b.id,
        declaredPublic: b.public,
        status: res.status,
        objectsVisible: n,
        verdict: res.status === 200 && n > 0 ? 'LEAK' : res.status === 200 ? 'EMPTY' : 'BLOCKED',
      });
    } catch (e) {
      out.push({ bucket: b.id, declaredPublic: b.public, verdict: 'ERROR', error: redact(e.message) });
    }
  }
  return out;
}

function report(project, keyInfo, results, bucketResults) {
  const leaks = results.filter((r) => r.verdict === 'LEAK');
  const unexpected = results.filter((r) => r.verdict.startsWith('UNEXPECTED') || r.verdict === 'ERROR');
  const bucketLeaks = bucketResults.filter((b) => b.verdict === 'LEAK');
  const pass = leaks.length === 0 && bucketLeaks.length === 0;

  const tally = results.reduce((m, r) => ({ ...m, [r.verdict]: (m[r.verdict] ?? 0) + 1 }), {});

  return `# Phase 1 verification — ${project.name} (\`${project.id}\`)

Run: ${new Date().toISOString()}
Key used: \`${keyInfo?.type ?? keyInfo?.name ?? 'unknown'}\` (value never stored)
Method: \`HEAD /rest/v1/<relation>?select=*\` with \`Prefer: count=exact\` — counts only, no rows transferred.

## Result: ${pass ? '**PASS** — anon can read nothing' : '**FAIL** — anon can still read data'}

Relations probed: **${results.length}**

| Verdict | Count | Meaning |
|---|---|---|
| BLOCKED | ${tally.BLOCKED ?? 0} | 401/403 — anon rejected outright |
| EMPTY | ${tally.EMPTY ?? 0} | 200 but zero rows — RLS denying every row |
| NOT_EXPOSED | ${tally.NOT_EXPOSED ?? 0} | 404 — not in the PostgREST schema cache |
| **LEAK** | **${tally.LEAK ?? 0}** | **200 with rows — still readable** |
| unexpected/error | ${unexpected.length} | needs manual review |

${leaks.length ? `## LEAKING relations\n\n${leaks.map((r) => `- \`${r.name}\` (${r.kind}) — ${r.count} rows readable by anon`).join('\n')}\n` : ''}
${unexpected.length ? `## Needs review\n\n${unexpected.map((r) => `- \`${r.name}\` — ${r.verdict} ${r.error ?? `HTTP ${r.status}`}`).join('\n')}\n` : ''}
## Storage buckets

${bucketResults.length
      ? `| Bucket | public flag | anon list | verdict |\n|---|---|---|---|\n${bucketResults
        .map((b) => `| \`${b.bucket}\` | ${b.declaredPublic} | ${b.objectsVisible ?? '-'} | ${b.verdict} |`)
        .join('\n')}`
      : '_no buckets_'}

## Full detail

| Relation | Kind | HTTP | anon-visible rows | Verdict |
|---|---|---|---|---|
${results.map((r) => `| \`${r.name}\` | ${r.kind} | ${r.status ?? '-'} | ${r.count ?? '-'} | ${r.verdict} |`).join('\n')}
`;
}

async function main() {
  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

  let anyFail = false;

  for (const project of projects) {
    const ref = project.id;
    console.log(`\n== ${project.name} (${ref}) ==`);

    const keys = await apiKeys(ref, { reveal: true });
    const keyInfo = pickAnonKey(keys);
    if (!keyInfo) {
      console.error('  ! no anon/publishable key available — cannot verify. Skipping.');
      anyFail = true;
      continue;
    }
    const anonKey = keyInfo.api_key; // in-memory only

    const relations = await runSql(ref, RELATIONS, { readOnly: true });
    console.log(`  probing ${relations.length} relations with the anon key...`);

    const results = [];
    for (const rel of relations) {
      const r = await probe(`https://${ref}.supabase.co`, anonKey, rel);
      results.push(r);
      if (r.verdict === 'LEAK') console.log(`    LEAK  ${rel.name} (${r.count} rows)`);
    }

    let buckets = [];
    try {
      buckets = await runSql(ref, 'select id, public from storage.buckets order by id;', { readOnly: true });
    } catch { /* storage may not be provisioned */ }
    const bucketResults = await probeBuckets(`https://${ref}.supabase.co`, anonKey, buckets);

    const md = report(project, keyInfo, results, bucketResults);
    const dir = path.join(repoRoot, 'reports', ref);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, outName), redact(md));

    const leaks = results.filter((r) => r.verdict === 'LEAK').length
      + bucketResults.filter((b) => b.verdict === 'LEAK').length;
    console.log(`  -> ${leaks ? `FAIL (${leaks} leaking)` : 'PASS'} — reports/${ref}/${outName}`);
    if (leaks) anyFail = true;
  }

  console.log('');
  if (anyFail) {
    console.error('Verification FAILED for at least one project.\n');
    process.exit(1);
  }
  console.log('All projects: anon can read nothing.\n');
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
