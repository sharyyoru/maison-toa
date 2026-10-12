/**
 * Idempotency guard for insurance submissions.
 *
 * Why this exists: 68 invoices produced 184 of 360 submissions on production,
 * and ~107 insurer rejections were duplicates ("Double calcul", "facture déjà
 * reçue/payée"). Neither send path checked whether the insurer already held the
 * invoice — `send-invoice` had no check at all, and `queue-submission` only
 * de-duplicated against in-flight *jobs*, so once a job finished the same
 * invoice could be sent again freely.
 *
 * The decision logic is deliberately separated from database access:
 * `decideSubmissionGuard` is pure and fully unit-tested, while
 * `evaluateSubmissionGuard` does the IO. The database partial unique index
 * `medidata_submissions_one_active_per_invoice` is the backstop for races.
 */
import {
  classifyRejection,
  type RejectionClass,
  type RejectionErrorInput,
} from './medidataRejectionCodes';

/** Statuses meaning "the insurer holds this and we are awaiting an outcome". */
export const ACTIVE_STATUSES = ['pending', 'transmitted', 'delivered', 'accepted'] as const;

/** Must match the predicate of the partial unique index. */
export const UNIQUE_ACTIVE_INDEX = 'medidata_submissions_one_active_per_invoice';

/**
 * A `pending` submission with no insurer response after this long is treated as
 * no longer active, so staff are not permanently locked out of re-billing. 109
 * submissions on production had been pending since June–September with no
 * response ever received.
 */
export const DEFAULT_STALE_PENDING_DAYS = 45;

export type GuardOutcome =
  | 'OK'
  | 'JOB_IN_FLIGHT'
  | 'ACTIVE_SUBMISSION'
  | 'REQUIRES_STORNO'
  | 'MANUAL_ONLY'
  | 'STALE_OVERRIDE';

export type SubmissionGuardVerdict = {
  allowed: boolean;
  outcome: GuardOutcome;
  /** Operator-facing message; safe to show in the UI verbatim. */
  message: string;
  /** The UI should offer a one-click "Storno then resend" action. */
  requiresStorno: boolean;
  previousSubmissionId: string | null;
  previousStatus: string | null;
  rejectionClass: RejectionClass | null;
  /** Existing queued/processing job, when that is why we are blocking. */
  existingJobId: string | null;
  /**
   * Set when a stale pending submission must be retired before the new row is
   * inserted. Order matters: if the new submission were inserted first, the
   * unique index would reject exactly what this guard just allowed.
   */
  supersede: { submissionId: string; reason: string } | null;
};

export type GuardSubmission = {
  id: string;
  status: string;
  createdAt: string | Date;
  isStorno: boolean;
  isSuperseded: boolean;
  /** Whether any insurer response has been recorded against this submission. */
  hasResponse: boolean;
  errors: RejectionErrorInput[];
};

export type GuardInputs = {
  now?: Date;
  stalePendingDays?: number;
  activeJob?: { id: string; status: string } | null;
  submissions: GuardSubmission[];
};

function ageInDays(createdAt: string | Date, now: Date): number {
  const t = createdAt instanceof Date ? createdAt.getTime() : new Date(createdAt).getTime();
  if (!Number.isFinite(t)) return 0;
  return (now.getTime() - t) / 86_400_000;
}

function verdict(partial: Partial<SubmissionGuardVerdict> & Pick<SubmissionGuardVerdict, 'allowed' | 'outcome' | 'message'>): SubmissionGuardVerdict {
  return {
    requiresStorno: false,
    previousSubmissionId: null,
    previousStatus: null,
    rejectionClass: null,
    existingJobId: null,
    supersede: null,
    ...partial,
  };
}

/**
 * Pure decision function. Rules are applied in order; the first that matches
 * wins.
 */
