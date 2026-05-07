-- ============================================================
-- INVOICE DATA IMPORT MIGRATION
-- Source: tmp_invoice_raw (45,067 rows) → invoices
--        tmp_accounted_medical_invoices (45,196 rows) → invoice_line_items
-- Date: 2026-04-28
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: SCHEMA CHANGES
-- ============================================================

-- 1a. Add missing columns to invoices table
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_number_legacy text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS source_instance_id uuid;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS medical_case_subject text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS total_amount_raw numeric;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS status_change_date date;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS raw_data jsonb;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS treatment_id uuid;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS medical_case_id uuid;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_group_id uuid;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS billing_group_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS care_provider_short_name text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS care_provider_color_code integer;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dunning_status text;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS dunning_fees numeric DEFAULT 0;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS involved_mandator_ids text;

-- 1b. Add missing columns to invoice_line_items table
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS code_on_invoice integer;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS name_fr text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS name_de text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS name_it text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS description_fr text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS description_de text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS description_it text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS total_price_without_vat numeric;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS tp_al_or_price numeric DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS body_half text DEFAULT 'NOT_SPECIFIED';
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS effective_duration_minutes numeric DEFAULT 0;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS catalog_valid_from date;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS catalog_valid_to date;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS accounted_medical_benefit_id uuid;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS source_unaccounted_medical_benefit_id uuid;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS raw_data jsonb;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS executing_mandator_id uuid;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS executing_mandator_name text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS executing_mandator_gln text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS executing_mandator_zsr text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS responsible_mandator_id uuid;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS responsible_mandator_name text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS responsible_mandator_gln text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS responsible_mandator_zsr text;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS billing_group_id uuid;
ALTER TABLE invoice_line_items ADD COLUMN IF NOT EXISTS billing_group_name text;

-- 1c. Update catalog_nature check constraint to include new values
ALTER TABLE invoice_line_items DROP CONSTRAINT IF EXISTS invoice_line_items_catalog_nature_check;
ALTER TABLE invoice_line_items ADD CONSTRAINT invoice_line_items_catalog_nature_check
  CHECK (catalog_nature = ANY (ARRAY[
    'CUSTOM'::text, 'TARIFF_CATALOG'::text,
    'CUSTOM_ARTICLE'::text, 'ARTICLE'::text, 'ANALYSIS'::text
  ]));

-- 1d. Create indexes for new columns
CREATE INDEX IF NOT EXISTS invoices_invoice_number_legacy_idx ON invoices(invoice_number_legacy);
CREATE INDEX IF NOT EXISTS invoices_source_instance_id_idx ON invoices(source_instance_id);

-- ============================================================
-- PART 2: IMPORT INVOICES
-- Source: tmp_invoice_raw (45,067 rows)
-- Strategy: Use source invoice_id as our invoices.id (UUID preserved)
-- ============================================================

