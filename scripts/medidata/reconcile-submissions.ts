/**
 * Reconcile the historical MediData submission backlog and produce a human
 * worklist. Does NOT re-submit anything to any insurer.
 *
 * Two jobs:
 *
 *  1. Retire redundant active submissions. 10 invoices currently have more
 *     than one submission in an active state, which is what blocks the
 *     one-active-submission-per-invoice unique index. The newest is kept; older
 *     ones are flagged `is_superseded` with a reason and a history entry.
 *     `cancelled` is deliberately not reused — that must keep meaning "a Storno
 *     was actually transmitted to the insurer".
 *
 *  2. Emit reports/<ref>/medidata_worklist.md classifying every rejected or
 *     stale submission so staff know what to actually do, instead of
 *     re-sending and collecting another duplicate rejection.
 *
 * Deliberately NOT done: applying rejection responses to parent submissions.
 * Every `pending` submission that has a rejection response turned out to have
 * received it for a PATIENT COPY (TP Art. 42), which insurers routinely reject
 * as a duplicate of the original. /api/medidata/poll already skips those on
 * purpose, and overriding the parent status from a copy rejection would wrongly
 * mark live invoices as rejected.
 *
 * Usage:
 *   npx tsx scripts/medidata/reconcile-submissions.ts [--refs <ref>] [--confirm]
 */
import fs from "node:fs";
import path from "node:path";
import { classifyRejection, REJECTION_CLASS_LABELS } from "@/lib/medidataRejectionCodes";

// Plain ESM helper shared with the security tooling.
import { listProjects, runSql } from "../security/lib/mgmt.mjs";

const argv = process.argv.slice(2);
const CONFIRM = argv.includes("--confirm");
const refArg = argv.find((a) => a.startsWith("--refs="))?.split("=")[1]
  ?? (argv.includes("--refs") ? argv[argv.indexOf("--refs") + 1] : null);

/** Must match MEDIDATA_STALE_PENDING_DAYS used by the submission guard. */
const STALE_PENDING_DAYS = Number(process.env.MEDIDATA_STALE_PENDING_DAYS ?? 45);

const repoRoot = path.resolve(import.meta.dirname, "../..");

function lit(v: string | null | undefined): string {
  if (v === null || v === undefined) return "NULL";
  return `'${String(v).replace(/'/g, "''")}'`;
}

type Redundant = {
  invoice_id: string;
  invoice_number: string | null;
  keep_id: string;
  supersede_ids: string[];
  statuses: string;
};

async function findRedundant(ref: string): Promise<Redundant[]> {
  const rows = await runSql(
    ref,
    `with active as (
       select id, invoice_id, invoice_number, status, created_at,
              row_number() over (partition by invoice_id order by created_at desc, id desc) as rn,
              count(*) over (partition by invoice_id) as n
         from medidata_submissions
        where invoice_id is not null
          and coalesce(is_storno, false) = false
          and coalesce(is_superseded, false) = false
          and status in ('pending','transmitted','delivered','accepted')
     )
     select invoice_id::text,
            max(invoice_number) as invoice_number,
            (array_agg(id::text order by created_at desc, id desc))[1] as keep_id,
            (array_agg(id::text order by created_at desc, id desc))[2:] as supersede_ids,
            string_agg(status, ',' order by created_at) as statuses
       from active
      where n > 1
      group by invoice_id
      order by invoice_number;`,
    { readOnly: true },
  );
  return rows as Redundant[];
}

async function supersede(ref: string, items: Redundant[]) {
  for (const item of items) {
    const ids = item.supersede_ids.map((i) => `${lit(i)}::uuid`).join(",");
    const reason =
      `Reconciliation ${new Date().toISOString().slice(0, 10)}: redundant active submission for invoice ` +
      `${item.invoice_number ?? item.invoice_id}; superseded by the most recent submission.`;

    // History first: if the update fails we still have the audit trail, and the
    // history table has a not-null new_status so we echo the current status.
    await runSql(
      ref,
      `insert into medidata_submission_history (submission_id, previous_status, new_status, changed_by, notes)
       select s.id, s.status, s.status, null, ${lit(reason)}
         from medidata_submissions s
        where s.id in (${ids});`,
    );

    await runSql(
      ref,
      `update medidata_submissions
          set is_superseded = true,
              superseded_by_submission_id = ${lit(item.keep_id)}::uuid,
              superseded_reason = ${lit(reason)},
              superseded_at = now(),
              updated_at = now()
        where id in (${ids});`,
    );
  }
}

