-- ============================================================
-- Invoices page: make get_invoices_page fit inside the 8s statement
-- timeout of the `authenticated` role.
--
-- With ~50k invoices the unfiltered page (the default view) failed with
-- "canceling statement due to statement timeout". The previous version
-- carried `invoices.*` (incl. the large raw_data JSON) through a
-- materialized CTE that was scanned three times, plus a patients join on
-- every row just to support the search box, plus a second full heap scan
-- for the payment-method dropdown.
--
-- This version keeps exactly the same parameters, filters and JSON shape,
-- but:
--   * filters/aggregates over a narrow set of columns only;
--   * resolves the patient-name search once (patients matching the term)
--     instead of joining patients for every invoice;
--   * fetches the display columns only for the 50 rows of the current page;
--   * adds a partial covering index so the list, counts and summary are
--     served by an index-only scan instead of the wide invoices heap.
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_invoices_page_listing
  ON public.invoices (invoice_date DESC NULLS LAST)
  INCLUDE (
    id, patient_id, status, payment_method, billing_type, total_amount, paid_amount,
    is_complimentary, reminder_level, due_date, reminder_1_sent_at, reminder_2_sent_at,
    stop_reminders, medidata_processed_at, invoice_number, doctor_name
  )
  WHERE is_archived = false AND parent_invoice_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_medidata_submissions_invoice_created
  ON public.medidata_submissions (invoice_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.get_invoices_page(
  p_search text DEFAULT NULL,
  p_status text DEFAULT 'all',
  p_payment_method text DEFAULT 'all',
  p_billing_type text DEFAULT 'all',
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_insurance_filter text DEFAULT 'all',
  p_job_issue_filter text DEFAULT 'all',
  p_reminder_filter text DEFAULT 'all',
  p_page integer DEFAULT 0,
  p_limit integer DEFAULT 50
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH latest_ins AS (
    SELECT DISTINCT ON (invoice_id)
      invoice_id, status, created_at, insurance_response_date
    FROM medidata_submissions
    WHERE invoice_id IS NOT NULL
    ORDER BY invoice_id, created_at DESC
  ),
  job_issue AS (
    SELECT
      invoice_id,
      CASE WHEN COUNT(*) FILTER (WHERE src = 'pdf') > 0 THEN 'pdf_failed' ELSE 'insurance_failed' END AS issue
    FROM (
      SELECT invoice_id, 'pdf' AS src FROM pdf_generation_jobs WHERE status = 'failed' AND invoice_id IS NOT NULL
      UNION ALL
      SELECT invoice_id, 'ins' AS src FROM medidata_submission_jobs WHERE status = 'failed' AND invoice_id IS NOT NULL
    ) t
    GROUP BY invoice_id
  ),
  search_term AS (
    SELECT NULLIF(TRIM(COALESCE(p_search, '')), '') AS term
  ),
  search_patients AS (
    SELECT p.id
    FROM patients p, search_term s
    WHERE s.term IS NOT NULL
      AND (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || p_search || '%'
  ),
  base AS (
    SELECT
      i.id, i.invoice_date, i.status, i.payment_method, i.total_amount, i.paid_amount,
      i.is_complimentary, i.stop_reminders, i.medidata_processed_at,
      COALESCE(i.reminder_level, 0) AS rl,
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(i.due_date, i.invoice_date))) / 86400))::int AS overdue_base_days,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - i.reminder_1_sent_at)) / 86400)::int, 0) AS days_since_r1,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - i.reminder_2_sent_at)) / 86400)::int, 0) AS days_since_r2,
      li.status AS ins_status,
      LOWER(li.status) AS ins_status_lower,
      li.created_at AS ins_created_at,
      li.insurance_response_date AS ins_response_date,
      ji.issue AS job_issue_type
    FROM invoices i
    LEFT JOIN latest_ins li ON li.invoice_id = i.id
    LEFT JOIN job_issue ji ON ji.invoice_id = i.id
    CROSS JOIN search_term s
    WHERE i.is_archived = false
      AND i.parent_invoice_id IS NULL
      AND (p_status = 'all' OR i.status::text = p_status)
      AND (p_payment_method = 'all' OR i.payment_method = p_payment_method)
      AND (p_billing_type = 'all' OR UPPER(COALESCE(i.billing_type, '')) = UPPER(p_billing_type))
      AND (p_date_from IS NULL OR i.invoice_date::date >= p_date_from)
      AND (p_date_to IS NULL OR i.invoice_date::date <= p_date_to)
      AND (
        s.term IS NULL
        OR i.invoice_number ILIKE '%' || p_search || '%'
        OR i.doctor_name ILIKE '%' || p_search || '%'
        OR i.patient_id IN (SELECT id FROM search_patients)
      )
  ),
  categorized AS (
    SELECT
      base.*,
      (COALESCE(paid_amount, 0) > 0) AS invoice_paid,
      (ins_status IS NULL AND LOWER(COALESCE(payment_method, '')) = 'insurance') AS is_not_submitted,
      (ins_status_lower = 'rejected' AND NOT (COALESCE(paid_amount, 0) > 0)) AS is_rejected_unpaid,
      (medidata_processed_at IS NOT NULL) AS is_processed,
      (status::text IN ('PAID', 'CANCELLED')) AS reminder_is_paid,
      CASE
        WHEN stop_reminders THEN NULL
        WHEN rl = 0 AND overdue_base_days >= 35 THEN 1
        WHEN rl = 1 AND days_since_r1 >= 25 THEN 2
        WHEN rl = 2 AND days_since_r2 >= 20 THEN 3
        ELSE NULL
      END AS next_reminder_level
    FROM base
  ),
  final AS MATERIALIZED (
    SELECT
      id, invoice_date, status, total_amount, paid_amount, is_complimentary,
      ins_status, ins_created_at, ins_response_date, job_issue_type
    FROM categorized
    WHERE (
      p_insurance_filter = 'all'
      OR (p_insurance_filter = 'needs_action' AND (is_not_submitted OR is_rejected_unpaid))
      OR (p_insurance_filter = 'not_submitted' AND is_not_submitted)
      OR (p_insurance_filter = 'in_flight' AND ins_status_lower IN ('pending', 'transmitted', 'draft', 'delivered'))
      OR (p_insurance_filter = 'rejected' AND ins_status_lower = 'rejected')
      OR (p_insurance_filter = 'rejected_unpaid' AND is_rejected_unpaid)
      OR (p_insurance_filter = 'rejected_unprocessed' AND is_rejected_unpaid AND NOT is_processed)
      OR (p_insurance_filter = 'rejected_processed' AND is_rejected_unpaid AND is_processed)
      OR (p_insurance_filter = 'rejected_paid' AND ins_status_lower = 'rejected' AND invoice_paid)
      OR (p_insurance_filter = 'accepted' AND ins_status_lower IN ('accepted', 'paid', 'partially_paid'))
    )
    AND (
      p_job_issue_filter = 'all'
      OR (p_job_issue_filter = 'any_failed' AND job_issue_type IS NOT NULL)
      OR (p_job_issue_filter = 'pdf_failed' AND job_issue_type = 'pdf_failed')
      OR (p_job_issue_filter = 'insurance_failed' AND job_issue_type = 'insurance_failed')
    )
    AND (
      p_reminder_filter = 'all'
      OR (p_reminder_filter = 'r1_due' AND NOT reminder_is_paid AND NOT stop_reminders AND rl = 0 AND overdue_base_days >= 35)
      OR (p_reminder_filter = 'r2_due' AND NOT reminder_is_paid AND NOT stop_reminders AND rl = 1 AND days_since_r1 >= 25)
      OR (p_reminder_filter = 'r3_due' AND NOT reminder_is_paid AND NOT stop_reminders AND rl = 2 AND days_since_r2 >= 20)
      OR (p_reminder_filter = 'r1_sent' AND rl >= 1)
      OR (p_reminder_filter = 'r2_sent' AND rl >= 2)
      OR (p_reminder_filter = 'r3_sent' AND rl >= 3)
      OR (p_reminder_filter = 'any_due' AND NOT reminder_is_paid AND next_reminder_level IS NOT NULL)
      OR (p_reminder_filter = 'stopped' AND stop_reminders)
    )
  ),
  page_rows AS (
    SELECT * FROM final
    ORDER BY invoice_date DESC NULLS LAST, id
    LIMIT p_limit OFFSET (p_page * p_limit)
  )
  SELECT jsonb_build_object(
    'totalCount', (SELECT COUNT(*) FROM final),
    -- Summary cards reflect the ENTIRE filtered set, not just the page.
    'summary', (
      SELECT jsonb_build_object(
        'count', COUNT(*),
        'total', COALESCE(SUM(total_amount), 0),
        'paid', COALESCE(SUM(COALESCE(paid_amount, 0)), 0),
        'unpaid', COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
      )
      FROM final
      WHERE is_complimentary = false
        AND status::text <> 'CANCELLED'
        AND COALESCE(total_amount, 0) > 0
    ),
    'rows', (
      SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT
          i.id, i.patient_id, i.invoice_number, i.invoice_date, i.due_date, i.doctor_user_id, i.doctor_name,
          i.provider_id, i.provider_name, i.payment_method, i.total_amount, i.paid_amount, i.status, i.is_complimentary,
          i.pdf_path, i.pdf_path_tg, i.pdf_path_tp, i.pdf_path_reminder, i.pdf_path_receipt, i.pdf_generated_at, i.updated_at,
          i.created_by_user_id, i.created_by_name, i.is_archived, i.health_insurance_law, i.billing_type,
          i.reminder_level, i.reminder_1_sent_at, i.reminder_2_sent_at, i.reminder_3_sent_at,
          i.medidata_processed_at, i.medidata_processed_by, i.stop_reminders,
          pr.ins_status AS latest_insurance_status,
          pr.ins_created_at AS latest_insurance_created_at,
          pr.ins_response_date AS latest_insurance_response_date,
          pr.job_issue_type AS latest_job_issue
        FROM page_rows pr
        JOIN invoices i ON i.id = pr.id
        ORDER BY pr.invoice_date DESC NULLS LAST, pr.id
      ) t
    ),
    'paymentMethods', (
      SELECT COALESCE(jsonb_agg(DISTINCT payment_method), '[]'::jsonb)
      FROM invoices
      WHERE is_archived = false AND parent_invoice_id IS NULL AND payment_method IS NOT NULL
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_invoices_page(text, text, text, text, date, date, text, text, text, integer, integer) TO anon, authenticated;
