-- Migration: Add support flag timestamp to pdf_generation_jobs
-- Date: 2026-06-22

ALTER TABLE pdf_generation_jobs
ADD COLUMN IF NOT EXISTS support_flagged_at timestamptz,
ADD COLUMN IF NOT EXISTS support_flagged_by_user_id uuid;

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_support_flagged ON pdf_generation_jobs(support_flagged_at) WHERE support_flagged_at IS NOT NULL;
