import assert from "node:assert/strict";
import {
  decideSubmissionGuard,
  isUniqueActiveViolation,
  uniqueViolationVerdict,
  UNIQUE_ACTIVE_INDEX,
  DEFAULT_STALE_PENDING_DAYS,
  type GuardSubmission,
} from "@/lib/medidataSubmissionGuard";

const NOW = new Date("2026-10-12T12:00:00Z");

function daysAgo(n: number): string {
  return new Date(NOW.getTime() - n * 86_400_000).toISOString();
}

function sub(partial: Partial<GuardSubmission> & Pick<GuardSubmission, "status">): GuardSubmission {
  return {
    id: partial.id ?? `sub-${partial.status}`,
    status: partial.status,
    createdAt: partial.createdAt ?? daysAgo(1),
    isStorno: partial.isStorno ?? false,
    isSuperseded: partial.isSuperseded ?? false,
    hasResponse: partial.hasResponse ?? false,
    errors: partial.errors ?? [],
  };
}

// --- No history: nothing blocks. ---
{
  const v = decideSubmissionGuard({ now: NOW, submissions: [] });
  assert.equal(v.allowed, true);
  assert.equal(v.outcome, "OK");
}

// --- An in-flight job short-circuits everything (prior behaviour preserved). ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    activeJob: { id: "job-1", status: "processing" },
    submissions: [sub({ status: "rejected" })],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "JOB_IN_FLIGHT");
  assert.equal(v.existingJobId, "job-1");
  assert.equal(v.requiresStorno, false);
}

// --- Every active status blocks and demands a Storno. This is the core fix:
//     previously nothing stopped a second send. ---
for (const status of ["pending", "transmitted", "delivered", "accepted"]) {
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ id: "s1", status, createdAt: daysAgo(2), hasResponse: status !== "pending" })],
  });
  assert.equal(v.allowed, false, `${status} must block`);
  assert.equal(v.outcome, "ACTIVE_SUBMISSION");
  assert.equal(v.requiresStorno, true);
  assert.equal(v.previousSubmissionId, "s1");
}

// --- `draft` is not active and must never block. ---
{
  const v = decideSubmissionGuard({ now: NOW, submissions: [sub({ status: "draft" })] });
  assert.equal(v.allowed, true);
  assert.equal(v.outcome, "OK");
}

// --- Storno and superseded rows are ignored when deciding. Without this, an
//     invoice could never be resent after a Storno was issued. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [
      sub({ id: "storno", status: "transmitted", isStorno: true }),
      sub({ id: "old", status: "pending", isSuperseded: true, createdAt: daysAgo(100) }),
    ],
  });
  assert.equal(v.allowed, true);
  assert.equal(v.outcome, "OK");
}

// --- Stale pending override: pending, no response, older than the threshold.
//     109 production submissions were in this state; without the override the
//     guard would lock staff out of re-billing them entirely. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ id: "stale", status: "pending", createdAt: daysAgo(60), hasResponse: false })],
  });
  assert.equal(v.allowed, true);
  assert.equal(v.outcome, "STALE_OVERRIDE");
  // The old row must be retired BEFORE the new insert, or the unique index
  // rejects exactly what we just allowed.
  assert.ok(v.supersede, "a supersede instruction is required");
  assert.equal(v.supersede?.submissionId, "stale");
  assert.match(v.supersede?.reason ?? "", /no insurer response/i);
}

// --- Just inside the threshold: still blocked. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ status: "pending", createdAt: daysAgo(DEFAULT_STALE_PENDING_DAYS - 1) })],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "ACTIVE_SUBMISSION");
  assert.equal(v.supersede, null);
}

// --- Old but the insurer DID respond: not stale. The insurer is engaged with
//     it, so resending without a Storno would create a duplicate. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ status: "pending", createdAt: daysAgo(200), hasResponse: true })],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "ACTIVE_SUBMISSION");
}

// --- A long-transmitted submission is never "stale": only `pending` qualifies. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ status: "transmitted", createdAt: daysAgo(300), hasResponse: false })],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "ACTIVE_SUBMISSION");
}

// --- Configurable threshold. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    stalePendingDays: 10,
    submissions: [sub({ status: "pending", createdAt: daysAgo(20) })],
  });
  assert.equal(v.outcome, "STALE_OVERRIDE");
}

