-- Migration: Create async queue for Medidata insurance submissions
-- Date: 2026-06-22

CREATE TABLE IF NOT EXISTS medidata_submission_jobs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id           uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  patient_id           uuid REFERENCES patients(id) ON DELETE SET NULL,
  submission_id        uuid REFERENCES medidata_submissions(id) ON DELETE SET NULL,
  invoice_number       text,
  status               text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  created_at           timestamptz DEFAULT now(),
  started_at           timestamptz,
  completed_at         timestamptz,
  error_message        text,
  retry_count          int DEFAULT 0,
  created_by_user_id   uuid,
  support_flagged_at   timestamptz,
  support_flagged_by_user_id uuid,
  payload              jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_medidata_submission_jobs_status ON medidata_submission_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_medidata_submission_jobs_invoice_id ON medidata_submission_jobs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_medidata_submission_jobs_patient_id ON medidata_submission_jobs(patient_id);
CREATE INDEX IF NOT EXISTS idx_medidata_submission_jobs_created_by_user_id ON medidata_submission_jobs(created_by_user_id);
