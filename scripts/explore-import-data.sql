-- ============================================================
-- EXPLORATION QUERIES: tmp_invoice_raw & tmp_accounted_medical_invoices
-- Run this in Supabase SQL Editor to understand data structure
-- ============================================================

-- 1. Row counts
SELECT 
  (SELECT count(*) FROM tmp_invoice_raw) AS invoice_rows,
  (SELECT count(*) FROM tmp_accounted_medical_invoices) AS line_item_rows;

-- 2. Distinct invoice_id counts in both tables
SELECT 
  (SELECT count(DISTINCT invoice_id) FROM tmp_invoice_raw) AS distinct_invoices_raw,
  (SELECT count(DISTINCT invoice_id) FROM tmp_accounted_medical_invoices) AS distinct_invoices_lines;

-- 3. Orphan line items (invoice_id in line items but NOT in invoice_raw)
SELECT count(DISTINCT a.invoice_id) AS orphan_invoice_ids
FROM tmp_accounted_medical_invoices a
LEFT JOIN tmp_invoice_raw r ON a.invoice_id = r.invoice_id
WHERE r.invoice_id IS NULL;

-- 4. Invoice status distribution
SELECT current_invoice_status, count(*) AS cnt
FROM tmp_invoice_raw
GROUP BY current_invoice_status
ORDER BY cnt DESC;

-- 5. Billing type (refund_kind) distribution
SELECT refund_kind, count(*) AS cnt
FROM tmp_invoice_raw
GROUP BY refund_kind
ORDER BY cnt DESC;

-- 6. Health insurance law distribution
SELECT medical_case_law, count(*) AS cnt
FROM tmp_invoice_raw
GROUP BY medical_case_law
ORDER BY cnt DESC;

-- 7. Patient ID sample — verify they look like UUIDs
SELECT patient_id, patient_firstname, patient_lastname, patient_birthdate
FROM tmp_invoice_raw
LIMIT 5;

-- 8. Patient match rate against patients table
SELECT 
  count(DISTINCT r.patient_id) AS total_distinct_patients,
  count(DISTINCT CASE WHEN p.id IS NOT NULL THEN r.patient_id END) AS matched_patients,
  count(DISTINCT CASE WHEN p.id IS NULL THEN r.patient_id END) AS unmatched_patients
FROM tmp_invoice_raw r
LEFT JOIN patients p ON r.patient_id::uuid = p.id;

-- 9. How many invoices belong to unmatched patients?
SELECT count(*) AS invoices_with_unmatched_patient
FROM tmp_invoice_raw r
LEFT JOIN patients p ON r.patient_id::uuid = p.id
WHERE p.id IS NULL;

-- 10. Line items per invoice distribution
SELECT bucket, count(*) AS invoice_count FROM (
  SELECT 
    CASE 
      WHEN cnt = 1 THEN '01: 1 item'
      WHEN cnt BETWEEN 2 AND 5 THEN '02: 2-5 items'
      WHEN cnt BETWEEN 6 AND 10 THEN '03: 6-10 items'
      WHEN cnt BETWEEN 11 AND 20 THEN '04: 11-20 items'
      ELSE '05: 20+ items'
    END AS bucket
  FROM (
    SELECT invoice_id, count(*) AS cnt
    FROM tmp_accounted_medical_invoices
    GROUP BY invoice_id
  ) sub
) buckets
GROUP BY bucket
ORDER BY bucket;

-- 11. VAT rate distribution at line item level
SELECT vat_rate, count(*) AS cnt, 
       round(avg(vat_rate_value::numeric), 4) AS avg_rate_pct,
       round(sum(vat_amount::numeric), 2) AS total_vat_amount
FROM tmp_accounted_medical_invoices
GROUP BY vat_rate
ORDER BY cnt DESC;

-- 12. Invoice-level VAT fields — sample non-zero
SELECT invoice_id, invoice_no,
       vat_rate_value_common, amount_vat_common, amount_vat_common_factor,
       vat_rate_value_reduced, amount_vat_reduced, amount_vat_reduced_factor,
       amount_vat_free, amount_vat_free_factor,
       total_raw, invoice_balance_total
