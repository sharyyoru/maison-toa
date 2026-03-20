-- Migration: Add invoice_status and invoice_paid_amount columns for partial payment tracking
-- Date: 2026-02-10

-- Add invoice_status column to track detailed payment status
-- Possible values: OPEN, PAID, PARTIAL_PAID, OVERPAID, PARTIAL_LOSS, CANCELLED
ALTER TABLE consultations 
ADD COLUMN IF NOT EXISTS invoice_status TEXT DEFAULT 'OPEN';

-- Add invoice_paid_amount column to track actual amount paid
ALTER TABLE consultations 
ADD COLUMN IF NOT EXISTS invoice_paid_amount DECIMAL(10,2) DEFAULT NULL;

-- Add index for faster queries on invoice status
CREATE INDEX IF NOT EXISTS idx_consultations_invoice_status 
ON consultations(invoice_status) 
WHERE record_type = 'invoice';

-- Update existing records: set invoice_status based on invoice_is_paid
UPDATE consultations 
SET invoice_status = CASE 
  WHEN invoice_is_paid = true THEN 'PAID'
  ELSE 'OPEN'
END
WHERE record_type = 'invoice' AND invoice_status IS NULL;

-- For paid invoices without paid_amount, set it to the total amount
UPDATE consultations 
SET invoice_paid_amount = invoice_total_amount
WHERE record_type = 'invoice' 
  AND invoice_is_paid = true 
  AND invoice_paid_amount IS NULL
  AND invoice_total_amount IS NOT NULL;

COMMENT ON COLUMN consultations.invoice_status IS 'Detailed payment status: OPEN, PAID, PARTIAL_PAID, OVERPAID, PARTIAL_LOSS, CANCELLED';
COMMENT ON COLUMN consultations.invoice_paid_amount IS 'Actual amount paid by patient (may differ from invoice_total_amount for partial payments)';
