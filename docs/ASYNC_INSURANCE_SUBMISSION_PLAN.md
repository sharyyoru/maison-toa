# Async Insurance Submission — Implementation Plan

## Goal

Move insurance submissions (MediData / Sumex) to an async queue so users are not blocked while Sumex XML is generated and the invoice is transmitted. Progress and results are shown in the **existing notification panel**, on a new **Insurance** tab alongside Emails and PDFs.

The existing `medidata_submissions` table continues to be the source of truth for submission state. The new `medidata_submission_jobs` table is only the async queue / job tracker.

---

## Architecture

```
User clicks "Send to insurance" (single or bulk)
        ↓
POST /api/medidata/queue-submission   (Vercel — returns immediately)
        ↓
medidata_submission_jobs row inserted (status: pending)
        ↓
Vercel Cron /api/cron/process-submission-jobs runs every minute
        ↓
Picks up oldest pending job → calls /api/medidata/send-invoice
        ↓
Creates/updates medidata_submissions row → updates job (completed/failed)
        ↓
Frontend polls /api/medidata/submission-jobs → updates notification panel
```

---

## Phase 1 — Database Migration

New table `medidata_submission_jobs`:

```sql
CREATE TABLE IF NOT EXISTS medidata_submission_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  patient_id           uuid,
  submission_id        uuid REFERENCES medidata_submissions(id) ON DELETE SET NULL,
  invoice_number       text,
  status               text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  created_at           timestamptz DEFAULT now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  error_message        text,
  retry_count          int DEFAULT 0,
  created_by_user_id   uuid,

  -- Payload snapshot (the worker needs this so we don't re-query everything)
  payload              jsonb NOT NULL
);

CREATE INDEX idx_medidata_submission_jobs_status ON medidata_submission_jobs(status, created_at);
CREATE INDEX idx_medidata_submission_jobs_invoice_id ON medidata_submission_jobs(invoice_id);
CREATE INDEX idx_medidata_submission_jobs_patient_id ON medidata_submission_jobs(patient_id);
CREATE INDEX idx_medidata_submission_jobs_created_by_user_id ON medidata_submission_jobs(created_by_user_id);
```

The `payload` JSON contains everything `POST /api/medidata/send-invoice` needs:
- `billingType`, `lawType`, `reminderLevel`, `diagnosisCodes`, `treatmentReason`
- `insurerGln`, `insurerName`, `insurerAddress`
- `policyNumber`, `avsNumber`, `caseNumber`, `accidentDate`
- `language`, `skipValidation`

---

## Phase 2 — Vercel API Routes

### `POST /api/medidata/queue-submission`
- Accepts the same body as `/api/medidata/send-invoice`
- Validates required fields (invoiceId, patientId, insurerGln, etc.)
- Inserts a `medidata_submission_jobs` row with `status: pending`
- Dedupes: if a pending/processing job already exists for the same `invoice_id`, returns the existing job instead of creating a duplicate
- Returns immediately: `{ jobId, status, message }`

### `GET /api/medidata/submission-jobs`
- Returns recent jobs for the current user (last 50, last 24h)
- Query params: `limit`, `patientId`, `status`
- Used by the notification panel

### `GET /api/medidata/submission-jobs/[invoiceId]`
- Returns jobs for a specific invoice
- Used for in-progress indicators on generate/send buttons

### `GET /api/cron/process-submission-jobs`
- Vercel Cron route (registered in `vercel.json` every minute)
- Verifies `Authorization: Bearer ${CRON_SECRET}`
- Fetches the oldest pending job
- Marks it `processing`
- Calls `POST /api/medidata/send-invoice` with the job payload
- On success: stores the returned `submissionId`, marks `completed`, copies `medidata_message_id` / status if returned
- On failure: increments `retry_count`, marks `pending` again (retry up to 3 times), then `failed`
- Processes **one job per run** to stay within the 60s Vercel function timeout

---

## Phase 3 — Vercel Cron Configuration

