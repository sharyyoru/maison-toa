#!/usr/bin/env node
/**
 * Phase 1b — leftover migration/scratch tables.
 *
 * Reports exact row counts and column lists, flags which hold special-category
 * personal data, and EMITS a DROP migration. It never applies it: dropping a
 * table is irreversible and requires explicit owner approval.
 *
 * Usage:
 *   node scripts/security/phase1b-scratch-tables.mjs [--refs a,b]
 */
import fs from 'node:fs';
import path from 'node:path';
import { env, repoRoot, redact } from './lib/env.mjs';
import { listProjects, runSql } from './lib/mgmt.mjs';
import { QUERIES, sensitiveColumns } from './lib/inventory.mjs';

const refArg = process.argv.slice(2).find((a) => a.startsWith('--refs='))?.split('=')[1];
const ident = (s) => `"${String(s).replace(/"/g, '""')}"`;
const quote = (s) => `'${String(s).replace(/'/g, "''")}'`;

const all = await listProjects();
const wanted = (refArg ?? env.SUPABASE_PROJECT_REFS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
const projects = wanted.length ? all.filter((p) => wanted.includes(p.id)) : all;

for (const project of projects) {
  const ref = project.id;
  console.log(`\n== ${project.name} (${ref}) ==`);

  const tables = await runSql(ref, QUERIES.tmpTables, { readOnly: true });
  if (!tables.length) { console.log('  no scratch tables'); continue; }

  const columns = await runSql(ref, QUERIES.tmpColumns, { readOnly: true });

  // Exact counts — reltuples is only an estimate and can be badly stale.
  const union = tables
    .map((t) => `select ${quote(t.table_name)} as table_name, count(*) as exact_rows from public.${ident(t.table_name)}`)
    .join(' union all ');
  const counts = Object.fromEntries(
    (await runSql(ref, union, { readOnly: true })).map((r) => [r.table_name, Number(r.exact_rows)])
  );

  // Anything depending on these must be understood before dropping.
  const deps = await runSql(ref, `
    select dependent.relname as dependent_object, source.relname as scratch_table
      from pg_catalog.pg_depend d
      join pg_catalog.pg_rewrite rw on rw.oid = d.objid
      join pg_catalog.pg_class dependent on dependent.oid = rw.ev_class
      join pg_catalog.pg_class source on source.oid = d.refobjid
      join pg_catalog.pg_namespace n on n.oid = source.relnamespace
     where n.nspname = 'public'
       and (source.relname like 'tmp%' or source.relname like 'temp%' or source.relname like '%_stage')
       and dependent.relname <> source.relname
     group by 1, 2 order by 2, 1;`, { readOnly: true });

  const rows = tables.map((t) => {
    const cols = columns.filter((c) => c.table_name === t.table_name);
    return {
      table: t.table_name,
      exactRows: counts[t.table_name] ?? null,
      columnCount: cols.length,
      sensitive: sensitiveColumns(cols),
      dependents: deps.filter((d) => d.scratch_table === t.table_name).map((d) => d.dependent_object),
    };
  }).sort((a, b) => (b.exactRows ?? 0) - (a.exactRows ?? 0));

  const withData = rows.filter((r) => (r.exactRows ?? 0) > 0);
  const empty = rows.filter((r) => (r.exactRows ?? 0) === 0);
  const totalRows = rows.reduce((n, r) => n + (r.exactRows ?? 0), 0);

  const dir = path.join(repoRoot, 'reports', ref);
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'phase1b_scratch_tables.md'), redact(`# Phase 1b — leftover scratch tables (\`${ref}\`)

Generated ${new Date().toISOString()}. **Nothing has been dropped.**

${rows.length} scratch tables holding **${totalRows.toLocaleString()} rows** in total.
${withData.length} contain data; ${empty.length} are empty.

## Tables containing data

| Table | Exact rows | Cols | Special-category columns | Dependents |
|---|---:|---:|---|---|
${withData.map((r) => `| \`${r.table}\` | ${r.exactRows.toLocaleString()} | ${r.columnCount} | ${r.sensitive.length ? r.sensitive.slice(0, 6).join(', ') + (r.sensitive.length > 6 ? ` _(+${r.sensitive.length - 6})_` : '') : '—'} | ${r.dependents.join(', ') || '—'} |`).join('\n')}

## Empty tables (safe to drop, no data loss)

${empty.map((r) => `- \`${r.table}\``).join('\n') || '_none_'}

## Recommendation

All of these are migration artifacts in the \`public\` schema. Until Phase 1
they were readable and writable by any holder of the anon key. They are not
referenced by the application (verify against the dependents column above).

**Before dropping**, export them: they may be the only remaining copy of
pre-migration source data. The generated migration is a DROP only — take the
backup first.

## Approval

- [ ] Owner has confirmed these tables are not needed
- [ ] Contents exported to the encrypted backup
- [ ] Dependents column reviewed and empty, or dependents handled

Migration to apply once all three are ticked:
\`supabase/migrations-pending-approval/20261012_drop_scratch_tables_${ref}.sql\`

It is deliberately **outside** \`supabase/migrations/\` so no migration runner can
apply an irreversible DROP before it has been approved. Move it in, or apply it
explicitly with \`scripts/security/apply-sql.mjs\`, once approved.
`));

  // NOT supabase/migrations/ — an unapproved irreversible DROP must never sit
  // in a directory that a migration runner will pick up automatically.
  const pendingDir = path.join(repoRoot, 'supabase', 'migrations-pending-approval');
  fs.mkdirSync(pendingDir, { recursive: true });
  const mig = path.join(pendingDir, `20261012_drop_scratch_tables_${ref}.sql`);
  fs.writeFileSync(mig, `-- =====================================================================
-- Phase 1b — drop leftover migration/scratch tables (${ref})
-- =====================================================================
-- IRREVERSIBLE. Do not apply until:
--   1. the owner has approved the list, and
--   2. the contents are in an encrypted backup held outside the repository.
--
-- ${rows.length} tables, ${totalRows.toLocaleString()} rows total.
-- See reports/${ref}/phase1b_scratch_tables.md for counts and columns.
-- =====================================================================

${rows.map((r) => `-- ${String(r.exactRows ?? 0).padStart(7)} rows${r.sensitive.length ? ` | special-category: ${r.sensitive.slice(0, 4).join(', ')}` : ''}
drop table if exists public.${ident(r.table)} cascade;`).join('\n\n')}

do $$
begin
  raise notice 'Phase 1b: dropped ${rows.length} scratch table(s)';
end $$;
`);

  console.log(`  ${rows.length} tables, ${totalRows.toLocaleString()} rows`);
  console.log(`  report:    reports/${ref}/phase1b_scratch_tables.md`);
  console.log(`  migration: ${path.relative(repoRoot, mig)} (NOT applied)`);
}

console.log('\nNothing dropped. Awaiting owner approval.\n');
