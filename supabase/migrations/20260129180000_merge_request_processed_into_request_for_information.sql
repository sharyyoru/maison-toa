-- Migration: Merge "Request Processed" stage into "Request for Information"
-- Date: 2026-01-29
-- Description: Removes the "Request Processed" deal stage and migrates all deals to "Request for Information"

-- Step 1: Get the IDs for both stages and update deals
DO $$
DECLARE
  request_info_stage_id UUID;
  request_processed_stage_id UUID;
BEGIN
  -- Find "Request for Information" stage ID
  SELECT id INTO request_info_stage_id
  FROM deal_stages
  WHERE LOWER(name) = 'request for information'
  LIMIT 1;

  -- Find "Request Processed" stage ID
  SELECT id INTO request_processed_stage_id
  FROM deal_stages
  WHERE LOWER(name) = 'request processed'
  LIMIT 1;

  -- Only proceed if both stages exist
  IF request_info_stage_id IS NOT NULL AND request_processed_stage_id IS NOT NULL THEN
    -- Update all deals from "Request Processed" to "Request for Information"
    UPDATE deals
    SET stage_id = request_info_stage_id,
        updated_at = NOW()
    WHERE stage_id = request_processed_stage_id;

    RAISE NOTICE 'Migrated deals from Request Processed to Request for Information';

    -- Delete the "Request Processed" stage
    DELETE FROM deal_stages
    WHERE id = request_processed_stage_id;

    RAISE NOTICE 'Deleted Request Processed stage';
  ELSIF request_processed_stage_id IS NOT NULL AND request_info_stage_id IS NULL THEN
    -- If only "Request Processed" exists, rename it to "Request for Information"
    UPDATE deal_stages
    SET name = 'Request for Information'
    WHERE id = request_processed_stage_id;

    RAISE NOTICE 'Renamed Request Processed to Request for Information';
  ELSE
    RAISE NOTICE 'No migration needed - Request Processed stage not found';
  END IF;
END $$;

-- Step 2: Reorder remaining stages to close the gap
-- Update sort_order for stages that come after the removed stage
DO $$
BEGIN
  -- Renumber all stages sequentially based on current order
  WITH ordered_stages AS (
    SELECT id, ROW_NUMBER() OVER (ORDER BY sort_order) as new_order
    FROM deal_stages
  )
  UPDATE deal_stages ds
  SET sort_order = os.new_order
  FROM ordered_stages os
  WHERE ds.id = os.id;

  RAISE NOTICE 'Reordered deal stages';
END $$;

-- Step 3: Ensure "Request for Information" is the default lead stage
UPDATE deal_stages
SET is_default = true, type = 'lead'
WHERE LOWER(name) = 'request for information';

-- Set is_default to false for all other stages
UPDATE deal_stages
SET is_default = false
WHERE LOWER(name) != 'request for information';
