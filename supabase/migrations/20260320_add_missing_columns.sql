-- ============================================
-- Add Missing Database Columns
-- ============================================

-- CONSULTATIONS TABLE - Missing columns
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_status text DEFAULT 'OPEN';
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_id text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_paid_amount numeric(12, 2);
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS invoice_pdf_path text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payment_link_token text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payrexx_payment_link text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS payrexx_payment_status text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reference_number text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS diagnosis_code text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS ref_icd10 text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_id uuid;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_status text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS linked_invoice_number text;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS medidata_status text;

-- APPOINTMENTS TABLE - Missing columns
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS title text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_event_id text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- EMAILS TABLE - Missing columns
ALTER TABLE emails ADD COLUMN IF NOT EXISTS read_at timestamptz;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS scheduled_for timestamptz;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();
ALTER TABLE emails ADD COLUMN IF NOT EXISTS mailgun_message_id text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS in_reply_to text;
ALTER TABLE emails ADD COLUMN IF NOT EXISTS thread_id text;

-- DEAL_STAGES TABLE - Missing columns
ALTER TABLE deal_stages ADD COLUMN IF NOT EXISTS is_demo boolean DEFAULT false;

-- LEAD_IMPORTS TABLE - Create if not exists
CREATE TABLE IF NOT EXISTS lead_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename text NOT NULL,
  service text,
  total_leads integer,
  imported_count integer,
  failed_count integer,
  imported_patient_ids uuid[],
  errors text[],
  import_date timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS consultations_invoice_status_idx ON consultations(invoice_status);
CREATE INDEX IF NOT EXISTS emails_read_at_idx ON emails(read_at);
CREATE INDEX IF NOT EXISTS appointments_title_idx ON appointments(title);
