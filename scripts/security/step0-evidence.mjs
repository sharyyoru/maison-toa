#!/usr/bin/env node
/**
 * Step 0 — evidence gathering. READ ONLY.
 *
 * All SQL runs through the read-only Management API endpoint, so this script
 * physically cannot modify any database. Produces, per project:
 *
 *   reports/<ref>/advisor_before.json      security + performance advisors
 *   reports/<ref>/inventory.json           RLS / views / buckets / grants / functions
 *   reports/<ref>/access_logs.json         raw /rest/v1/ log rows (gitignored)
 *   reports/<ref>/access_logs_summary.md   counts, IPs, dates, tables, methods
 *   reports/<ref>/exposure.md             exposure window
 *   reports/<ref>/findings.md             human-readable summary
 *
 * Usage:
 *   node scripts/security/step0-evidence.mjs [--after] [--refs a,b] [--skip-logs]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql, advisors } from './lib/mgmt.mjs';
import { QUERIES, viewIsSecurityDefiner, functionSearchPathMutable, sensitiveColumns } from './lib/inventory.mjs';
import { exportRestLogs, summarise } from './lib/logs.mjs';

const argv = process.argv.slice(2);
const AFTER = argv.includes('--after');
const SKIP_LOGS = argv.includes('--skip-logs');
const refArg = argv.find((a) => a.startsWith('--refs='))?.split('=')[1]
  ?? (argv.includes('--refs') ? argv[argv.indexOf('--refs') + 1] : null);

const OUT = path.join(repoRoot, 'reports');

function writeOut(ref, file, content) {
  const dir = path.join(OUT, ref);
  fs.mkdirSync(dir, { recursive: true });
  const body = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
  fs.writeFileSync(path.join(dir, file), redact(body));
  console.log(`    wrote reports/${ref}/${file}`);
}

async function selectProjects() {
  const all = await listProjects();
  const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  const chosen = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

  const missing = wanted.filter((w) => !all.some((p) => p.id === w));
  if (missing.length) console.warn(`  ! not visible to this token: ${missing.join(', ')}`);
  return chosen;
}

async function gatherInventory(ref) {
  const inv = {};
  for (const [name, sql] of Object.entries(QUERIES)) {
    try {
      inv[name] = await runSql(ref, sql, { readOnly: true });
    } catch (e) {
      inv[name] = { error: redact(e.message) };
      console.warn(`    ! ${name}: ${redact(e.message).slice(0, 160)}`);
    }
  }
  return inv;
}

/** Exact row counts for scratch tables (Phase 1b needs real numbers). */
async function exactTmpCounts(ref, tmpTables) {
  const names = (tmpTables ?? []).map((t) => t.table_name).filter(Boolean);
  if (!names.length) return {};
  const union = names
    .map((n) => `select ${quote(n)} as table_name, count(*) as exact_rows from public.${ident(n)}`)
    .join(' union all ');
  try {
    const rows = await runSql(ref, union, { readOnly: true });
    return Object.fromEntries(rows.map((r) => [r.table_name, Number(r.exact_rows)]));
  } catch (e) {
    console.warn(`    ! exact tmp counts failed: ${redact(e.message).slice(0, 160)}`);
    return {};
  }
}

const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

