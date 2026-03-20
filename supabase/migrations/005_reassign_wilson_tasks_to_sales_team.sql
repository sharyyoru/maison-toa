-- Migration: Reassign "New Request Open" tasks from Wilson to Sales Team (Round-Robin)
-- Date: 2026-01-10
-- Description: Redistributes "New Request Open for [Patient]" tasks from Wilson
--              to the 5 sales team members in round-robin fashion

-- Sales Team User IDs (from auth.users):
-- d74537b4-57be-57d0-b0bc-f369f56ead95 - Charline Brechotte
-- 98173cf6-1fd4-5f71-84c9-d5e5ccb11147 - Audrey Cochois  
-- 3b592990-ad9c-5579-868a-6d9439d57d0b - Victoria Jerome-Pierre
-- burbuqe.fazliu@aesthetics-ge.ch - Bubuque (need ID)
-- elite - Elite (need ID)

-- Wilson User IDs:
-- 5e9302f9-fd41-5c15-8d64-390ca8dd3625 (709 tasks)
-- 979efadd-efd5-5b75-b157-7faf6723d661 (33779 tasks)

-- STEP: Reassign "New Request Open" tasks using hardcoded IDs
WITH sales_team AS (
  SELECT * FROM (VALUES
    ('d74537b4-57be-57d0-b0bc-f369f56ead95'::uuid, 'Charline Brechotte', 0),
    ('98173cf6-1fd4-5f71-84c9-d5e5ccb11147'::uuid, 'Audrey Cochois', 1),
    ('3b592990-ad9c-5579-868a-6d9439d57d0b'::uuid, 'Victoria Jerome-Pierre', 2)
  ) AS t(id, full_name, team_index)
),
numbered_tasks AS (
  SELECT 
    t.id,
    ROW_NUMBER() OVER (ORDER BY t.created_at) - 1 as task_index
  FROM tasks t
  WHERE (t.assigned_user_id = '5e9302f9-fd41-5c15-8d64-390ca8dd3625'::uuid
     OR t.assigned_user_id = '979efadd-efd5-5b75-b157-7faf6723d661'::uuid
     OR LOWER(t.assigned_user_name) LIKE '%wilson%')
    AND t.name LIKE 'New Request Open%'
    AND t.status = 'not_started'
),
task_assignments AS (
  SELECT 
    nt.id as task_id,
    st.id as new_user_id,
    st.full_name as new_user_name
  FROM numbered_tasks nt
  JOIN sales_team st ON st.team_index = (nt.task_index % 3)
)
UPDATE tasks t
SET 
  assigned_user_id = ta.new_user_id,
  assigned_user_name = ta.new_user_name,
  updated_at = NOW()
FROM task_assignments ta
WHERE t.id = ta.task_id;

-- Verification query:
-- SELECT assigned_user_name, COUNT(*) as task_count 
-- FROM tasks 
-- WHERE name LIKE 'New Request Open%'
-- GROUP BY assigned_user_name 
-- ORDER BY task_count DESC;
