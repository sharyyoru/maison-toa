-- Migration: Add free-text notes column to invoices for printable remarks
-- Date: 2026-06-22

-- The invoices.notes column is used to store accountant-visible comments that are
-- printed on the generated Sumex invoice via the bstrRemark parameter.
ALTER TABLE IF EXISTS invoices
  ADD COLUMN IF NOT EXISTS notes text;
