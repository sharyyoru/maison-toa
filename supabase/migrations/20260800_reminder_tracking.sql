-- Reminder tracking columns on invoices
-- reminder_level: 0 = no reminder sent, 1/2/3 = reminder level sent
-- reminder_N_sent_at: timestamp when each reminder was dispatched (print/email/medidata)

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_level int NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_1_sent_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_2_sent_at timestamptz;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS reminder_3_sent_at timestamptz;
