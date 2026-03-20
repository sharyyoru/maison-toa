-- Migration: Create patient_form_submissions table for storing form responses
-- Forms are linked to patients via a secure token system

CREATE TABLE IF NOT EXISTS patient_form_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
    form_id TEXT NOT NULL,
    form_name TEXT NOT NULL,
    submission_data JSONB NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'submitted', 'reviewed')),
    reviewed_by UUID REFERENCES users(id),
    reviewed_at TIMESTAMPTZ,
    notes TEXT,
    token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days')
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_patient_form_submissions_patient_id ON patient_form_submissions(patient_id);
CREATE INDEX IF NOT EXISTS idx_patient_form_submissions_form_id ON patient_form_submissions(form_id);
CREATE INDEX IF NOT EXISTS idx_patient_form_submissions_token ON patient_form_submissions(token);
CREATE INDEX IF NOT EXISTS idx_patient_form_submissions_status ON patient_form_submissions(status);

-- RLS policies
ALTER TABLE patient_form_submissions ENABLE ROW LEVEL SECURITY;

-- Staff can view all form submissions
CREATE POLICY "Staff can view all form submissions" ON patient_form_submissions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'staff', 'expert')
        )
    );

-- Staff can insert form submissions (when sending form link)
CREATE POLICY "Staff can insert form submissions" ON patient_form_submissions
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'staff', 'expert')
        )
    );

-- Staff can update form submissions
CREATE POLICY "Staff can update form submissions" ON patient_form_submissions
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE users.id = auth.uid()
            AND users.role IN ('admin', 'staff', 'expert')
        )
    );

-- Allow anonymous access for form submission via token (public form filling)
CREATE POLICY "Anyone can view form by valid token" ON patient_form_submissions
    FOR SELECT
    USING (
        token IS NOT NULL 
        AND expires_at > NOW()
    );

CREATE POLICY "Anyone can update form by valid token" ON patient_form_submissions
    FOR UPDATE
    USING (
        token IS NOT NULL 
        AND expires_at > NOW()
        AND status = 'pending'
    );

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_patient_form_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_patient_form_submissions_updated_at
    BEFORE UPDATE ON patient_form_submissions
    FOR EACH ROW
    EXECUTE FUNCTION update_patient_form_submissions_updated_at();

-- Add comment for documentation
COMMENT ON TABLE patient_form_submissions IS 'Stores patient form submissions including consent forms, questionnaires, and pre-operative instructions';
COMMENT ON COLUMN patient_form_submissions.form_id IS 'Unique identifier for the form type (e.g., anesthesia-consent-fr)';
COMMENT ON COLUMN patient_form_submissions.submission_data IS 'JSONB containing all form field responses';
COMMENT ON COLUMN patient_form_submissions.token IS 'Secure token for public form access';
