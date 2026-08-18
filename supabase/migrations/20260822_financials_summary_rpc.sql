-- ============================================================
-- Financials page: server-side aggregation for the Overview
-- totals, per-patient breakdown, and per-owner breakdown.
--
-- Previously the Financials page had to download every invoice
-- matching the current filters to the browser just to sum them
-- client-side (fetchAllFilteredInvoices). With ~47k invoices and
-- no default date filter, that meant up to ~48 sequential
-- 1000-row batches (~30s+) on every filter change. This function
-- does the same aggregation in a single round trip.
--
-- Mirrors the filter semantics of applyInvoiceFilters() and the
-- aggregation semantics of the `summary` / `patientSummaryRows` /
-- `ownerSummaryRows` useMemo blocks in src/app/financials/page.tsx.
-- Runs as SECURITY INVOKER (default) so RLS (invoices_demo_isolation)
-- is applied exactly as it is for normal client queries.
-- ============================================================

CREATE OR REPLACE FUNCTION public.financials_summary(
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_date_field text DEFAULT 'invoice_date',
  p_patient_id text DEFAULT 'all',
  p_owner_ids text[] DEFAULT NULL,
  p_invoice_type text DEFAULT 'all',
  p_status text DEFAULT 'all',
  p_only_unpaid boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH filtered AS (
    SELECT
      i.patient_id,
      i.total_amount,
      i.status,
      i.is_complimentary,
      COALESCE(i.provider_id::text, i.doctor_user_id::text, i.created_by_user_id::text, 'unknown') AS owner_key,
      i.provider_id,
      COALESCE(i.provider_name, i.doctor_name, i.created_by_name) AS owner_label_fallback
    FROM invoices i
    WHERE i.is_archived = false
      AND (
        p_date_from IS NULL
        OR (CASE WHEN p_date_field = 'paid_at' THEN i.paid_at ELSE i.invoice_date END) >= p_date_from
      )
      AND (
        p_date_to IS NULL
        OR (CASE WHEN p_date_field = 'paid_at' THEN i.paid_at ELSE i.invoice_date END) <= p_date_to
      )
      AND (p_patient_id = 'all' OR i.patient_id::text = p_patient_id)
      AND (
        p_owner_ids IS NULL
        OR array_length(p_owner_ids, 1) IS NULL
        OR i.provider_id::text = ANY (p_owner_ids)
      )
      AND (
        p_invoice_type = 'all'
        OR (p_invoice_type = 'esthetic' AND i.health_insurance_law IS NULL AND i.billing_type IS NULL)
        OR (p_invoice_type <> 'esthetic' AND (i.health_insurance_law = p_invoice_type OR i.billing_type = p_invoice_type))
      )
      AND (
        p_status = 'all'
        OR (p_status = 'complimentary' AND i.is_complimentary = true)
        OR (p_status = 'paid' AND i.status IN ('PAID', 'OVERPAID'))
        OR (p_status = 'partial' AND i.status = 'PARTIAL_PAID')
        OR (p_status = 'cancelled' AND i.status = 'CANCELLED')
        OR (p_status = 'unpaid' AND i.is_complimentary = false AND i.status NOT IN ('PAID', 'OVERPAID', 'PARTIAL_PAID', 'CANCELLED'))
      )
      AND (
        NOT p_only_unpaid
        OR (i.is_complimentary = false AND i.status NOT IN ('PAID', 'OVERPAID'))
      )
  ),
  valid AS (
    SELECT * FROM filtered WHERE COALESCE(total_amount, 0) > 0
  ),
  overview AS (
    SELECT
      COUNT(*) AS invoice_count,
      COALESCE(SUM(CASE WHEN is_complimentary THEN 0 ELSE total_amount END), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN NOT is_complimentary AND status IN ('PAID', 'OVERPAID') THEN total_amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN NOT is_complimentary AND status NOT IN ('PAID', 'OVERPAID') THEN total_amount ELSE 0 END), 0) AS total_unpaid,
      COALESCE(SUM(CASE WHEN is_complimentary THEN total_amount ELSE 0 END), 0) AS total_complimentary
    FROM valid
  ),
  by_patient AS (
    SELECT
      patient_id,
      COUNT(*) AS invoice_count,
      COALESCE(SUM(CASE WHEN is_complimentary THEN 0 ELSE total_amount END), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN NOT is_complimentary AND status IN ('PAID', 'OVERPAID') THEN total_amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN NOT is_complimentary AND status NOT IN ('PAID', 'OVERPAID') THEN total_amount ELSE 0 END), 0) AS total_unpaid,
      COALESCE(SUM(CASE WHEN is_complimentary THEN total_amount ELSE 0 END), 0) AS total_complimentary
    FROM valid
    WHERE patient_id IS NOT NULL
    GROUP BY patient_id
  ),
  by_owner AS (
    SELECT
      owner_key,
      (array_agg(provider_id) FILTER (WHERE provider_id IS NOT NULL))[1] AS sample_provider_id,
      (array_agg(owner_label_fallback) FILTER (WHERE owner_label_fallback IS NOT NULL))[1] AS owner_label_fallback,
      COUNT(*) AS invoice_count,
      COALESCE(SUM(CASE WHEN is_complimentary THEN 0 ELSE total_amount END), 0) AS total_amount,
      COALESCE(SUM(CASE WHEN NOT is_complimentary AND status IN ('PAID', 'OVERPAID') THEN total_amount ELSE 0 END), 0) AS total_paid,
      COALESCE(SUM(CASE WHEN NOT is_complimentary AND status NOT IN ('PAID', 'OVERPAID') THEN total_amount ELSE 0 END), 0) AS total_unpaid,
      COALESCE(SUM(CASE WHEN is_complimentary THEN total_amount ELSE 0 END), 0) AS total_complimentary
    FROM valid
    GROUP BY owner_key
  )
  SELECT jsonb_build_object(
    'overview', (SELECT row_to_json(overview) FROM overview),
    'byPatient', (SELECT COALESCE(jsonb_agg(row_to_json(by_patient)), '[]'::jsonb) FROM by_patient),
    'byOwner', (SELECT COALESCE(jsonb_agg(row_to_json(by_owner)), '[]'::jsonb) FROM by_owner)
  );
$$;

GRANT EXECUTE ON FUNCTION public.financials_summary(timestamptz, timestamptz, text, text, text[], text, text, boolean) TO anon, authenticated;
