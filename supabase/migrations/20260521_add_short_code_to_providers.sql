-- Add short_code column to providers table for calendar initials/abbreviations
ALTER TABLE public.providers 
ADD COLUMN IF NOT EXISTS short_code TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN public.providers.short_code IS 'Short code/initials used for calendar display (e.g., WA for Wilson Ali)';
