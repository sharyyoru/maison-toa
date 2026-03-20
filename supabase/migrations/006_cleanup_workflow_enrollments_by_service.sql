-- Migration: Clean up workflow enrollments that don't match service conditions
-- This migration removes enrollments where the deal's service doesn't match 
-- the workflow's service condition criteria

-- Step 1: Create a temp table to store enrollments that should be deleted
CREATE TEMP TABLE enrollments_to_delete AS
WITH workflow_service_conditions AS (
  -- Extract service conditions from workflow configs
  SELECT 
    w.id as workflow_id,
    w.name as workflow_name,
    jsonb_array_elements(w.config->'nodes') as node
  FROM workflows w
  WHERE w.config->'nodes' IS NOT NULL
),
service_conditions AS (
  SELECT 
    workflow_id,
    workflow_name,
    node->'data'->>'field' as condition_field,
    node->'data'->'selectedServices' as selected_services,
    COALESCE(node->'data'->>'serviceMatchMode', 'includes') as match_mode
  FROM workflow_service_conditions
  WHERE node->>'type' = 'condition'
    AND node->'data'->>'field' = 'deal.service'
    AND jsonb_array_length(COALESCE(node->'data'->'selectedServices', '[]'::jsonb)) > 0
)
SELECT DISTINCT we.id as enrollment_id, we.workflow_id, we.deal_id, w.name as workflow_name, s.name as deal_service_name
FROM workflow_enrollments we
JOIN workflows w ON w.id = we.workflow_id
JOIN deals d ON d.id = we.deal_id
LEFT JOIN services s ON s.id = d.service_id
JOIN service_conditions sc ON sc.workflow_id = we.workflow_id
WHERE 
  -- Delete if match_mode is 'includes' and service doesn't match any selected
  (sc.match_mode = 'includes' AND (
    s.name IS NULL OR 
    NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(sc.selected_services) AS selected_service
      WHERE LOWER(selected_service) = LOWER(s.name)
    )
  ))
  OR
  -- Delete if match_mode is 'excludes' and service matches one of the excluded
  (sc.match_mode = 'excludes' AND s.name IS NOT NULL AND EXISTS (
    SELECT 1 FROM jsonb_array_elements_text(sc.selected_services) AS selected_service
    WHERE LOWER(selected_service) = LOWER(s.name)
  ));

-- Step 2: Delete enrollment steps for enrollments being removed
DELETE FROM workflow_enrollment_steps
WHERE enrollment_id IN (SELECT enrollment_id FROM enrollments_to_delete);

-- Step 3: Delete the incorrect enrollments
DELETE FROM workflow_enrollments
WHERE id IN (SELECT enrollment_id FROM enrollments_to_delete);

-- Step 4: Log how many were deleted (this will show in migration output)
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO deleted_count FROM enrollments_to_delete;
  RAISE NOTICE 'Cleaned up % workflow enrollments that did not match service conditions', deleted_count;
END $$;

-- Clean up temp table
DROP TABLE IF EXISTS enrollments_to_delete;
