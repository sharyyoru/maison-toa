-- Generate scheduled workflow events in set-based database operations.
-- Newly inserted events are enqueued by workflow_events_enqueue_job.
CREATE OR REPLACE FUNCTION generate_scheduled_workflow_events(p_now timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  swiss_date date := (p_now AT TIME ZONE 'Europe/Zurich')::date;
  birthday_count integer := 0;
  overdue_count integer := 0;
  expired_membership_count integer := 0;
BEGIN
  INSERT INTO workflow_events (
    event_type,
    subject_type,
    subject_id,
    patient_id,
    occurred_at,
    payload,
    dedupe_key
  )
  SELECT
    'birthday',
    'patient',
    patient.id::text,
    patient.id,
    p_now,
    jsonb_build_object('birthday', patient.dob, 'year', extract(year FROM swiss_date)::integer),
    'birthday:' || patient.id::text || ':' || extract(year FROM swiss_date)::integer::text
  FROM patients AS patient
  WHERE patient.dob IS NOT NULL
    AND extract(month FROM patient.dob) = extract(month FROM swiss_date)
    AND extract(day FROM patient.dob) = extract(day FROM swiss_date)
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS birthday_count = ROW_COUNT;

  INSERT INTO workflow_events (
    event_type,
    subject_type,
    subject_id,
    patient_id,
    occurred_at,
    payload,
    dedupe_key
  )
  SELECT
    'invoice_overdue',
    'invoice',
    invoice.id::text,
    invoice.patient_id,
    p_now,
    jsonb_build_object(
      'id', invoice.id,
      'patient_id', invoice.patient_id,
      'due_date', invoice.due_date,
      'total_amount', invoice.total_amount,
      'paid_amount', invoice.paid_amount,
      'status', invoice.status
    ),
    'invoice_overdue:' || invoice.id::text
  FROM invoices AS invoice
  WHERE invoice.due_date < p_now
    AND invoice.status <> 'paid'
    AND coalesce(invoice.paid_amount, 0) < coalesce(invoice.total_amount, 0)
  ON CONFLICT (dedupe_key) DO NOTHING;
  GET DIAGNOSTICS overdue_count = ROW_COUNT;

  UPDATE patient_memberships
  SET status = 'expired', updated_at = p_now
  WHERE status = 'active'
    AND expires_at <= p_now;
  GET DIAGNOSTICS expired_membership_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'birthdays', birthday_count,
    'overdue_invoices', overdue_count,
    'expired_memberships', expired_membership_count
  );
END;
$$;

REVOKE ALL ON FUNCTION generate_scheduled_workflow_events(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION generate_scheduled_workflow_events(timestamptz) TO service_role;
