-- ============================================================
-- Billing Migration — Phase 0
-- Run via Supabase SQL Editor on project mwtdhbllkzuryswrumrd
-- All statements are idempotent (ADD COLUMN IF NOT EXISTS).
-- ============================================================

-- 1. qual_dignities on providers (required for TARDOC AddDignity / BUG-8)
ALTER TABLE providers ADD COLUMN IF NOT EXISTS qual_dignities text[] DEFAULT '{}';

-- 2. tax_point_value override on tardoc_groups (MISSING-6)
ALTER TABLE tardoc_groups ADD COLUMN IF NOT EXISTS tax_point_value numeric DEFAULT NULL;

-- 3. Storno columns on medidata_submissions (MISSING-1 — cancel-invoice workflow)
ALTER TABLE medidata_submissions ADD COLUMN IF NOT EXISTS is_storno boolean DEFAULT false;
ALTER TABLE medidata_submissions ADD COLUMN IF NOT EXISTS parent_submission_id uuid
  REFERENCES medidata_submissions(id) ON DELETE SET NULL;
ALTER TABLE medidata_submissions ADD COLUMN IF NOT EXISTS storno_reason text;

-- 4. pdf_path columns on invoices (should already exist from 20260512 migration)
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_tg text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_tp text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_reminder text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_receipt text;
