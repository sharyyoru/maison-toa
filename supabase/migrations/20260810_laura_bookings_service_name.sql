-- Prefer the user-facing service label from the appointment reason, falling back to catalog names.
CREATE OR REPLACE FUNCTION get_laura_bookings_json(
  p_from date,
  p_to date,
  p_statuses text[] DEFAULT NULL,
  p_sources text[] DEFAULT NULL,
  p_services text[] DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_limit integer DEFAULT 500
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
  v_total integer;
  v_rows jsonb;
  v_from_tz timestamptz;
  v_to_tz timestamptz;
  v_service_patterns text[];
BEGIN
  v_from_tz := timezone('Europe/Zurich', p_from::timestamp);
  v_to_tz := timezone('Europe/Zurich', (p_to + 1)::timestamp) - interval '1 millisecond';

  IF p_services IS NOT NULL AND array_length(p_services, 1) IS NOT NULL THEN
    v_service_patterns := ARRAY(
      SELECT '%' || x || '%'
      FROM unnest(p_services) AS x
      WHERE length(trim(x)) > 0
    );
  END IF;

  SELECT count(*)
  INTO v_total
  FROM appointments a
  LEFT JOIN patients p ON a.patient_id = p.id
  LEFT JOIN providers pr ON a.provider_id = pr.id
  LEFT JOIN booking_treatments bt ON a.booking_treatment_id = bt.id
  LEFT JOIN services bt_s ON bt.linked_service_id = bt_s.id
  LEFT JOIN deals d ON a.deal_id = d.id
  LEFT JOIN services d_s ON d.service_id = d_s.id
  LEFT JOIN services s ON (a.service_ids[1] = s.id)
  WHERE a.is_demo = false
    AND a.no_patient = false
    AND a.start_time >= v_from_tz
    AND a.start_time <= v_to_tz
    AND (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL OR a.status::text = ANY(p_statuses))
    AND (p_sources IS NULL OR array_length(p_sources, 1) IS NULL OR a.source = ANY(p_sources))
    AND (v_service_patterns IS NULL OR COALESCE(NULLIF(split_part(a.reason, ' [', 1), ''), bt.name, s.name, d_s.name, a.category, '') ILIKE ANY(v_service_patterns));

  SELECT COALESCE(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb)
  INTO v_rows
  FROM (
    SELECT
      a.id,
      p.id AS patient_id,
      p.first_name AS patient_first_name,
      p.last_name AS patient_last_name,
      p.email AS patient_email,
      p.phone AS patient_phone,
      p.dob AS patient_dob,
      a.start_time,
      a.end_time,
      a.status,
      CASE
        WHEN a.status IN ('scheduled', 'confirmed', 'completed') THEN 'confirmed'
        WHEN a.status = 'cancelled' THEN 'cancelled'
        WHEN a.status = 'no_show' THEN 'no_show'
        ELSE 'other'
      END AS status_group,
      a.reason,
      a.title,
      a.notes,
      a.location,
      a.source,
      COALESCE(
        (COALESCE(a.tracking_params, '{}'::jsonb))->>'utm_source',
        (COALESCE(a.tracking_params, '{}'::jsonb))->>'source',
        a.source
      ) AS channel,
      CASE
        WHEN a.source = 'online_booking' AND (
          (COALESCE(a.tracking_params, '{}'::jsonb))->>'utm_source' ILIKE ANY (ARRAY['%meta%', '%facebook%', '%instagram%', '%fb%'])
          OR (COALESCE(a.tracking_params, '{}'::jsonb))->>'utm_medium' ILIKE ANY (ARRAY['%cpc%', '%paid_social%', '%paid%'])
          OR (COALESCE(a.tracking_params, '{}'::jsonb))->>'utm_campaign' ILIKE ANY (ARRAY['%meta%', '%facebook%', '%instagram%'])
          OR ((COALESCE(a.tracking_params, '{}'::jsonb))->>'fbclid') IS NOT NULL
        ) THEN 'meta_ads'
        WHEN a.source = 'online_booking' THEN 'online_booking'
        WHEN a.source = 'manual' THEN 'manual'
        WHEN a.source = 'ai' THEN 'ai'
        ELSE 'other'
      END AS channel_group,
      a.tracking_params,
      COALESCE(NULLIF(split_part(a.reason, ' [', 1), ''), bt.name, s.name, d_s.name, a.category, '') AS service_name,
      COALESCE(NULLIF(d.value, 0), bt_s.base_price, s.base_price, d_s.base_price) AS price,
      d.value AS deal_value,
      'CHF' AS currency,
      pr.name AS provider_name,
      CASE
        WHEN a.reason ILIKE '%[Doctor:%' THEN
          trim(both ' ' from substring(a.reason from '\[Doctor: ([^\]]+)\]'))
        ELSE pr.name
      END AS doctor_name,
      a.created_at,
      v_total AS total_count
    FROM appointments a
    LEFT JOIN patients p ON a.patient_id = p.id
    LEFT JOIN providers pr ON a.provider_id = pr.id
    LEFT JOIN booking_treatments bt ON a.booking_treatment_id = bt.id
    LEFT JOIN services bt_s ON bt.linked_service_id = bt_s.id
    LEFT JOIN deals d ON a.deal_id = d.id
    LEFT JOIN services d_s ON d.service_id = d_s.id
    LEFT JOIN services s ON (a.service_ids[1] = s.id)
    WHERE a.is_demo = false
      AND a.no_patient = false
      AND a.start_time >= v_from_tz
      AND a.start_time <= v_to_tz
      AND (p_statuses IS NULL OR array_length(p_statuses, 1) IS NULL OR a.status::text = ANY(p_statuses))
      AND (p_sources IS NULL OR array_length(p_sources, 1) IS NULL OR a.source = ANY(p_sources))
      AND (v_service_patterns IS NULL OR COALESCE(NULLIF(split_part(a.reason, ' [', 1), ''), bt.name, s.name, d_s.name, a.category, '') ILIKE ANY(v_service_patterns))
    ORDER BY a.start_time ASC
    OFFSET ((p_page - 1) * p_limit) LIMIT p_limit
  ) row_data;

  RETURN jsonb_build_object(
    'data', COALESCE(v_rows, '[]'::jsonb),
    'total', COALESCE(v_total, 0)
  );
END;
$$;
