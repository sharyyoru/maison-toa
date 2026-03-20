-- Migration: Add "Abandoned / Unanswered" stage to deal_stages
-- Date: 2026-01-29
-- Description: Adds the missing "Abandoned / Unanswered" deal stage for tracking lost/inactive leads

-- Insert the "Abandoned / Unanswered" stage if it doesn't exist
INSERT INTO deal_stages (name, type, sort_order, is_default)
SELECT 
  'Abandoned / Unanswered',
  'other',
  COALESCE((SELECT MAX(sort_order) FROM deal_stages), 0) + 1,
  false
WHERE NOT EXISTS (
  SELECT 1 FROM deal_stages WHERE LOWER(name) = 'abandoned / unanswered'
);

-- Also ensure the stage order is correct by updating sort_order
-- This places "Abandoned / Unanswered" at the end after "Closed Lost"
DO $$
DECLARE
  max_order INT;
BEGIN
  -- Get the current max sort_order
  SELECT COALESCE(MAX(sort_order), 0) INTO max_order FROM deal_stages;
  
  -- Update "Abandoned / Unanswered" to be at the end
  UPDATE deal_stages
  SET sort_order = max_order + 1
  WHERE LOWER(name) = 'abandoned / unanswered'
    AND sort_order <= max_order;
    
  RAISE NOTICE 'Added/Updated Abandoned / Unanswered stage';
END $$;
