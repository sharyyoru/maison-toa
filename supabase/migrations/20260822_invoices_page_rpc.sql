-- ============================================================
-- Invoices page: server-side, paginated, filtered invoice listing.
--
-- Previously the /invoices page fetched EVERY non-archived invoice
-- (47k+ rows) in a single unbounded query and did all filtering,
-- search and pagination in the browser. That query was silently
-- truncated at PostgREST's max-rows-per-request cap (10,000 on this
-- project), meaning older invoices were actually missing from the
-- page, on top of being slow (tens of MB transferred on every load).
--
-- This function mirrors the exact filter/search/reminder-due logic
-- that used to live in src/app/invoices/page.tsx (see `filtered`,
-- `overdueBaseDays`, `nextReminderLevel`, and the insurance-status
-- switch in the old client-side code) but runs entirely in the
-- database, returning only the current page + a total count.
-- ============================================================

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
  base AS (
    SELECT
      i.*,
      li.status AS ins_status,
      li.created_at AS ins_created_at,
      li.insurance_response_date AS ins_response_date,
      ji.issue AS job_issue_type
    FROM invoices i
    LEFT JOIN patients p ON p.id = i.patient_id
    LEFT JOIN latest_ins li ON li.invoice_id = i.id
    LEFT JOIN job_issue ji ON ji.invoice_id = i.id
    WHERE i.is_archived = false
      AND i.parent_invoice_id IS NULL
      AND (p_status = 'all' OR i.status::text = p_status)
      AND (p_payment_method = 'all' OR i.payment_method = p_payment_method)
      AND (p_billing_type = 'all' OR UPPER(COALESCE(i.billing_type, '')) = UPPER(p_billing_type))
      AND (p_date_from IS NULL OR i.invoice_date::date >= p_date_from)
      AND (p_date_to IS NULL OR i.invoice_date::date <= p_date_to)
      AND (
        p_search IS NULL OR LENGTH(TRIM(p_search)) = 0
        OR i.invoice_number ILIKE '%' || p_search || '%'
        OR i.doctor_name ILIKE '%' || p_search || '%'
        OR (COALESCE(p.first_name, '') || ' ' || COALESCE(p.last_name, '')) ILIKE '%' || p_search || '%'
      )
  ),
  enriched AS (
    SELECT
      base.*,
      LOWER(ins_status) AS ins_status_lower,
      (COALESCE(paid_amount, 0) > 0) AS invoice_paid,
      (LOWER(COALESCE(payment_method, '')) = 'insurance') AS is_insurance_invoice,
      (medidata_processed_at IS NOT NULL) AS is_processed
    FROM base
  ),
  categorized AS (
    SELECT
      enriched.*,
      (ins_status IS NULL AND is_insurance_invoice) AS is_not_submitted,
      (ins_status_lower = 'rejected' AND NOT invoice_paid) AS is_rejected_unpaid
    FROM enriched
  ),
  ins_job_filtered AS (
    SELECT * FROM categorized
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
  ),
  reminder_calc AS (
    SELECT
      ins_job_filtered.*,
      COALESCE(reminder_level, 0) AS rl,
      GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (now() - COALESCE(due_date, invoice_date))) / 86400))::int AS overdue_base_days,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - reminder_1_sent_at)) / 86400)::int, 0) AS days_since_r1,
      COALESCE(FLOOR(EXTRACT(EPOCH FROM (now() - reminder_2_sent_at)) / 86400)::int, 0) AS days_since_r2,
      (status::text IN ('PAID', 'CANCELLED')) AS reminder_is_paid
    FROM ins_job_filtered
  ),
  reminder_next AS (
    SELECT
      reminder_calc.*,
      CASE
        WHEN stop_reminders THEN NULL
        WHEN rl = 0 AND overdue_base_days >= 35 THEN 1
        WHEN rl = 1 AND days_since_r1 >= 25 THEN 2
        WHEN rl = 2 AND days_since_r2 >= 20 THEN 3
        ELSE NULL
      END AS next_reminder_level
    FROM reminder_calc
  ),
  final AS (
    SELECT * FROM reminder_next
    WHERE (
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
  )
  SELECT jsonb_build_object(
    'totalCount', (SELECT COUNT(*) FROM final),
    -- Summary cards (Invoices / Total Billed / Total Paid / Outstanding) must
    -- reflect the ENTIRE filtered set, not just the current page — mirrors
    -- the `summary` useMemo that used to run over the full client-side
    -- `filtered` array in src/app/invoices/page.tsx.
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
          id, patient_id, invoice_number, invoice_date, due_date, doctor_user_id, doctor_name,
          provider_id, provider_name, payment_method, total_amount, paid_amount, status, is_complimentary,
          pdf_path, pdf_path_tg, pdf_path_tp, pdf_path_reminder, pdf_path_receipt, pdf_generated_at, updated_at,
          created_by_user_id, created_by_name, is_archived, health_insurance_law, billing_type,
          reminder_level, reminder_1_sent_at, reminder_2_sent_at, reminder_3_sent_at,
          medidata_processed_at, medidata_processed_by, stop_reminders,
          ins_status AS latest_insurance_status,
          ins_created_at AS latest_insurance_created_at,
          ins_response_date AS latest_insurance_response_date,
          job_issue_type AS latest_job_issue
        FROM final
        ORDER BY invoice_date DESC NULLS LAST
        LIMIT p_limit OFFSET (p_page * p_limit)
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