export function decideSubmissionGuard(inputs: GuardInputs): SubmissionGuardVerdict {
  const now = inputs.now ?? new Date();
  const staleDays = inputs.stalePendingDays ?? DEFAULT_STALE_PENDING_DAYS;

  // 1. A job already queued or running for this invoice. Preserves the
  //    pre-existing behaviour of queue-submission.
  if (inputs.activeJob) {
    return verdict({
      allowed: false,
      outcome: 'JOB_IN_FLIGHT',
      message: 'A submission for this invoice is already queued.',
      existingJobId: inputs.activeJob.id,
    });
  }

  // Storno rows are separate messages about the same invoice, and superseded
  // rows have been retired; neither should influence the decision.
  const relevant = (inputs.submissions ?? [])
    .filter((s) => !s.isStorno && !s.isSuperseded)
    .slice()
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const active = relevant.find((s) => (ACTIVE_STATUSES as readonly string[]).includes(s.status));

  // 2. The insurer currently holds a submission for this invoice.
  if (active) {
    const isStale =
      active.status === 'pending' &&
      !active.hasResponse &&
      ageInDays(active.createdAt, now) >= staleDays;

    if (isStale) {
      const days = Math.floor(ageInDays(active.createdAt, now));
      return verdict({
        allowed: true,
        outcome: 'STALE_OVERRIDE',
        message:
          `The previous submission has been pending for ${days} days with no insurer response, ` +
          `so it will be retired and this invoice resent.`,
        previousSubmissionId: active.id,
        previousStatus: active.status,
        supersede: {
          submissionId: active.id,
          reason:
            `Stale pending override: no insurer response after ${days} days ` +
            `(threshold ${staleDays}). Retired in favour of a new submission.`,
        },
      });
    }

    return verdict({
      allowed: false,
      outcome: 'ACTIVE_SUBMISSION',
      message:
        active.status === 'accepted'
          ? 'This invoice has already been accepted by the insurer. Cancel it (Storno) before sending a correction.'
          : 'This invoice has already been sent to the insurer and is awaiting a response. ' +
            'Cancel the previous submission (Storno) before sending it again.',
      requiresStorno: true,
      previousSubmissionId: active.id,
      previousStatus: active.status,
    });
  }

  // 3. The most recent attempt was rejected — what happens next depends on why.
  const lastRejected = relevant.find((s) => s.status === 'rejected');
  if (lastRejected) {
    const cls = classifyRejection(lastRejected.errors ?? []);

    if (cls.resubmitPolicy === 'requires_storno') {
      return verdict({
        allowed: false,
        outcome: 'REQUIRES_STORNO',
        message: cls.guidance,
        requiresStorno: true,
        previousSubmissionId: lastRejected.id,
        previousStatus: lastRejected.status,
        rejectionClass: cls.rejectionClass,
      });
    }

    if (cls.resubmitPolicy === 'manual_only') {
      return verdict({
        allowed: false,
        outcome: 'MANUAL_ONLY',
        message: cls.guidance,
        previousSubmissionId: lastRejected.id,
        previousStatus: lastRejected.status,
        rejectionClass: cls.rejectionClass,
      });
    }

    // allow_corrected_resend: the insurer did not accept it, so no Storno is
    // owed — the data just needs to be right this time.
    return verdict({
      allowed: true,
      outcome: 'OK',
      message: 'Previous submission was rejected for a data error; resending is allowed.',
      previousSubmissionId: lastRejected.id,
      previousStatus: lastRejected.status,
      rejectionClass: cls.rejectionClass,
    });
  }

  // 4. Nothing live, nothing rejected (no history, or only drafts/cancelled).
  return verdict({ allowed: true, outcome: 'OK', message: 'No previous submission blocks this invoice.' });
}

/** True when an error is the unique-active-submission backstop firing. */
export function isUniqueActiveViolation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const e = error as { code?: string; message?: string; details?: string };
  if (e.code !== '23505') return false;
  const haystack = `${e.message ?? ''} ${e.details ?? ''}`;
  // Only claim it when it is our index; another unique violation is a real bug.
  return haystack.includes(UNIQUE_ACTIVE_INDEX);
}

