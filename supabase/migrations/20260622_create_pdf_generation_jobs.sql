-- Migration: Create pdf_generation_jobs table for async PDF generation
-- Date: 2026-06-22

CREATE TABLE IF NOT EXISTS pdf_generation_jobs (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id         uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  invoice_type       text NOT NULL DEFAULT 'tg',  -- tg | tp | reminder | receipt
  reminder_level     int DEFAULT 1,               -- 1 | 2 | 3 (only for reminder type)
  status             text NOT NULL DEFAULT 'pending', -- pending | processing | completed | failed
  created_at         timestamptz DEFAULT now(),
  started_at         timestamptz,
  completed_at       timestamptz,
  error_message      text,
  pdf_path           text,
  pdf_url            text,
  retry_count        int DEFAULT 0,
  created_by_user_id uuid,
  patient_id         uuid,  -- denormalised for easy notification linking
  invoice_number     text   -- denormalised for display
);

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_status ON pdf_generation_jobs(status, created_at);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_invoice_id ON pdf_generation_jobs(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_patient_id ON pdf_generation_jobs(patient_id);
CREATE INDEX IF NOT EXISTS idx_pdf_jobs_created_by_user_id ON pdf_generation_jobs(created_by_user_id);