INSERT INTO invoices (
  id,
  patient_id,
  invoice_number,
  invoice_number_legacy,
  invoice_date,
  due_date,
  treatment_date,
  treatment_date_end,
  treatment_canton,
  treatment_reason,
  -- Provider (= care_provider from source)
  provider_name,
  provider_gln,
  provider_zsr,
  provider_iban,
  care_provider_short_name,
  care_provider_color_code,
  -- Amounts
  subtotal,
  vat_amount,
  total_amount,
  total_amount_raw,
  paid_amount,
  -- Status
  status,
  status_change_date,
  is_complimentary,
  -- Billing
  health_insurance_law,
  billing_type,
  medical_case_number,
  medical_case_subject,
  -- Insurance
  insurance_gln,
  insurance_name,
  patient_ssn,
  patient_card_number,
  -- Dunning
  reminder_level,
  dunning_status,
  dunning_fees,
  -- References
  reference_number,
  accident_date,
  involved_mandator_ids,
  -- Tracking
  source_instance_id,
  raw_data,
  -- Audit
  created_at,
  updated_at,
  is_archived,
  is_demo
)
SELECT
  r.invoice_id::uuid                                         AS id,
  r.patient_id::uuid                                         AS patient_id,
  r.invoice_no                                                AS invoice_number,
  r.invoice_id                                                AS invoice_number_legacy,
  r.invoice_creation_date::date                               AS invoice_date,
  -- due_date: invoice_date + payment term days
  CASE
    WHEN NULLIF(r.payment_details_payment_term_in_days, '') IS NOT NULL
    THEN r.invoice_creation_date::date + r.payment_details_payment_term_in_days::int
    ELSE NULL
  END                                                         AS due_date,
  -- Treatment dates
  CASE WHEN NULLIF(r.treatment_from_datetime, '') IS NOT NULL
    THEN r.treatment_from_datetime::timestamptz ELSE NULL END AS treatment_date,
  CASE WHEN NULLIF(r.treatment_to_datetime, '') IS NOT NULL
    THEN r.treatment_to_datetime::timestamptz ELSE NULL END   AS treatment_date_end,
  NULLIF(r.care_provider_canton, '')                          AS treatment_canton,
  NULLIF(r.medical_case_reason, '')                           AS treatment_reason,
  -- Provider (care_provider from source)
  COALESCE(
    NULLIF(r.care_provider_company_name, ''),
    NULLIF(TRIM(r.care_provider_first_name || ' ' || r.care_provider_last_name), ''),
    NULL
  )                                                           AS provider_name,
  NULLIF(r.care_provider_gln, '')                             AS provider_gln,
  NULLIF(r.care_provider_zsr, '')                             AS provider_zsr,
  NULLIF(r.payment_details_account_iban, '')                  AS provider_iban,
  NULLIF(r.care_provider_company_addition, '')                AS care_provider_short_name,
  NULL                                                        AS care_provider_color_code,
  -- Amounts
  r.total_raw::numeric
    - COALESCE(NULLIF(r.amount_vat_common,'')::numeric, 0)
    - COALESCE(NULLIF(r.amount_vat_reduced,'')::numeric, 0)  AS subtotal,
  COALESCE(NULLIF(r.amount_vat_common,'')::numeric, 0)
    + COALESCE(NULLIF(r.amount_vat_reduced,'')::numeric, 0)  AS vat_amount,
  r.invoice_balance_total::numeric                            AS total_amount,
  r.total_raw::numeric                                        AS total_amount_raw,
  COALESCE(NULLIF(r.current_amount_paid,'')::numeric, 0)     AS paid_amount,
  -- Status
  r.current_invoice_status                                    AS status,
  CASE WHEN NULLIF(r.latest_invoice_status_change_date, '') IS NOT NULL
    THEN r.latest_invoice_status_change_date::date ELSE NULL END AS status_change_date,
  false                                                       AS is_complimentary,
  -- Billing
  NULLIF(r.medical_case_law, '')                              AS health_insurance_law,
  NULLIF(r.refund_kind, '')                                   AS billing_type,
  NULLIF(r.medical_case_no, '')                               AS medical_case_number,
  NULLIF(r.medical_case_subject, '')                          AS medical_case_subject,
  -- Insurance (invoice recipient)
  NULLIF(r.invoice_recipient_company_gln, '')                 AS insurance_gln,
  NULLIF(r.invoice_recipient_company_name, '')                AS insurance_name,
  NULLIF(r.patient_ssn, '')                                   AS patient_ssn,
  NULLIF(r.patient_guarant_insurance_card_number, '')         AS patient_card_number,
  -- Dunning
  CASE r.current_dunning_status
    WHEN 'NO_DUNNING'      THEN 0
    WHEN 'FIRST_DUNNING'   THEN 1
    WHEN 'SECOND_DUNNING'  THEN 2
    WHEN 'THIRD_DUNNING'   THEN 3
    WHEN 'DEBT_COLLECTION' THEN 4
    ELSE 0
  END                                                         AS reminder_level,
  r.current_dunning_status                                    AS dunning_status,
  COALESCE(NULLIF(r.current_dunning_fees,'')::numeric, 0)    AS dunning_fees,
  -- References
  NULLIF(r.medical_case_external_reference_number, '')        AS reference_number,
  CASE WHEN NULLIF(r.event_date, '') IS NOT NULL
    THEN r.event_date::date ELSE NULL END                     AS accident_date,
  NULLIF(r.involved_mandator_ids, '')                         AS involved_mandator_ids,
  -- Tracking
  CASE WHEN NULLIF(r.source_instance_id, '') IS NOT NULL
    THEN r.source_instance_id::uuid ELSE NULL END             AS source_instance_id,
  to_jsonb(r.*)                                               AS raw_data,
  -- Audit
  r.invoice_creation_date::timestamptz                        AS created_at,
  COALESCE(
    NULLIF(r.latest_invoice_status_change_date, '')::timestamptz,
    r.invoice_creation_date::timestamptz
  )                                                           AS updated_at,
  false                                                       AS is_archived,
  false                                                       AS is_demo
