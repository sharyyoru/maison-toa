-- Migration: Create site_settings table for storing app-wide key/value config
-- Date: 2026-04-17

CREATE TABLE IF NOT EXISTS site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

-- Allow service role full access (used by API routes via supabaseAdmin)
ALTER TABLE site_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role can read site_settings"
  ON site_settings FOR SELECT
  TO service_role
  USING (true);

CREATE POLICY "Service role can insert site_settings"
  ON site_settings FOR INSERT
  TO service_role
  WITH CHECK (true);

CREATE POLICY "Service role can update site_settings"
  ON site_settings FOR UPDATE
  TO service_role
  USING (true);

CREATE POLICY "Service role can delete site_settings"
  ON site_settings FOR DELETE
  TO service_role
  USING (true);
