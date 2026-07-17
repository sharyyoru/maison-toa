-- Refine filter options to only show clean service/treatment names
-- from the catalog tables, not raw parsed reason text.
CREATE OR REPLACE FUNCTION get_laura_bookings_filters()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_statuses jsonb;
  v_sources jsonb;
  v_services jsonb;
BEGIN
  SELECT jsonb_agg(DISTINCT status ORDER BY status)
  INTO v_statuses
  FROM appointments
  WHERE is_demo = false
    AND no_patient = false;

  SELECT jsonb_agg(DISTINCT source ORDER BY source)
  INTO v_sources
  FROM appointments
  WHERE is_demo = false
    AND no_patient = false
    AND source IS NOT NULL;

  SELECT COALESCE(jsonb_agg(name ORDER BY name), '[]'::jsonb)
  INTO v_services
  FROM (
    SELECT name FROM booking_treatments WHERE name IS NOT NULL AND name <> ''
    UNION
    SELECT name FROM services WHERE name IS NOT NULL AND name <> ''
    ORDER BY name
    LIMIT 500
  ) sub;

  RETURN jsonb_build_object(
    'statuses', COALESCE(v_statuses, '[]'::jsonb),
    'sources', COALESCE(v_sources, '[]'::jsonb),
    'services', v_services
  );
END;
$$;
