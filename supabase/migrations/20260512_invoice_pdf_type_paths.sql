ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_tg text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_tp text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_reminder text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS pdf_path_receipt text;
