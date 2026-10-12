/**
 * Backfill `medidata_response_errors` from the XML already stored on every
 * `medidata_responses` row, and repair `insurance_response_code` on the
 * corresponding submissions.
 *
 * Why this is needed: the poller only ever stored `status_out`, which is the
 * literal string "unknown" in most insurer payloads. The machine-readable
 * `<invoice:error code=... text=... record_id=.../>` elements were present in
 * the stored `content` all along but never parsed, so nobody could see why an
 * invoice was rejected. Every historical rejection can therefore be classified
 * retroactively with no data loss.
 *
 * Written in TypeScript and run through tsx so it imports the SAME parser the
 * live poller uses (@/lib/medidataResponseParser). A second, separate
 * implementation would drift and make history incomparable with new rows.
 *
 * Database access goes through the Supabase Management API rather than
 * supabaseAdmin on purpose: SUPABASE_SERVICE_ROLE_KEY in .env.local points at a
 * different (empty) project, so using it here would silently target the wrong
 * database.
 *
 * Idempotent: relies on the NULLS NOT DISTINCT unique index
 * (response_id, code, record_id) and ON CONFLICT DO NOTHING.
 *
 * Usage:
 *   npx tsx scripts/medidata/backfill-response-errors.ts [--refs <ref>] [--dry-run]
 */
import { parseResponseXml, primaryErrorCode } from "@/lib/medidataResponseParser";
import { classifyRejection } from "@/lib/medidataRejectionCodes";

// Plain ESM helper shared with the security tooling.
import { listProjects, runSql } from "../security/lib/mgmt.mjs";

const argv = process.argv.slice(2);
const DRY = argv.includes("--dry-run");
const refArg = argv.find((a) => a.startsWith("--refs="))?.split("=")[1]
  ?? (argv.includes("--refs") ? argv[argv.indexOf("--refs") + 1] : null);

const PAGE = 25;

/** Escape a value for inline SQL. Insurer text contains apostrophes ("d'origine"). */
function lit(value: string | null | undefined): string {
  if (value === null || value === undefined) return "NULL";
  return `'${String(value).replace(/'/g, "''")}'`;
}

type ResponseRow = {
  id: string;
  submission_id: string | null;
  sender_gln: string | null;
  received_at: string | null;
  response_type: string | null;
  content: string | null;
};

async function backfillProject(ref: string, name: string) {
  console.log(`\n== ${name} (${ref}) ==`);

  const [{ n: total }] = await runSql(
    ref,
    `select count(*)::int as n from medidata_responses where content is not null;`,
    { readOnly: true },
  );
  console.log(`  responses with stored XML: ${total}`);

  let offset = 0;
  let parsedErrors = 0;
  let inserted = 0;
  let responsesWithErrors = 0;
  let responsesWithoutErrors = 0;
  const classTally = new Map<string, number>();
  const codeTally = new Map<string, number>();

  while (offset < total) {
    const rows: ResponseRow[] = await runSql(
      ref,
      `select id, submission_id, sender_gln, received_at, response_type, content
         from medidata_responses
        where content is not null
        order by received_at nulls last, id
        limit ${PAGE} offset ${offset};`,
      { readOnly: true },
    );
    if (!rows.length) break;

    const values: string[] = [];
    for (const row of rows) {
      const parsed = parseResponseXml(row.content ?? "");
      if (!parsed.errors.length) {
        responsesWithoutErrors++;
        continue;
      }
      responsesWithErrors++;
      parsedErrors += parsed.errors.length;

      const cls = classifyRejection(
        parsed.errors.map((e) => ({
          code: e.code,
          text: e.text,
          recordId: e.recordId,
          insurerGln: row.sender_gln,
        })),
        parsed.explanation,
      );
      classTally.set(cls.rejectionClass, (classTally.get(cls.rejectionClass) ?? 0) + 1);

      for (const e of parsed.errors) {
        codeTally.set(e.code, (codeTally.get(e.code) ?? 0) + 1);
        values.push(
          `(${lit(row.id)}::uuid, ${row.submission_id ? `${lit(row.submission_id)}::uuid` : "NULL"}, ` +
            `${lit(e.code)}, ${lit(e.text)}, ${lit(e.recordId)}, ${lit(row.sender_gln)}, ` +
            `${row.received_at ? `${lit(row.received_at)}::timestamptz` : "NULL"})`,
        );
      }
    }

    if (values.length && !DRY) {
      // `returning` gives the rows actually written. It is lower than the
      // parsed count because a response can repeat an identical invoice-level
      // error ("1) La facture a déjà été payée. 2) La facture a déjà été
      // payée."), and those collapse under the NULLS NOT DISTINCT index.
      // Reporting the attempted count instead would overstate what was stored.
      const written = await runSql(
        ref,
        `insert into medidata_response_errors
           (response_id, submission_id, code, text, record_id, insurer_gln, received_at)
         values ${values.join(",\n                ")}
         on conflict (response_id, code, record_id) do nothing
         returning 1;`,
      );
      inserted += Array.isArray(written) ? written.length : 0;
    }

    offset += PAGE;
    process.stdout.write(`\r  parsed ${Math.min(offset, total)}/${total}`);
  }
  process.stdout.write("\n");

  console.log(`  responses carrying <invoice:error>: ${responsesWithErrors}`);
  console.log(`  responses with none (older/free-text): ${responsesWithoutErrors}`);
  console.log(
    `  error elements parsed: ${parsedErrors}` +
      (DRY
        ? " (dry run, nothing written)"
        : `, rows newly stored: ${inserted}` +
          (parsedErrors - inserted > 0
            ? ` (${parsedErrors - inserted} already present or identical repeats)`
            : "")),
  );

  console.log("\n  rejection class distribution:");
  for (const [cls, n] of [...classTally.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${cls.padEnd(24)} ${n}`);
  }
  console.log("\n  top insurer codes:");
  for (const [code, n] of [...codeTally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)) {
    console.log(`    ${code.padEnd(10)} ${n}`);
  }

  if (DRY) return;

  // Repair insurance_response_code where it was never populated or was the
  // useless "unknown" from status_out. Only touches rows we can now explain.
  const [{ n: repaired }] = await runSql(
    ref,
    `with primary_error as (
       select e.submission_id,
              (array_agg(e.code order by (e.record_id is not null), e.record_id nulls first))[1] as code
         from medidata_response_errors e
        where e.submission_id is not null
        group by e.submission_id
     )
     update medidata_submissions s
        set insurance_response_code = p.code,
            updated_at = now()
       from primary_error p
      where p.submission_id = s.id
        and (s.insurance_response_code is null or s.insurance_response_code in ('unknown',''))
      returning 1;`,
  ).then((rows: unknown[]) => [{ n: Array.isArray(rows) ? rows.length : 0 }]);
  console.log(`\n  submissions with insurance_response_code repaired: ${repaired}`);
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

  for (const p of projects as Array<{ id: string; name: string }>) {
    await backfillProject(p.id, p.name);
  }
  console.log("");
}

main().catch((e) => {
  console.error(`\nFATAL: ${e instanceof Error ? e.message : String(e)}\n`);
  process.exit(1);
});
