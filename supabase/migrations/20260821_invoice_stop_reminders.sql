-- BILL-004.2: Let billing staff manually stop reminder letters/emails for
-- a specific invoice ("Stop Reminder" / "Stopper les rappels"). This is a
-- simple per-invoice opt-out flag checked wherever a reminder level is
-- computed/sent — it does not alter reminder_level/*_sent_at history.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS stop_reminders BOOLEAN NOT NULL DEFAULT false;

-- Partial index: only rows with reminders stopped are ever filtered on
-- (main Invoices page "Stop Reminder" filter), so a partial index keeps it
-- small and cheap regardless of table size.
CREATE INDEX IF NOT EXISTS invoices_stop_reminders_idx
  ON invoices(stop_reminders)
  WHERE stop_reminders = true;