/** The verdict to return when the backstop fires instead of the app check. */
export function uniqueViolationVerdict(): SubmissionGuardVerdict {
  return verdict({
    allowed: false,
    outcome: 'ACTIVE_SUBMISSION',
    message:
      'This invoice was submitted to the insurer a moment ago by another action. ' +
      'Cancel that submission (Storno) before sending it again.',
    requiresStorno: true,
  });
}

// ---------------------------------------------------------------------------
// IO
// ---------------------------------------------------------------------------

type MinimalClient = {
  from: (table: string) => any;
};

/**
 * Load the state for an invoice and decide. `client` must be the service-role
 * client (these tables are not readable by the anon role).
 */
export async function evaluateSubmissionGuard(
  client: MinimalClient,
  invoiceId: string,
  options?: { stalePendingDays?: number; now?: Date },
): Promise<SubmissionGuardVerdict> {
  const staleDays =
    options?.stalePendingDays ??
    Number(process.env.MEDIDATA_STALE_PENDING_DAYS ?? DEFAULT_STALE_PENDING_DAYS);

  const { data: jobs } = await client
    .from('medidata_submission_jobs')
    .select('id, status, created_at')
    .eq('invoice_id', invoiceId)
    .in('status', ['pending', 'processing'])
    .order('created_at', { ascending: false })
    .limit(1);

  const activeJob = jobs && jobs.length > 0 ? { id: jobs[0].id, status: jobs[0].status } : null;

  const { data: subs } = await client
    .from('medidata_submissions')
    .select('id, status, created_at, is_storno, is_superseded')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });

  const submissions: GuardSubmission[] = [];
  for (const s of subs ?? []) {
    // Only the rows that can actually influence the decision need their errors
    // and response state loaded.
    const needsDetail =
      (ACTIVE_STATUSES as readonly string[]).includes(s.status) || s.status === 'rejected';

    let errors: RejectionErrorInput[] = [];
    let hasResponse = false;

    if (needsDetail && !s.is_storno && !s.is_superseded) {
      const { data: errRows } = await client
        .from('medidata_response_errors')
        .select('code, text, record_id, insurer_gln')
        .eq('submission_id', s.id);

      errors = (errRows ?? []).map((e: { code: string; text: string | null; record_id: string | null; insurer_gln: string | null }) => ({
        code: e.code,
        text: e.text,
        recordId: e.record_id,
        insurerGln: e.insurer_gln,
      }));

      if (errors.length > 0) {
        hasResponse = true;
      } else {
        // A response can exist with no structured errors (e.g. "pending"
        // acknowledgements), and that still means the insurer has replied.
        const { count } = await client
          .from('medidata_responses')
          .select('id', { count: 'exact', head: true })
          .eq('submission_id', s.id);
        hasResponse = (count ?? 0) > 0;
      }
    }

    submissions.push({
      id: s.id,
      status: s.status,
      createdAt: s.created_at,
      isStorno: Boolean(s.is_storno),
      isSuperseded: Boolean(s.is_superseded),
      hasResponse,
      errors,
    });
  }

  return decideSubmissionGuard({
    now: options?.now,
    stalePendingDays: staleDays,
    activeJob,
    submissions,
  });
}

/**
 * Retire a stale submission. MUST be called before inserting the replacement,
 * otherwise the unique index rejects the new row.
 */
export async function applySupersede(
  client: MinimalClient,
  supersede: { submissionId: string; reason: string },
  replacementId?: string | null,
): Promise<void> {
  const { data: existing } = await client
    .from('medidata_submissions')
    .select('status')
    .eq('id', supersede.submissionId)
    .single();

  await client
    .from('medidata_submissions')
    .update({
      is_superseded: true,
      superseded_by_submission_id: replacementId ?? null,
      superseded_reason: supersede.reason,
      superseded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', supersede.submissionId);

  // history.new_status is NOT NULL, so echo the current status.
  await client.from('medidata_submission_history').insert({
    submission_id: supersede.submissionId,
    previous_status: existing?.status ?? 'pending',
    new_status: existing?.status ?? 'pending',
    changed_by: null,
    notes: supersede.reason,
  });
}