Add to `vercel.json`:

```json
{
  "path": "/api/cron/process-submission-jobs",
  "schedule": "*/1 * * * *"
}
```

---

## Phase 4 — Frontend: Notification Panel

Extend `HeaderNotificationsButton.tsx` to add a third tab:
- **Emails**
- **PDFs**
- **Insurance**

The Insurance tab shows:
- Job status: ⏳ Queued / 🔄 Processing / ✅ Sent / ❌ Failed
- Invoice number + patient name
- Time ago
- Error reason on failure (expandable)
- Click → opens patient page on invoice tab

The existing `PDFJobNotificationsContext` should be renamed/generalized to a single `JobNotificationsContext` that covers both PDF and Insurance jobs, or a separate `InsuranceSubmissionNotificationsContext` can be created. For simplicity, rename/generalize the existing context so the header panel can read both.

---

## Phase 5 — In-Progress Signals on Send Buttons

When a pending/processing submission job exists for an invoice:
- The **Insurance** button on the invoice row shows `⏳` and is disabled
- The **Send to insurance** button in `InsuranceBillingModal` is disabled and shows a loading state
- The bulk send dialog shows queued rows as "queued" / "sending"

---

## Phase 6 — Replace Synchronous Sends with Queue Calls

### A. Patient page — `MedicalConsultationsCard.tsx` / `InsuranceBillingModal.tsx`
- In `InsuranceBillingModal.handleSubmit()`:
  - Instead of `await fetch('/api/medidata/send-invoice')`, call `POST /api/medidata/queue-submission`
  - Close the modal and show a toast: "Insurance submission queued"
  - The notification panel will update when the job finishes

### B. Invoices page — `src/app/invoices/page.tsx`
- Single send via the insurance modal:
  - Same change: the modal now queues instead of blocking
- Bulk send (`handleBulkInsuranceSend`):
  - For each ready invoice, call `POST /api/medidata/queue-submission` (fire-and-forget, don't await sequentially)
  - Show a summary toast: "N submissions queued"
  - Close the bulk dialog; notification panel will track progress

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Vercel Cron 1 job/minute | For low-volume submissions this is fine. If volume grows, move to a persistent worker. |
| 60s function timeout | One job per run; send-invoice is usually fast, but if it exceeds 60s the job retries and then fails. |
| Duplicate submissions | Queue API dedupes pending/processing jobs per `invoice_id`. |
| Failed job loops | Max `retry_count = 3`; after that status is `failed` permanently. |
| User doesn't see result | Notification panel polls every 30s (5s when open) and shows status. |

---

## Files to Create / Modify

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_medidata_submission_jobs.sql` | New migration |
| `src/app/api/medidata/queue-submission/route.ts` | New API route |
| `src/app/api/medidata/submission-jobs/route.ts` | New API route |
| `src/app/api/medidata/submission-jobs/[invoiceId]/route.ts` | New API route |
| `src/app/api/cron/process-submission-jobs/route.ts` | New Vercel Cron worker |
| `vercel.json` | Add cron schedule |
| `src/components/JobNotificationsContext.tsx` (rename from PDFJobNotificationsContext) | Handle both PDF and Insurance jobs |
| `src/components/HeaderNotificationsButton.tsx` | Add Insurance tab |
| `src/components/InsuranceBillingModal.tsx` | Queue instead of blocking send |
| `src/app/invoices/page.tsx` | Bulk + single send use queue; in-progress indicators |
| `src/app/patients/[id]/MedicalConsultationsCard.tsx` | In-progress indicator for insurance |
| `docs/ASYNC_INSURANCE_SUBMISSION_PLAN.md` | This plan |

---

## Future Improvements

- Move from Vercel Cron to a persistent worker (Railway / VPS) for higher throughput and no timeout risk.
- Add a "Send to patient" action inside the Insurance notification tab after the submission is accepted by the insurer.
- Add a "Retry" button for failed jobs directly from the notification panel.