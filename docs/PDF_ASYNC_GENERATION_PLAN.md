# Async PDF Generation — Implementation Plan

## Decision: Vercel Cron (current implementation)

We initially planned a Railway worker, but the project does not currently have a working Railway deployment. To ship the async queue now, we use a Vercel Cron that runs every minute.

Trade-offs:
- Vercel Cron can only trigger once per minute, so it processes at most one job per minute (or a small batch if we later extend it).
- Vercel serverless functions have a 60s timeout (Hobby) or 300s timeout (Pro), so the cron intentionally processes one job per run to avoid being killed mid-generation.
- A persistent Railway worker is still the ideal long-term solution for higher throughput and no timeout risk.

---

## Architecture Overview

```
User clicks Generate / Invoice created
        ↓
POST /api/invoices/queue-pdf   (Vercel — returns immediately)
        ↓
pdf_generation_jobs row inserted (status: pending)
        ↓
Vercel Cron /api/cron/process-pdf-jobs runs every minute
        ↓
Picks up oldest pending job → calls Sumex via /api/invoices/generate-pdf
        ↓
Uploads PDF → updates job (completed/failed)
        ↓
Frontend polls /api/invoices/pdf-jobs → updates notification panel
```

---

## Phase 1 — Database Migration

New table `pdf_generation_jobs`:

```sql
CREATE TABLE pdf_generation_jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id        uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_type      text NOT NULL DEFAULT 'tg',  -- tg | tp | reminder | receipt
  reminder_level    int  DEFAULT 1,               -- 1 | 2 | 3 (only for reminder type)
  status            text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  created_at        timestamptz DEFAULT now(),
  started_at        timestamptz,
  completed_at      timestamptz,
  error_message     text,
  pdf_path          text,
  pdf_url           text,
  retry_count       int DEFAULT 0,
  created_by_user_id uuid,
  patient_id        uuid,  -- denormalised for easy notification linking
  invoice_number    text   -- denormalised for display
);

CREATE INDEX idx_pdf_jobs_status     ON pdf_generation_jobs(status, created_at);
CREATE INDEX idx_pdf_jobs_invoice_id ON pdf_generation_jobs(invoice_id);
```

---

## Phase 2 — Vercel API Routes

### `POST /api/invoices/queue-pdf`
- Accepts: `{ invoiceId, invoiceType, reminderLevel }`
- Inserts a `pdf_generation_jobs` row with status `pending`
- Returns immediately with `{ jobId }`
- Checks for existing pending/processing job for same invoice+type — skips duplicate

### `GET /api/invoices/pdf-jobs`
- Returns recent jobs for the current user's scope (last 50, last 24h)
- Used by the frontend notification panel (polls every 5s when panel open, every 30s in background)

### `GET /api/invoices/pdf-jobs/[invoiceId]`
- Returns all jobs for a specific invoice (used to show in-progress indicator on generate buttons)

---

## Phase 3 — Vercel Cron Worker

Create `src/app/api/cron/process-pdf-jobs/route.ts` and register it in `vercel.json`:

```json
{
  "path": "/api/cron/process-pdf-jobs",
  "schedule": "*/1 * * * *"
}
```

The cron handler:
1. Verifies the `Authorization: Bearer ${CRON_SECRET}` header.
2. Fetches the oldest pending `pdf_generation_jobs` row.
3. Marks it as `processing`.
4. Calls `POST /api/invoices/generate-pdf` with the invoice ID and type.
5. Updates the job to `completed` (with `pdf_path`/`pdf_url`) or `failed` (with `error_message` and incremented `retry_count`).
6. Retries up to 3 times before permanently failing.

To avoid Vercel's 60s function timeout, the cron intentionally processes **one job per invocation**. If you need higher throughput later, switch to a persistent Railway worker.

Required env vars on Vercel:
- `NEXT_PUBLIC_APP_URL` (or `VERCEL_URL` as fallback)
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET` (for Vercel Cron auth)

---

## Phase 4 — Frontend: Notification Panel

The header already has a notification bell (`HeaderNotificationsButton.tsx`).
Add a second tab "PDFs" alongside the existing emails tab (or a separate icon).

Panel shows:
- Job status: ⏳ Generating… / ✅ Done / ❌ Failed
- Invoice number + type (TG / TP / Reminder / Receipt)
- Time ago
- Reason on failure (expandable)
- Click → opens patient page on invoice tab
- Quick action button: "Send to patient" (only shown after completed, only if patient has email, shows ✉️ Sent if already emailed)

---

## Phase 5 — In-Progress Signals on Generate Buttons

When a pending/processing job exists for a given `(invoice_id, invoice_type)`:
- The PDF ▾ dropdown button for that type shows `⏳` instead of the type label
- Disabled so they can't double-queue
- Clears automatically when job completes

---

## Phase 6 — Auto-Queue on Invoice Creation

After the `invoices` insert in `MedicalConsultationsCard.tsx`:
- Fire `POST /api/invoices/queue-pdf` with `invoiceType: "tg"` (fire-and-forget, don't await)
- No change to the existing save flow — user doesn't wait
- TG is auto-queued; TP / Reminder / Receipt still require manual trigger

---

## Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Railway server down | Railway auto-restarts; jobs stay `pending` and are picked up on restart |
| Sumex takes >60s | No timeout issue — Railway worker has no serverless timeout |
| Sumex rate-limited | MAX_CONCURRENT = 2 caps simultaneous calls; sequential queue naturally throttles |
| Duplicate jobs | Queue API checks for existing pending/processing job before inserting |
| Failed job loops | Max retry_count = 3; after 3 failures status = `failed` permanently |
| Vercel polling load | Poll every 30s in background, 5s only when panel is open |

---

## Files to Create / Modify

| File | Action |
|---|---|
| `supabase/migrations/YYYYMMDD_pdf_generation_jobs.sql` | New migration |
| `src/app/api/invoices/queue-pdf/route.ts` | New API route |
| `src/app/api/invoices/pdf-jobs/route.ts` | New API route |
| `src/app/api/invoices/pdf-jobs/[invoiceId]/route.ts` | New API route |
| `src/app/api/cron/process-pdf-jobs/route.ts` | New Vercel Cron worker |
| `vercel.json` | Add cron schedule |
| `src/components/PDFJobNotificationsContext.tsx` | New context |
| `src/components/HeaderNotificationsButton.tsx` | Add PDF jobs tab |
| `src/app/patients/[id]/MedicalConsultationsCard.tsx` | Auto-queue on create + in-progress signals |
| `src/app/invoices/page.tsx` | Switch generate buttons to queue-pdf + in-progress signals |