FROM tmp_invoice_raw
WHERE amount_vat_common::numeric > 0 OR amount_vat_reduced::numeric > 0
LIMIT 10;

-- 13. Catalog nature + catalog name distribution
SELECT catalog_nature, catalog_name, count(*) AS cnt
FROM tmp_accounted_medical_invoices
GROUP BY catalog_nature, catalog_name
ORDER BY cnt DESC
LIMIT 20;

-- 14. Care provider distribution (from invoices)
SELECT care_provider_id, care_provider_gln, 
       COALESCE(NULLIF(care_provider_company_name,''), care_provider_first_name || ' ' || care_provider_last_name) AS provider_name,
       care_provider_zsr,
       count(*) AS invoice_count
FROM tmp_invoice_raw
GROUP BY care_provider_id, care_provider_gln, care_provider_company_name, care_provider_first_name, care_provider_last_name, care_provider_zsr
ORDER BY invoice_count DESC
LIMIT 10;

-- 15. Provider match against our providers table (by GLN)
SELECT 
  count(DISTINCT r.care_provider_gln) AS total_provider_glns,
  count(DISTINCT CASE WHEN p.id IS NOT NULL THEN r.care_provider_gln END) AS matched,
  count(DISTINCT CASE WHEN p.id IS NULL THEN r.care_provider_gln END) AS unmatched
FROM tmp_invoice_raw r
LEFT JOIN providers p ON r.care_provider_gln = p.gln;

-- 16. Insurer match against swiss_insurers (by invoice_recipient_company_gln)
SELECT 
  count(DISTINCT r.invoice_recipient_company_gln) AS total_insurer_glns,
  count(DISTINCT CASE WHEN si.id IS NOT NULL THEN r.invoice_recipient_company_gln END) AS matched,
  count(DISTINCT CASE WHEN si.id IS NULL THEN r.invoice_recipient_company_gln END) AS unmatched
FROM tmp_invoice_raw r
LEFT JOIN swiss_insurers si ON r.invoice_recipient_company_gln = si.gln
WHERE r.invoice_recipient_company_gln IS NOT NULL AND r.invoice_recipient_company_gln != '';

-- 17. Check for already-imported invoices (duplicate check)
SELECT count(*) AS already_imported
FROM invoices i
WHERE i.invoice_number_legacy IS NOT NULL 
  AND i.invoice_number_legacy IN (SELECT invoice_id FROM tmp_invoice_raw);

-- 18. Source instance ID groupings
SELECT source_instance_id, count(*) AS cnt
FROM tmp_invoice_raw
GROUP BY source_instance_id
ORDER BY cnt DESC;

-- 19. Date range of invoices
SELECT 
  min(invoice_creation_date::timestamptz) AS earliest,
  max(invoice_creation_date::timestamptz) AS latest
FROM tmp_invoice_raw
WHERE invoice_creation_date IS NOT NULL AND invoice_creation_date != '';

-- 20. Executing mandator distribution (from line items)
SELECT executing_mandator_id, executing_mandator_name, executing_mandator_zsr, count(*) AS cnt
FROM tmp_accounted_medical_invoices
GROUP BY executing_mandator_id, executing_mandator_name, executing_mandator_zsr
ORDER BY cnt DESC
LIMIT 10;

-- 21. Responsible mandator distribution (from line items)
SELECT responsible_mandator_id, responsible_mandator_name, responsible_mandator_zsr, count(*) AS cnt
FROM tmp_accounted_medical_invoices
GROUP BY responsible_mandator_id, responsible_mandator_name, responsible_mandator_zsr
ORDER BY cnt DESC
LIMIT 10;

-- 22. Billing group distribution
SELECT billing_group_id, billing_group_name, count(*) AS cnt
FROM tmp_accounted_medical_invoices
GROUP BY billing_group_id, billing_group_name
ORDER BY cnt DESC
LIMIT 10;

-- 23. Sample: one invoice with 3-5 line items
WITH multi AS (
  SELECT invoice_id FROM tmp_accounted_medical_invoices
  GROUP BY invoice_id HAVING count(*) BETWEEN 3 AND 5
  LIMIT 1
)
SELECT a.invoice_id, a.sort_order, a.code, a.name_fr, a.quantity, 
       a.total_price, a.vat_rate, a.vat_rate_value, a.vat_amount,
       a.tp_al_or_price, a.price_al, a.price_tl, a.catalog_nature, a.tariff_code
