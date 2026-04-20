-- Script to update all user_availability locations to "Lausanne"
-- Run this in Supabase SQL Editor

-- 1. First, check what records will be updated (dry run)
SELECT 
  id,
  user_id,
  day_of_week,
  location,
  'Lausanne' as new_location
FROM user_availability
WHERE location IN ('Rhône', 'rhone', 'Champel', 'champel', 'Gstaad', 'gstaad', 'Montreux', 'montreux', 'Geneva', 'geneva')
ORDER BY user_id, day_of_week;

-- 2. View count of records by location before update
SELECT 
  location,
  COUNT(*) as record_count
FROM user_availability
GROUP BY location
ORDER BY record_count DESC;

-- 3. Update all location variants to "Lausanne"
UPDATE user_availability
SET location = 'Lausanne'
WHERE location IN (
  'Rhône', 
  'rhone', 
  'Champel', 
  'champel', 
  'Gstaad', 
  'gstaad', 
  'Montreux', 
  'montreux', 
  'Geneva', 
  'geneva'
);

-- 4. Verify the update - check location distribution after update
SELECT 
  location,
  COUNT(*) as record_count
FROM user_availability
GROUP BY location
ORDER BY record_count DESC;

-- 5. (Optional) If you want to update ALL records to Lausanne regardless of current value:
-- UPDATE user_availability
-- SET location = 'Lausanne';
