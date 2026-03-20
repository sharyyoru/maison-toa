-- Migration: Add missing tables and columns for Maison Toa
-- Date: 2026-03-21

-- 1. Add 'code' column to services table
ALTER TABLE services ADD COLUMN IF NOT EXISTS code text;

-- 2. Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id uuid REFERENCES patients(id) ON DELETE SET NULL,
  consultation_id uuid REFERENCES consultations(id) ON DELETE SET NULL,
  invoice_number text NOT NULL,
  invoice_date timestamptz DEFAULT now(),
  due_date timestamptz,
  doctor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  doctor_name text,
  provider_id uuid,
  provider_name text,
  payment_method text,
  total_amount numeric(12,2) NOT NULL DEFAULT 0,
  paid_amount numeric(12,2) DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  is_complimentary boolean DEFAULT false,
  is_archived boolean DEFAULT false,
  pdf_path text,
  notes text,
  created_by_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_by_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoices_patient_id_idx ON invoices(patient_id);
CREATE INDEX IF NOT EXISTS invoices_consultation_id_idx ON invoices(consultation_id);
CREATE INDEX IF NOT EXISTS invoices_invoice_number_idx ON invoices(invoice_number);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);

-- 3. Create invoice_items table
CREATE TABLE IF NOT EXISTS invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  description text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  discount_percent numeric(5,2) DEFAULT 0,
  total_price numeric(12,2) NOT NULL DEFAULT 0,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS invoice_items_invoice_id_idx ON invoice_items(invoice_id);

-- 4. Create medication_templates table
CREATE TABLE IF NOT EXISTS medication_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  service_id uuid REFERENCES services(id) ON DELETE SET NULL,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medication_templates_service_id_idx ON medication_templates(service_id);
CREATE INDEX IF NOT EXISTS medication_templates_is_active_idx ON medication_templates(is_active);

-- 5. Create medication_template_items table
CREATE TABLE IF NOT EXISTS medication_template_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES medication_templates(id) ON DELETE CASCADE,
  product_name text NOT NULL,
  product_number integer,
  product_type text DEFAULT 'MEDICATION',
  intake_kind text DEFAULT 'FIXED',
  amount_morning text,
  amount_noon text,
  amount_evening text,
  amount_night text,
  quantity integer DEFAULT 1,
  intake_note text,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS medication_template_items_template_id_idx ON medication_template_items(template_id);

-- 6. Enable RLS on new tables
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE medication_template_items ENABLE ROW LEVEL SECURITY;

-- 7. Create RLS policies for invoices
CREATE POLICY "Authenticated users can view invoices"
  ON invoices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert invoices"
  ON invoices FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoices"
  ON invoices FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete invoices"
  ON invoices FOR DELETE
  TO authenticated
  USING (true);

-- 8. Create RLS policies for invoice_items
CREATE POLICY "Authenticated users can view invoice_items"
  ON invoice_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert invoice_items"
  ON invoice_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update invoice_items"
  ON invoice_items FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete invoice_items"
  ON invoice_items FOR DELETE
  TO authenticated
  USING (true);

-- 9. Create RLS policies for medication_templates
CREATE POLICY "Authenticated users can view medication_templates"
  ON medication_templates FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert medication_templates"
  ON medication_templates FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update medication_templates"
  ON medication_templates FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete medication_templates"
  ON medication_templates FOR DELETE
  TO authenticated
  USING (true);

-- 10. Create RLS policies for medication_template_items
CREATE POLICY "Authenticated users can view medication_template_items"
  ON medication_template_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert medication_template_items"
  ON medication_template_items FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update medication_template_items"
  ON medication_template_items FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can delete medication_template_items"
  ON medication_template_items FOR DELETE
  TO authenticated
  USING (true);