FROM tmp_invoice_raw r
WHERE NOT EXISTS (
  SELECT 1 FROM invoices i WHERE i.id = r.invoice_id::uuid
);

-- ============================================================
-- PART 3: IMPORT LINE ITEMS
-- Source: tmp_accounted_medical_invoices (45,196 rows)
-- Strategy: Generate new UUIDs for line item IDs.
--           Use source invoice_id directly as FK (matches invoices.id).
-- ============================================================

INSERT INTO invoice_line_items (
  invoice_id,
  sort_order,
  code,
  code_on_invoice,
  name,
  name_fr,
  name_de,
  name_it,
  description_fr,
  description_de,
  description_it,
  quantity,
  unit_price,
  discount_percent,
  total_price,
  total_price_without_vat,
  -- VAT
  vat_rate,
  vat_rate_value,
  vat_amount,
  -- Tariff
  tariff_code,
  tardoc_time,
  -- Tax points
  tp_al,
  tp_tl,
  tp_al_value,
  tp_tl_value,
  tp_al_scale_factor,
  tp_tl_scale_factor,
  tp_al_or_price,
  price_al,
  price_tl,
  -- Catalog
  catalog_name,
  catalog_nature,
  catalog_version,
  catalog_valid_from,
  catalog_valid_to,
  -- Other
  body_half,
  uncovered_benefit,
  effective_duration_minutes,
  comment,
  -- Source IDs
  accounted_medical_benefit_id,
  source_unaccounted_medical_benefit_id,
  -- Mandator/provider
  provider_gln,
  responsible_gln,
  executing_mandator_id,
  executing_mandator_name,
  executing_mandator_gln,
  executing_mandator_zsr,
  responsible_mandator_id,
  responsible_mandator_name,
  responsible_mandator_gln,
  responsible_mandator_zsr,
  billing_group_id,
  billing_group_name,
  -- Date
  date_begin,
  -- Raw
  raw_data
)
SELECT
  a.invoice_id::uuid                                          AS invoice_id,
  COALESCE(NULLIF(a.sort_order,'')::int, 1)                  AS sort_order,
  NULLIF(a.code, '')                                          AS code,
  CASE WHEN NULLIF(a.code_on_invoice, '') IS NOT NULL
    THEN a.code_on_invoice::int ELSE NULL END                 AS code_on_invoice,
  -- name: prefer French, fall back to German, then Italian
  COALESCE(
    NULLIF(a.name_fr, ''),
    NULLIF(a.name_de, ''),
    NULLIF(a.name_it, ''),
    'Unknown'
  )                                                           AS name,
  NULLIF(a.name_fr, '')                                       AS name_fr,
  NULLIF(a.name_de, '')                                       AS name_de,
  NULLIF(a.name_it, '')                                       AS name_it,
  NULLIF(a.description_fr, '')                                AS description_fr,
  NULLIF(a.description_de, '')                                AS description_de,
  NULLIF(a.description_it, '')                                AS description_it,
  COALESCE(NULLIF(a.quantity,'')::numeric, 1)                 AS quantity,
  -- unit_price = total_price / quantity
  CASE
    WHEN COALESCE(NULLIF(a.quantity,'')::numeric, 1) != 0
    THEN ROUND(a.total_price::numeric / COALESCE(NULLIF(a.quantity,'')::numeric, 1), 2)
    ELSE a.total_price::numeric
  END                                                         AS unit_price,
  0                                                           AS discount_percent,
  a.total_price::numeric                                      AS total_price,
  CASE WHEN NULLIF(a.total_price_without_vat, '') IS NOT NULL
    THEN a.total_price_without_vat::numeric ELSE NULL END     AS total_price_without_vat,
  -- VAT
  NULLIF(a.vat_rate, '')                                      AS vat_rate,
  COALESCE(NULLIF(a.vat_rate_value,'')::numeric, 0)          AS vat_rate_value,
  COALESCE(NULLIF(a.vat_amount,'')::numeric, 0)              AS vat_amount,
  -- Tariff
  CASE WHEN NULLIF(a.tariff_code, '') ~ '^\d+$'
    THEN a.tariff_code::int ELSE NULL END                     AS tariff_code,
  CASE WHEN NULLIF(a.tarmed_time, '') IS NOT NULL
    THEN a.tarmed_time::numeric::int ELSE NULL END            AS tardoc_time,
  -- Tax points
  COALESCE(NULLIF(a.tp_al_or_price,'')::numeric, 0)          AS tp_al,
  COALESCE(NULLIF(a.tp_tl,'')::numeric, 0)                   AS tp_tl,
  COALESCE(NULLIF(a.tp_al_value,'')::numeric, 1)             AS tp_al_value,
  COALESCE(NULLIF(a.tp_tl_value,'')::numeric, 1)             AS tp_tl_value,
  COALESCE(NULLIF(a.tp_al_scale_factor,'')::numeric, 1)      AS tp_al_scale_factor,
  COALESCE(NULLIF(a.tp_tl_scale_factor,'')::numeric, 1)      AS tp_tl_scale_factor,
  COALESCE(NULLIF(a.tp_al_or_price,'')::numeric, 0)          AS tp_al_or_price,
  COALESCE(NULLIF(a.price_al,'')::numeric, 0)                AS price_al,
  COALESCE(NULLIF(a.price_tl,'')::numeric, 0)                AS price_tl,
  -- Catalog
  NULLIF(a.catalog_name, '')                                  AS catalog_name,
  NULLIF(a.catalog_nature, '')                                AS catalog_nature,
  NULLIF(a.catalog_version, '')                               AS catalog_version,
  CASE WHEN NULLIF(a.catalog_valid_from, '') IS NOT NULL
    THEN a.catalog_valid_from::date ELSE NULL END             AS catalog_valid_from,
  CASE WHEN NULLIF(a.catalog_valid_to, '') IS NOT NULL
    THEN a.catalog_valid_to::date ELSE NULL END               AS catalog_valid_to,
  -- Other
  COALESCE(NULLIF(a.body_half, ''), 'NOT_SPECIFIED')          AS body_half,
  COALESCE(NULLIF(a.uncovered_benefit,'')::boolean, false)    AS uncovered_benefit,
  COALESCE(NULLIF(a.effective_duration_minutes,'')::numeric, 0) AS effective_duration_minutes,
  NULLIF(a.comment, '')                                       AS comment,
  -- Source IDs
  CASE WHEN NULLIF(a.accounted_medical_benefit_id, '') IS NOT NULL
    THEN a.accounted_medical_benefit_id::uuid ELSE NULL END   AS accounted_medical_benefit_id,
  CASE WHEN NULLIF(a.source_unaccounted_medical_benefit_id, '') IS NOT NULL
    THEN a.source_unaccounted_medical_benefit_id::uuid ELSE NULL END AS source_unaccounted_medical_benefit_id,
  -- Mandator/provider (executing = who performed, responsible = who is responsible)
  NULLIF(a.executing_mandator_gln, '')                        AS provider_gln,
  NULLIF(a.responsible_mandator_gln, '')                      AS responsible_gln,
  CASE WHEN NULLIF(a.executing_mandator_id, '') IS NOT NULL
    THEN a.executing_mandator_id::uuid ELSE NULL END          AS executing_mandator_id,
  NULLIF(a.executing_mandator_name, '')                       AS executing_mandator_name,
  NULLIF(a.executing_mandator_gln, '')                        AS executing_mandator_gln,
  NULLIF(a.executing_mandator_zsr, '')                        AS executing_mandator_zsr,
  CASE WHEN NULLIF(a.responsible_mandator_id, '') IS NOT NULL
    THEN a.responsible_mandator_id::uuid ELSE NULL END        AS responsible_mandator_id,
  NULLIF(a.responsible_mandator_name, '')                     AS responsible_mandator_name,
  NULLIF(a.responsible_mandator_gln, '')                      AS responsible_mandator_gln,
  NULLIF(a.responsible_mandator_zsr, '')                      AS responsible_mandator_zsr,
  CASE WHEN NULLIF(a.billing_group_id, '') IS NOT NULL
    THEN a.billing_group_id::uuid ELSE NULL END               AS billing_group_id,
  NULLIF(a.billing_group_name, '')                            AS billing_group_name,
  -- Date
  CASE WHEN NULLIF(a.treatment_date, '') IS NOT NULL
    THEN a.treatment_date::timestamptz ELSE NULL END          AS date_begin,
  -- Raw
  to_jsonb(a.*)                                               AS raw_data