type WorklistRow = {
  submission_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  status: string;
  created_at: string;
  age_days: number;
  insurer_gln: string | null;
  /**
   * One object per insurer error. Aggregated as JSON rather than as parallel
   * arrays: `array_agg(distinct code)` and `array_agg(distinct text)` have
   * different lengths and unrelated orderings, so pairing them by index
   * silently mismatches codes to messages.
   */
  errors: Array<{ code: string; text: string | null; recordId: string | null }> | null;
  send_count: number;
  has_storno: boolean;
};

async function buildWorklist(ref: string) {
  const rows: WorklistRow[] = await runSql(
    ref,
    `with errs as (
       select e.submission_id,
              jsonb_agg(
                jsonb_build_object('code', e.code, 'text', e.text, 'recordId', e.record_id)
                order by (e.record_id is not null), e.record_id nulls first
              ) as errors,
              max(e.insurer_gln) as insurer_gln
         from medidata_response_errors e
        where e.submission_id is not null
        group by e.submission_id
     ),
     sends as (
       select invoice_id, count(*) as send_count,
              bool_or(coalesce(is_storno,false)) as has_storno
         from medidata_submissions where invoice_id is not null group by invoice_id
     )
     select s.id::text as submission_id, s.invoice_id::text, s.invoice_number, s.status,
            s.created_at::text, extract(day from now() - s.created_at)::int as age_days,
            coalesce(errs.insurer_gln, s.insurance_gln) as insurer_gln,
            errs.errors,
            coalesce(sends.send_count, 1) as send_count,
            coalesce(sends.has_storno, false) as has_storno
       from medidata_submissions s
       left join errs on errs.submission_id = s.id
       left join sends on sends.invoice_id = s.invoice_id
      where coalesce(s.is_superseded, false) = false
        and (
          s.status = 'rejected'
          or (s.status = 'pending' and s.created_at < now() - interval '${STALE_PENDING_DAYS} days')
        )
      order by (s.status = 'rejected') desc, sends.send_count desc nulls last, s.created_at;`,
    { readOnly: true },
  );

  return rows.map((r) => {
    const errors = (r.errors ?? []).map((e) => ({
      code: e.code,
      text: e.text,
      recordId: e.recordId,
      insurerGln: r.insurer_gln,
    }));

    // A stale `pending` submission with no insurer error is not an
    // unclassifiable rejection — no response ever arrived. Reporting it as
    // "Unclassified" would bury 80+ invoices that simply need chasing.
    const awaitingResponse = r.status === "pending" && errors.length === 0;

    const cls = awaitingResponse
      ? {
          rejectionClass: "AWAITING_RESPONSE" as const,
          resubmitPolicy: "manual_only" as const,
          matchedBy: "none" as const,
          conflict: false,
          guidance:
            `Transmitted but no insurer response after ${STALE_PENDING_DAYS}+ days. ` +
            `Chase MediData/the insurer. The submission guard treats these as stale, so a resend is permitted ` +
            `and will supersede this row.`,
        }
      : classifyRejection(
          errors,
          errors.map((e) => e.text).filter(Boolean).join(" ") || null,
        );

    return { ...r, cls, errorCodes: errors.map((e) => e.code), firstText: errors[0]?.text ?? null };
  });
}

function worklistMd(
  ref: string,
  name: string,
  rows: Awaited<ReturnType<typeof buildWorklist>>,
  redundant: Redundant[],
  applied: boolean,
) {
  const byClass = new Map<string, typeof rows>();
  for (const r of rows) {
    const k = r.cls.rejectionClass;
    if (!byClass.has(k)) byClass.set(k, []);
    byClass.get(k)!.push(r);
  }
  const ordered = [...byClass.entries()].sort((a, b) => b[1].length - a[1].length);

  // AWAITING_RESPONSE is a worklist-only category, not a rejection class.
  const label = (cls: string) =>
    cls === "AWAITING_RESPONSE"
      ? "Awaiting insurer response"
      : REJECTION_CLASS_LABELS[cls as keyof typeof REJECTION_CLASS_LABELS] ?? cls;

  const section = (rs: typeof rows) =>
    `| Invoice | Status | Age (d) | Sends | Storno? | Insurer codes | Insurer message |\n` +
    `|---|---|---:|---:|---|---|---|\n` +
    rs
      .slice(0, 60)
      .map(
        (r) =>
          `| \`${r.invoice_number ?? "—"}\` | ${r.status} | ${r.age_days} | ${r.send_count} | ` +
          `${r.has_storno ? "yes" : "no"} | ${r.errorCodes.slice(0, 4).join(", ") || "—"} | ` +
          `${(r.firstText ?? "").replace(/\|/g, "\\|").slice(0, 110)} |`,
      )
      .join("\n") + (rs.length > 60 ? `\n\n_…and ${rs.length - 60} more._` : "");

  return `# MediData submission worklist — ${name} (\`${ref}\`)

Generated ${new Date().toISOString()}. **No invoice was re-submitted by this script.**

Covers every non-superseded submission that is \`rejected\`, or \`pending\` for more
than ${STALE_PENDING_DAYS} days. Rejection reasons come from the insurer's own
\`<invoice:error>\` codes, now parsed into \`medidata_response_errors\`.

## Redundant active submissions ${applied ? "retired" : "to retire"}

${redundant.length === 0
      ? "_none_"
      : `${redundant.length} invoice(s) had more than one active submission. The newest is kept; the rest are marked \`is_superseded\`${applied ? " (applied)" : " (run with --confirm to apply)"}.\n\n` +
        `| Invoice | Active | Statuses | Retiring |\n|---|---:|---|---:|\n` +
        redundant
          .map((r) => `| \`${r.invoice_number ?? r.invoice_id}\` | ${r.supersede_ids.length + 1} | ${r.statuses} | ${r.supersede_ids.length} |`)
          .join("\n")}

