-- Migration: Add foreign key from pdf_generation_jobs.patient_id to patients.id
-- Date: 2026-06-22
-- This is needed so the Supabase client can join patient details in the
-- pdf-jobs API used by the notification panel.

ALTER TABLE pdf_generation_jobs
ADD CONSTRAINT pdf_generation_jobs_patient_id_fkey
FOREIGN KEY (patient_id) REFERENCES patients(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pdf_jobs_patient_id ON pdf_generation_jobs(patient_id);