function analyse(inv, tmpCounts) {
  const tables = Array.isArray(inv.tables) ? inv.tables : [];
  const views = Array.isArray(inv.views) ? inv.views : [];
  const buckets = Array.isArray(inv.buckets) ? inv.buckets : [];
  const functions = Array.isArray(inv.functions) ? inv.functions : [];
  const extensions = Array.isArray(inv.extensions) ? inv.extensions : [];
  const grants = Array.isArray(inv.grants) ? inv.grants : [];
  const policies = Array.isArray(inv.policies) ? inv.policies : [];
  const tmpCols = Array.isArray(inv.tmpColumns) ? inv.tmpColumns : [];

  const rlsDisabled = tables.filter((t) => t.rls_enabled === false);
  const rlsEnabledNoPolicy = tables.filter(
    (t) => t.rls_enabled === true && !policies.some((p) => p.tablename === t.table_name)
  );

  return {
    tableCount: tables.length,
    rlsDisabled: rlsDisabled.map((t) => ({ table: t.table_name, approx_rows: t.approx_rows })),
    rlsEnabledNoPolicy: rlsEnabledNoPolicy.map((t) => t.table_name),
    securityDefinerViews: views.filter(viewIsSecurityDefiner).map((v) => v.view_name),
    publicBuckets: buckets.filter((b) => b.public === true).map((b) => b.id),
    anonGrants: grants.filter((g) => g.grantee === 'anon' || g.grantee === 'PUBLIC')
      .map((g) => ({
        table: g.table_name,
        grantee: g.grantee,
        privileges: g.privileges,
        // Write access for an unauthenticated caller is categorically worse
        // than read: it allows tampering and destruction, not just disclosure.
        writable: /INSERT|UPDATE|DELETE|TRUNCATE/.test(g.privileges ?? ''),
      })),
    mutableSearchPathFunctions: functions.filter(functionSearchPathMutable)
      .map((f) => `${f.schema_name}.${f.function_name}(${f.args})`),
    securityDefinerFunctions: functions.filter((f) => f.security_definer)
      .map((f) => `${f.schema_name}.${f.function_name}(${f.args})`),
    extensionsInPublic: extensions.filter((e) => e.schema_name === 'public').map((e) => e.extname),
    tmpTables: (inv.tmpTables ?? []).map((t) => ({
      table: t.table_name,
      exact_rows: tmpCounts[t.table_name] ?? null,
      approx_rows: t.approx_rows,
      rls_enabled: t.rls_enabled,
      sensitive_columns: sensitiveColumns(tmpCols.filter((c) => c.table_name === t.table_name)),
    })),
    policyCount: policies.length,
  };
}

function findingsMd(project, a, advisorCounts, logSummary) {
  const list = (xs, empty = '_none_') => (xs.length ? xs.map((x) => `- \`${x}\``).join('\n') : empty);

  return `# Step 0 findings — ${project.name} (\`${project.id}\`)

Region: ${project.region} · created ${String(project.created_at).slice(0, 10)} · status ${project.status}
Collected: ${new Date().toISOString()}

## Advisor counts

| Advisor | Errors | Warns | Info |
|---|---|---|---|
| security | ${advisorCounts.security.ERROR} | ${advisorCounts.security.WARN} | ${advisorCounts.security.INFO} |
| performance | ${advisorCounts.performance.ERROR} | ${advisorCounts.performance.WARN} | ${advisorCounts.performance.INFO} |

## Public tables with RLS DISABLED (${a.rlsDisabled.length} of ${a.tableCount})

${a.rlsDisabled.length
    ? a.rlsDisabled.map((t) => `- \`${t.table}\` (~${t.approx_rows} rows)`).join('\n')
    : '_none — all public tables have RLS enabled_'}

## Views running as SECURITY DEFINER (no \`security_invoker\`) — ${a.securityDefinerViews.length}

${list(a.securityDefinerViews)}

## Storage buckets with \`public = true\` — ${a.publicBuckets.length}

${list(a.publicBuckets)}

## Tables granted to \`anon\` / \`PUBLIC\` — ${a.anonGrants.length}

**${a.anonGrants.filter((g) => g.writable).length}** of these are WRITABLE by an
unauthenticated caller (INSERT / UPDATE / DELETE / TRUNCATE), which permits
tampering and destruction of records, not only disclosure.

${a.anonGrants.length
    ? a.anonGrants.map((g) => `- \`${g.table}\` (${g.grantee}): ${g.privileges}${g.writable ? ' **[WRITABLE]**' : ''}`).join('\n')
    : '_none_'}

## Leftover scratch tables — ${a.tmpTables.length}

