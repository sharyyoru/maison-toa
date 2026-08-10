-- BILL-004.1: Allow billing staff to mark a rejected MediData invoice as
-- "Processed" once it has been corrected and resent, purely as a workflow
-- aid. This never touches the actual MediData/Sumex submission status
-- (medidata_submissions.status), which continues to reflect the 3rd
-- party's truth.
--
-- The flag lives on `invoices` (not `medidata_submissions`) because an
-- invoice can have multiple submission rows over its lifetime (original,
-- storno, resends after correction) and the workflow flag is tracked per
-- invoice, not per individual submission attempt.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS medidata_processed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS medidata_processed_by UUID REFERENCES users(id);

CREATE INDEX IF NOT EXISTS invoices_medidata_processed_at_idx ON invoices(medidata_processed_at);

-- Auto-reset: whenever a submission for an invoice transitions into (or is
-- created directly as) 'rejected', clear any existing "Processed" flag on
-- that invoice so it reappears in the "needs action" list. This covers
-- resubmissions (new row, inserted already rejected) as well as any
-- in-place status update on an existing row (e.g. the polling job).
CREATE OR REPLACE FUNCTION reset_invoice_medidata_processed_on_rejection()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'rejected'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.invoice_id IS NOT NULL THEN
    UPDATE invoices
    SET medidata_processed_at = NULL,
        medidata_processed_by = NULL
    WHERE id = NEW.invoice_id
      AND medidata_processed_at IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS medidata_submissions_reset_processed_on_rejection ON medidata_submissions;
CREATE TRIGGER medidata_submissions_reset_processed_on_rejection
  AFTER INSERT OR UPDATE ON medidata_submissions
  FOR EACH ROW
  EXECUTE FUNCTION reset_invoice_medidata_processed_on_rejection();