FROM tmp_accounted_medical_invoices a
WHERE EXISTS (
  SELECT 1 FROM invoices i WHERE i.id = a.invoice_id::uuid
);

-- ============================================================
-- PART 4: VALIDATION
-- ============================================================

-- 4a. Count check
DO $$
DECLARE
  v_src_invoices   bigint;
  v_imported       bigint;
  v_src_lines      bigint;
  v_imported_lines bigint;
BEGIN
  SELECT count(*) INTO v_src_invoices FROM tmp_invoice_raw;
  SELECT count(*) INTO v_imported FROM invoices WHERE invoice_number_legacy IS NOT NULL;
  SELECT count(*) INTO v_src_lines FROM tmp_accounted_medical_invoices;
  SELECT count(*) INTO v_imported_lines FROM invoice_line_items WHERE raw_data IS NOT NULL;

  RAISE NOTICE '--- IMPORT VALIDATION ---';
  RAISE NOTICE 'Source invoices:     % | Imported: %', v_src_invoices, v_imported;
  RAISE NOTICE 'Source line items:   % | Imported: %', v_src_lines, v_imported_lines;

  IF v_imported != v_src_invoices THEN
    RAISE WARNING 'Invoice count mismatch! Expected %, got %', v_src_invoices, v_imported;
  END IF;
  IF v_imported_lines != v_src_lines THEN
    RAISE WARNING 'Line item count mismatch! Expected %, got %', v_src_lines, v_imported_lines;
  END IF;