${a.tmpTables.length
    ? a.tmpTables.map((t) =>
      `- \`${t.table}\` — ${t.exact_rows ?? t.approx_rows} rows, RLS ${t.rls_enabled ? 'on' : 'OFF'}` +
      (t.sensitive_columns.length ? `, sensitive columns: ${t.sensitive_columns.join(', ')}` : '')).join('\n')
    : '_none_'}

## RLS enabled but NO policies (deny-all — may already be breaking features) — ${a.rlsEnabledNoPolicy.length}

${list(a.rlsEnabledNoPolicy)}

## Warning-level items (Phase 3)

- Functions with mutable \`search_path\`: **${a.mutableSearchPathFunctions.length}**
- \`SECURITY DEFINER\` functions: **${a.securityDefinerFunctions.length}**
- Extensions installed in \`public\`: ${list(a.extensionsInPublic, '_none_')}

## Access logs

${logSummary ?? '_log export skipped_'}
`;
}

function logSummaryMd(ref, result, s) {
  const top = (xs, n = 25) => xs.slice(0, n).map(([k, v]) => `- \`${k}\` — ${v}`).join('\n') || '_none_';
  return `# Access log summary — \`${ref}\`

Projection used: \`${result.variant ?? 'none'}\`
Window covered: ${result.oldest ?? 'n/a'} .. ${result.newest ?? 'n/a'}
Total \`/rest/v1/\` rows retrieved: **${s.total}**

${result.notes.length ? `### Notes\n${result.notes.map((n) => `- ${n}`).join('\n')}\n` : ''}
> **Retention caveat.** Supabase log retention is plan-capped (roughly 1 day Free,
> 7 days Pro, 28 days Team). The exposure window for the leaked credentials is far
> longer, so these logs cannot confirm or rule out access across most of it.
> Absence of evidence here is **not** evidence of absence.

## Requests by API key role

${s.roleDataAvailable
    ? top(s.byApikeyRole) + `\n\n**anon-role requests: ${s.anonRows}**`
    : '_The log schema did not expose the API key role, so anon vs service_role cannot be distinguished from these logs._'}

## By table
${top(s.byTable)}

## By method
${top(s.byMethod)}

## By status
${top(s.byStatus)}

## By client IP
${top(s.byIp, 50)}

## By day
${top(s.byDay, 100)}
`;
}

function exposureMd(ref, a, inv, logResult) {
  const migrations = Array.isArray(inv.migrations) ? inv.migrations : [];
  const first = migrations[0]?.version;
  const last = migrations.at(-1)?.version;

  return `# Exposure window — \`${ref}\`

Determined ${new Date().toISOString()}.

## Migration history bounds

- Earliest applied migration: \`${first ?? 'unknown'}\`
- Latest applied migration: \`${last ?? 'unknown'}\`
- Total applied: ${migrations.length}

Postgres does not record *when* RLS was disabled on a table, and
\`pg_class.relrowsecurity\` carries no history. The window below is therefore
bounded by the migration that created each table — i.e. the table has been
readable for at most that long, and the true start is the creation date unless a
later migration explicitly enabled then removed RLS.

## Tables currently without RLS

| Table | Approx rows | Creating migration (grep) |
|---|---|---|
${a.rlsDisabled.map((t) => `| \`${t.table}\` | ${t.approx_rows} | _see \`git log -S "${t.table}" -- supabase/migrations\`_ |`).join('\n') || '| _none_ | | |'}

## Log-derived bounds

- Oldest log row available: ${logResult?.oldest ?? '_no logs retrieved_'}
- Newest log row available: ${logResult?.newest ?? '_no logs retrieved_'}

Log retention is shorter than the exposure window (see
\`access_logs_summary.md\`), so logs bound only the recent tail.

## Credential exposure (separate and more severe)

See \`reports/CRITICAL-leaked-service-role-keys.md\`: \`service_role\` keys were
public in a GitHub repository for ~203 days. \`service_role\` bypasses RLS, so for
any table listed above, the effective exposure window is the **longer** of the
RLS gap and the credential leak.
`;
}

