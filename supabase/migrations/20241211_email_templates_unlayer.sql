-- Add Unlayer design JSON and HTML columns to email_templates
ALTER TABLE email_templates 
ADD COLUMN IF NOT EXISTS design_json jsonb,
ADD COLUMN IF NOT EXISTS html_content text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz default now();

-- Update the email_template_type enum to include workflow templates
DO $$ BEGIN
  ALTER TYPE email_template_type ADD VALUE IF NOT EXISTS 'workflow';
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_templates_type ON email_templates(type);
