-- Create calendar_defaults table to store which calendars should be open by default (per user)
CREATE TABLE IF NOT EXISTS calendar_defaults (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  provider_id UUID NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure unique user + provider combination
CREATE UNIQUE INDEX IF NOT EXISTS calendar_defaults_user_provider_key ON calendar_defaults(user_id, provider_id);

CREATE INDEX IF NOT EXISTS calendar_defaults_user_id_idx ON calendar_defaults(user_id);
