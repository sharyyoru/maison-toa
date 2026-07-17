-- ============================================================
-- Laura Bookings Export API
-- 1. Adds tracking_params to appointments for UTM/Meta channel attribution
-- 2. Adds organization_api_keys table for API key authentication
-- ============================================================

-- Store UTM / ad / campaign params captured at booking time.
-- Kept as jsonb so it can evolve without further migrations.
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS tracking_params jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_appointments_tracking_params
  ON appointments USING gin (tracking_params);

-- API keys scoped to an organization. organization_id is nullable for
-- single-tenant deployments that don't use the organizations feature.
CREATE TABLE IF NOT EXISTS organization_api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  key_hash text NOT NULL UNIQUE,
  scopes text[] DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  last_used_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organization_api_keys_key_hash
  ON organization_api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_organization_api_keys_organization
  ON organization_api_keys(organization_id);
