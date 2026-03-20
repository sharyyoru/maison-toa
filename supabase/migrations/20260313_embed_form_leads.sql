-- Migration: Create embed_form_leads table for tracking leads from embedded forms
-- Date: 2026-03-13

-- Create embed_form_leads table
CREATE TABLE IF NOT EXISTS embed_form_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Personal info
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  country_code TEXT DEFAULT '+41',
  -- Lead details
  service TEXT,
  location TEXT,
  message TEXT,
  is_existing_patient BOOLEAN DEFAULT FALSE,
  -- Source tracking / Attribution
  form_type TEXT NOT NULL, -- 'contact', 'booking', etc.
  source_url TEXT, -- The URL where the form was embedded
  referrer TEXT, -- HTTP referrer
  utm_source TEXT,
  utm_medium TEXT,
  utm_campaign TEXT,
  utm_term TEXT,
  utm_content TEXT,
  -- Status
  status TEXT DEFAULT 'new', -- 'new', 'contacted', 'converted', 'closed'
  converted_to_patient_id UUID REFERENCES patients(id),
  converted_to_appointment_id UUID,
  -- Metadata
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for faster querying
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_created_at ON embed_form_leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_form_type ON embed_form_leads(form_type);
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_status ON embed_form_leads(status);
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_email ON embed_form_leads(email);
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_service ON embed_form_leads(service);
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_location ON embed_form_leads(location);
CREATE INDEX IF NOT EXISTS idx_embed_form_leads_utm_source ON embed_form_leads(utm_source);

-- Enable RLS
ALTER TABLE embed_form_leads ENABLE ROW LEVEL SECURITY;

-- Policy: Allow authenticated users to view all leads
CREATE POLICY "Allow authenticated users to view embed leads"
  ON embed_form_leads
  FOR SELECT
  TO authenticated
  USING (true);

-- Policy: Allow authenticated users to update leads
CREATE POLICY "Allow authenticated users to update embed leads"
  ON embed_form_leads
  FOR UPDATE
  TO authenticated
  USING (true);

-- Policy: Allow anon users to insert leads (from public embed forms)
CREATE POLICY "Allow anon users to insert embed leads"
  ON embed_form_leads
  FOR INSERT
  TO anon
  WITH CHECK (true);

-- Policy: Allow service role full access
CREATE POLICY "Allow service role full access to embed leads"
  ON embed_form_leads
  FOR ALL
  TO service_role
  USING (true);

-- Add comment
COMMENT ON TABLE embed_form_leads IS 'Tracks leads captured from embedded forms with full attribution data';
