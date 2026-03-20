-- Add last_emailed_at column to patient_prescriptions table
-- This tracks when a prescription/medication was last sent to the patient via email

ALTER TABLE public.patient_prescriptions
ADD COLUMN IF NOT EXISTS last_emailed_at timestamp with time zone;

-- Add comment for documentation
COMMENT ON COLUMN public.patient_prescriptions.last_emailed_at IS 'Timestamp when this prescription/medication was last sent to the patient via email';
