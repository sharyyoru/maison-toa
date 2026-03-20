-- Add 'medication' to the consultation_record_type enum
-- This allows medication records created from MedicationCard to appear in consultations list

ALTER TYPE consultation_record_type ADD VALUE IF NOT EXISTS 'medication';