function countAdvisors(payload) {
  const out = { ERROR: 0, WARN: 0, INFO: 0 };
  for (const l of payload?.lints ?? []) {
    const k = String(l.level ?? '').toUpperCase();
    if (k in out) out[k]++;
  }
  return out;
}

async function main() {
  console.log(`\nStep 0 evidence collection (${AFTER ? 'AFTER' : 'BEFORE'} state) — read only\n`);

  const projects = await selectProjects();
  if (!projects.length) {
    console.error('No projects visible to this token. Check its scopes and organisation.');
    process.exit(1);
  }
  console.log(`Projects in scope: ${projects.map((p) => `${p.name} (${p.id})`).join(', ')}\n`);

  const index = [];

  for (const project of projects) {
    const ref = project.id;
    console.log(`\n== ${project.name} (${ref}) ==`);

    console.log('  advisors...');
    const advisorCounts = {};
    const advisorPayload = {};
    for (const kind of ['security', 'performance']) {
      try {
        advisorPayload[kind] = await advisors(ref, kind);
        advisorCounts[kind] = countAdvisors(advisorPayload[kind]);
      } catch (e) {
        advisorPayload[kind] = { error: redact(e.message) };
        advisorCounts[kind] = { ERROR: 0, WARN: 0, INFO: 0 };
        console.warn(`    ! ${kind} advisors: ${redact(e.message).slice(0, 160)}`);
      }
    }
    writeOut(ref, AFTER ? 'advisor_after.json' : 'advisor_before.json', advisorPayload);

    console.log('  inventory...');
    const inv = await gatherInventory(ref);
    const tmpCounts = await exactTmpCounts(ref, inv.tmpTables);
    const a = analyse(inv, tmpCounts);
    writeOut(ref, AFTER ? 'inventory_after.json' : 'inventory.json', { project, inventory: inv, analysis: a });

    let logResult = null;
    let logMd = null;
    if (!SKIP_LOGS && !AFTER) {
      console.log('  logs (walking back day by day)...');
      try {
        logResult = await exportRestLogs(ref, { log: console.log });
        const s = summarise(logResult.rows);
        writeOut(ref, 'access_logs.json', logResult.rows);
        logMd = logSummaryMd(ref, logResult, s);
        writeOut(ref, 'access_logs_summary.md', logMd);
      } catch (e) {
        console.warn(`    ! log export failed: ${redact(e.message).slice(0, 200)}`);
      }
    }

    if (!AFTER) writeOut(ref, 'exposure.md', exposureMd(ref, a, inv, logResult));
    writeOut(ref, AFTER ? 'findings_after.md' : 'findings.md',
      findingsMd(project, a, advisorCounts, logMd ? `See \`access_logs_summary.md\`.` : null));

    index.push({ project: project.name, ref, advisorCounts, analysis: a });

    console.log(
      `  -> ${advisorCounts.security.ERROR} security errors, ` +
      `${advisorCounts.security.WARN} warnings, ` +
      `${a.rlsDisabled.length} tables without RLS, ` +
      `${a.securityDefinerViews.length} definer views, ` +
      `${a.publicBuckets.length} public buckets, ` +
      `${a.tmpTables.length} scratch tables`
    );
  }

  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, AFTER ? 'summary_after.json' : 'summary_before.json'),
    JSON.stringify(index, null, 2));

  console.log('\nDone. Totals:');
  for (const r of index) {
    console.log(`  ${r.ref}  errors=${r.advisorCounts.security.ERROR} ` +
      `noRLS=${r.analysis.rlsDisabled.length} definerViews=${r.analysis.securityDefinerViews.length} ` +
      `publicBuckets=${r.analysis.publicBuckets.length} tmp=${r.analysis.tmpTables.length}`);
  }
  console.log(`\nReports in reports/. Review before running any Phase 1 step.\n`);
}

main().catch((e) => {
  console.error(`\nFATAL: ${redact(e.message)}\n`);
  process.exit(1);
});