// --- Rejected as a DUPLICATE: must require a Storno. Resending is precisely
//     what produced ~107 duplicate rejections on production. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [
      sub({
        id: "rej",
        status: "rejected",
        hasResponse: true,
        errors: [{ code: "000125", text: "Double calcul - facture d'origine réglée" }],
      }),
    ],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "REQUIRES_STORNO");
  assert.equal(v.requiresStorno, true);
  assert.equal(v.rejectionClass, "DUPLICATE_INVOICE");
}

// --- Rejected for a DATA error: corrected resend allowed, no Storno. The
//     insurer never accepted it, so nothing is owed a cancellation. ---
{
  for (const errors of [
    [{ code: "eK6.2.1", text: "Merci de nous livrer le service spécialisé correct pour la facturation des positions tarifaires Tardoc" }],
    [{ code: "003622", text: "Le chiffre tarifaire ne correspond pas au tarif fourni." }],
    [{ code: "4.504.003", text: "Le diagnostic est manquant pour la prestation du tarif 007." }],
  ]) {
    const v = decideSubmissionGuard({
      now: NOW,
      submissions: [sub({ status: "rejected", hasResponse: true, errors })],
    });
    assert.equal(v.allowed, true, `should allow resend for ${errors[0].code}`);
    assert.equal(v.outcome, "OK");
    assert.equal(v.requiresStorno, false);
  }
}

// --- Rejected for a MANUAL-only reason: blocked, and explicitly NOT a Storno
//     prompt, because a Storno would not help either. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [
      sub({
        status: "rejected",
        hasResponse: true,
        errors: [{ code: "13", text: "Malgré nos demandes, nous n'avons pas reçu de rapport médical pour le Botox" }],
      }),
    ],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "MANUAL_ONLY");
  assert.equal(v.requiresStorno, false);
  assert.equal(v.rejectionClass, "CLINICAL_DOC");
}

// --- An unrecognised rejection must NOT be resendable. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ status: "rejected", hasResponse: true, errors: [{ code: "ZZZ", text: "mystery" }] })],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "MANUAL_ONLY");
  assert.equal(v.rejectionClass, "UNKNOWN");
}

// --- A rejection with no stored errors at all is also not resendable. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [sub({ status: "rejected", hasResponse: true, errors: [] })],
  });
  assert.equal(v.allowed, false);
  assert.equal(v.outcome, "MANUAL_ONLY");
}

// --- Precedence: an ACTIVE submission outranks an older rejection. The newest
//     state is what the insurer holds. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [
      sub({ id: "new", status: "transmitted", createdAt: daysAgo(1) }),
      sub({
        id: "older",
        status: "rejected",
        createdAt: daysAgo(30),
        errors: [{ code: "003622", text: "Le chiffre tarifaire ne correspond pas au tarif fourni." }],
      }),
    ],
  });
  assert.equal(v.outcome, "ACTIVE_SUBMISSION");
  assert.equal(v.previousSubmissionId, "new");
}

// --- Mixed duplicate + line errors on one rejection: Storno still wins. ---
{
  const v = decideSubmissionGuard({
    now: NOW,
    submissions: [
      sub({
        status: "rejected",
        hasResponse: true,
        errors: [
          { code: "000125", text: "Double calcul - facture d'origine réglée" },
          { code: "000412", text: "Prestation TARDOC déjà compensée le même jour", recordId: "2" },
        ],
      }),
    ],
  });
  assert.equal(v.outcome, "REQUIRES_STORNO");
}

// --- 23505 detection: only our index counts. A different unique violation is a
//     real bug and must not be reported to the user as "already submitted". ---
{
  assert.equal(
    isUniqueActiveViolation({ code: "23505", message: `duplicate key value violates unique constraint "${UNIQUE_ACTIVE_INDEX}"` }),
    true,
  );
  assert.equal(
    isUniqueActiveViolation({ code: "23505", message: 'duplicate key value violates unique constraint "some_other_idx"' }),
    false,
  );
  assert.equal(isUniqueActiveViolation({ code: "23502", message: UNIQUE_ACTIVE_INDEX }), false);
  assert.equal(isUniqueActiveViolation(null), false);
  assert.equal(isUniqueActiveViolation("boom"), false);
  // Postgrest surfaces the index name in `details` in some versions.
  assert.equal(
    isUniqueActiveViolation({ code: "23505", message: "conflict", details: `Key (invoice_id) ... ${UNIQUE_ACTIVE_INDEX}` }),
    true,
  );

  const v = uniqueViolationVerdict();
  assert.equal(v.allowed, false);
  assert.equal(v.requiresStorno, true);
}

console.log("medidataSubmissionGuard: all assertions passed");