## Summary by reason

| Reason | Submissions | What to do |
|---|---:|---|
${ordered
      .map(([cls, rs]) => {
        const policy = rs[0].cls.resubmitPolicy;
        const action =
          cls === "AWAITING_RESPONSE"
            ? "Chase the insurer; resend is allowed (stale)"
            : policy === "requires_storno"
              ? "**Storno required** before any resend"
              : policy === "allow_corrected_resend"
                ? "Fix the data, then resend"
                : "Manual handling — resending will not help";
        return `| ${label(cls)} | ${rs.length} | ${action} |`;
      })
      .join("\n")}

${ordered
      .map(
        ([cls, rs]) =>
          `## ${label(cls)} — ${rs.length}\n\n` +
          `${rs[0].cls.guidance}\n\n${section(rs)}\n`,
      )
      .join("\n")}
## Note on patient copies

Submissions left \`pending\` that appear to have a rejection response received it
for a **patient copy** (TP Art. 42), which insurers routinely reject as a
duplicate of the original. \`/api/medidata/poll\` ignores those by design and this
script does not override them — the original invoice is still legitimately in
flight. Do not treat them as failures on the strength of the copy rejection.
`;
}

async function run(ref: string, name: string) {
  console.log(`\n== ${name} (${ref}) ==`);

  const redundant = await findRedundant(ref);
  const toRetire = redundant.reduce((n, r) => n + r.supersede_ids.length, 0);
  console.log(`  invoices with >1 active submission: ${redundant.length} (${toRetire} rows to retire)`);

  if (redundant.length && CONFIRM) {
    await supersede(ref, redundant);
    console.log(`  superseded ${toRetire} redundant submission(s)`);
  } else if (redundant.length) {
    console.log("  (run with --confirm to apply)");
  }

  const rows = await buildWorklist(ref);
  console.log(`  worklist entries (rejected or pending > ${STALE_PENDING_DAYS}d): ${rows.length}`);

  const dir = path.join(repoRoot, "reports", ref);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, "medidata_worklist.md");
  fs.writeFileSync(out, worklistMd(ref, name, rows, redundant, CONFIRM && redundant.length > 0));
  console.log(`  wrote reports/${ref}/medidata_worklist.md`);

  if (CONFIRM) {
    const [{ n }] = await runSql(
      ref,
      `select count(*)::int as n from (
         select invoice_id from medidata_submissions
          where invoice_id is not null and coalesce(is_storno,false)=false
            and coalesce(is_superseded,false)=false
            and status in ('pending','transmitted','delivered','accepted')
          group by invoice_id having count(*) > 1) t;`,
      { readOnly: true },
    );
    console.log(`  invoices still with >1 active submission: ${n}${n === 0 ? " — unique index can now be created" : " — INDEX WILL FAIL"}`);
  }
}

async function main() {
  const all = await listProjects();
  const wanted = (refArg ?? process.env.SUPABASE_PROJECT_REFS ?? "")
    .split(",").map((s: string) => s.trim()).filter(Boolean);
  const projects = wanted.length ? all.filter((p: { id: string }) => wanted.includes(p.id)) : all;
  if (!projects.length) {
    console.error("No projects in scope.");
    process.exit(1);
  }
  for (const p of projects as Array<{ id: string; name: string }>) await run(p.id, p.name);
  console.log("");
}

main().catch((e) => {
  console.error(`\nFATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