FROM tmp_accounted_medical_invoices a
JOIN multi m ON a.invoice_id = m.invoice_id
ORDER BY a.sort_order::int;

-- 24. Corresponding invoice header for that sample
WITH multi AS (
  SELECT invoice_id FROM tmp_accounted_medical_invoices
  GROUP BY invoice_id HAVING count(*) BETWEEN 3 AND 5
  LIMIT 1
)
SELECT r.invoice_id, r.invoice_no, r.invoice_creation_date, 
       r.current_invoice_status, r.refund_kind, r.medical_case_law,
       r.total_raw, r.invoice_balance_total, r.current_amount_paid,
       r.patient_id, r.patient_firstname, r.patient_lastname,
       r.vat_rate_value_common, r.amount_vat_common,
       r.vat_rate_value_reduced, r.amount_vat_reduced,
       r.amount_vat_free,
       r.invoice_recipient_company_name, r.invoice_recipient_company_gln
FROM tmp_invoice_raw r
JOIN multi m ON r.invoice_id = m.invoice_id;

-- 25. Verify: sum of line item totals vs invoice total
SELECT 
  sub.match_status,
  count(*) AS invoice_count
FROM (
  SELECT 
    r.invoice_id,
    r.total_raw::numeric AS header_total,
    COALESCE(agg.line_total, 0) AS line_total,
    CASE 
      WHEN abs(r.total_raw::numeric - COALESCE(agg.line_total, 0)) < 0.02 THEN 'MATCH'
      WHEN agg.line_total IS NULL THEN 'NO_LINES'
      ELSE 'MISMATCH'
    END AS match_status
  FROM tmp_invoice_raw r
  LEFT JOIN (
    SELECT invoice_id, sum(total_price::numeric) AS line_total
    FROM tmp_accounted_medical_invoices
    GROUP BY invoice_id
  ) agg ON r.invoice_id = agg.invoice_id
) sub
GROUP BY sub.match_status
ORDER BY sub.match_status;

-- 26. Show some mismatches if any
SELECT 
  r.invoice_id, r.invoice_no, r.total_raw,
  agg.line_total,
  r.total_raw::numeric - agg.line_total AS diff
FROM tmp_invoice_raw r
JOIN (
  SELECT invoice_id, sum(total_price::numeric) AS line_total
  FROM tmp_accounted_medical_invoices
  GROUP BY invoice_id
) agg ON r.invoice_id = agg.invoice_id
WHERE abs(r.total_raw::numeric - agg.line_total) >= 0.02
ORDER BY abs(r.total_raw::numeric - agg.line_total) DESC
LIMIT 10;

-- 27. Check for duplicate invoice_no values
SELECT invoice_no, count(*) AS cnt
FROM tmp_invoice_raw
GROUP BY invoice_no
HAVING count(*) > 1
ORDER BY cnt DESC
LIMIT 10;

-- 28. Payment data summary (for future invoice_payments import)
SELECT 
  CASE 
    WHEN current_amount_paid::numeric > 0 THEN 'has_payment'
    ELSE 'no_payment'
  END AS payment_status,
  count(*) AS cnt,
  round(sum(current_amount_paid::numeric), 2) AS total_paid
FROM tmp_invoice_raw
GROUP BY 1;

-- 29. Dunning status distribution
SELECT current_dunning_status, count(*) AS cnt
FROM tmp_invoice_raw
GROUP BY current_dunning_status
ORDER BY cnt DESC;

-- 30. Amount fields summary (min/max/avg for key money columns)
SELECT 
  round(min(total_raw::numeric), 2) AS min_total,
  round(avg(total_raw::numeric), 2) AS avg_total,
  round(max(total_raw::numeric), 2) AS max_total,
  round(sum(total_raw::numeric), 2) AS sum_total,
  round(min(invoice_balance_total::numeric), 2) AS min_balance,
  round(max(invoice_balance_total::numeric), 2) AS max_balance
FROM tmp_invoice_raw;