END $$;

-- 4b. Total amount integrity check
SELECT
  'invoices' AS check_name,
  round(sum(total_amount), 2) AS our_total,
  (SELECT round(sum(invoice_balance_total::numeric), 2) FROM tmp_invoice_raw) AS source_total,
  round(sum(total_amount), 2) -
    (SELECT round(sum(invoice_balance_total::numeric), 2) FROM tmp_invoice_raw) AS diff
FROM invoices
WHERE invoice_number_legacy IS NOT NULL;

-- 4c. Line items total check
SELECT
  'line_items' AS check_name,
  round(sum(li.total_price), 2) AS our_total,
  (SELECT round(sum(total_price::numeric), 2) FROM tmp_accounted_medical_invoices) AS source_total,
  round(sum(li.total_price), 2) -
    (SELECT round(sum(total_price::numeric), 2) FROM tmp_accounted_medical_invoices) AS diff
FROM invoice_line_items li
WHERE li.raw_data IS NOT NULL;

-- 4d. VAT totals check
SELECT
  'vat_check' AS check_name,
  round(sum(vat_amount), 2) AS our_vat_total,
  (SELECT round(
    sum(COALESCE(NULLIF(amount_vat_common,'')::numeric,0)) +
    sum(COALESCE(NULLIF(amount_vat_reduced,'')::numeric,0)), 2
  ) FROM tmp_invoice_raw) AS source_vat_total
FROM invoices
WHERE invoice_number_legacy IS NOT NULL;

-- 4e. Status distribution comparison
SELECT 'imported' AS source, status, count(*) AS cnt
FROM invoices WHERE invoice_number_legacy IS NOT NULL
GROUP BY status
UNION ALL
SELECT 'source', current_invoice_status, count(*)
FROM tmp_invoice_raw
GROUP BY current_invoice_status
ORDER BY status, source;

-- 4f. Spot check: random invoice with line items
SELECT
  i.id, i.invoice_number, i.invoice_date, i.status,
  i.subtotal, i.vat_amount, i.total_amount, i.paid_amount,
  i.health_insurance_law, i.billing_type,
  i.provider_name, i.insurance_name,
  count(li.id) AS line_count,
  round(sum(li.total_price), 2) AS line_total
FROM invoices i
LEFT JOIN invoice_line_items li ON li.invoice_id = i.id AND li.raw_data IS NOT NULL
WHERE i.invoice_number_legacy IS NOT NULL
GROUP BY i.id
HAVING count(li.id) > 0
ORDER BY random()
LIMIT 5;

COMMIT;
