-- ============================================================================
-- COMPLETE INVOICE PAYMENT SYSTEM SETUP FOR SUPABASE
-- Run this entire script in your Supabase SQL Editor
-- ============================================================================

-- Step 1: Add new columns to consultations table
-- ============================================================================
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS payment_link_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_link_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMPTZ;

-- Step 2: Create indexes for performance
-- ============================================================================
CREATE INDEX IF NOT EXISTS consultations_payment_link_token_idx 
  ON consultations(payment_link_token) 
  WHERE payment_link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultations_invoice_pdf_path_idx 
  ON consultations(invoice_pdf_path) 
  WHERE invoice_pdf_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultations_stripe_payment_intent_idx 
  ON consultations(stripe_payment_intent_id) 
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Step 3: Create storage bucket for invoice PDFs
-- ============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Step 4: Enable Row Level Security on consultations
-- ============================================================================
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- Step 5: Drop existing policies if they exist (to avoid conflicts)
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can view all consultations" ON consultations;
DROP POLICY IF EXISTS "Authenticated users can insert consultations" ON consultations;
DROP POLICY IF EXISTS "Authenticated users can update consultations" ON consultations;
DROP POLICY IF EXISTS "Authenticated users can delete consultations" ON consultations;
DROP POLICY IF EXISTS "Public can view consultation via payment link token" ON consultations;

-- Step 6: Create RLS policies for consultations table
-- ============================================================================

-- Allow authenticated users full access
CREATE POLICY "Authenticated users can view all consultations"
ON consultations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert consultations"
ON consultations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update consultations"
ON consultations FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete consultations"
ON consultations FOR DELETE
TO authenticated
USING (true);

-- Allow public access via valid payment link token (magic link)
CREATE POLICY "Public can view consultation via payment link token"
ON consultations FOR SELECT
TO public
USING (
  payment_link_token IS NOT NULL 
  AND payment_link_expires_at > NOW()
);

-- Step 7: Drop existing storage policies if they exist
-- ============================================================================
DROP POLICY IF EXISTS "Authenticated users can upload invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Public can read invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete invoice PDFs" ON storage.objects;

-- Step 8: Create RLS policies for invoice-pdfs storage bucket
-- ============================================================================

-- Allow authenticated users to upload
CREATE POLICY "Authenticated users can upload invoice PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoice-pdfs');

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can read invoice PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'invoice-pdfs');

-- Allow public to read (for magic link access)
CREATE POLICY "Public can read invoice PDFs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoice-pdfs');

-- Allow authenticated users to update
CREATE POLICY "Authenticated users can update invoice PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'invoice-pdfs');

-- Allow authenticated users to delete
CREATE POLICY "Authenticated users can delete invoice PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'invoice-pdfs');

-- Step 9: Create function to generate secure payment link tokens
-- ============================================================================
CREATE OR REPLACE FUNCTION generate_payment_link_token()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  token TEXT;
BEGIN
  -- Generate a secure random token (32 characters)
  token := encode(gen_random_bytes(24), 'base64');
  -- Make it URL-safe by replacing special characters
  token := replace(replace(replace(token, '+', '-'), '/', '_'), '=', '');
  RETURN token;
END;
$$;

-- Step 10: Grant execute permission on the function
-- ============================================================================
GRANT EXECUTE ON FUNCTION generate_payment_link_token() TO authenticated;
GRANT EXECUTE ON FUNCTION generate_payment_link_token() TO anon;

-- ============================================================================
-- SETUP COMPLETE!
-- ============================================================================
-- Next steps:
-- 1. Add environment variables to .env.local (see INVOICE_PAYMENT_SETUP.md)
-- 2. Test invoice generation from the patient page
-- 3. Verify QR code and payment link work correctly
-- ============================================================================

-- Verification queries (optional - run these to verify setup)
-- ============================================================================

-- Check if columns were added
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'consultations' 
  AND column_name IN (
    'payment_link_token', 
    'payment_link_expires_at', 
    'invoice_pdf_path', 
    'stripe_payment_intent_id', 
    'payment_completed_at'
  );

-- Check if bucket was created
SELECT * FROM storage.buckets WHERE id = 'invoice-pdfs';

-- Check if indexes were created
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'consultations' 
  AND indexname LIKE '%payment%';

-- Check if RLS policies were created
SELECT schemaname, tablename, policyname, roles, cmd 
FROM pg_policies 
WHERE tablename = 'consultations';

-- Test token generation function
SELECT generate_payment_link_token();
