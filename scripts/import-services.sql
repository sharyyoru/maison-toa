-- ============================================================
-- IMPORT SERVICES + VAT SETUP
-- Date: 2026-04-29
-- - Adds VAT columns to services
-- - Creates 3 new categories (one per source file)
-- - Imports 495 services from scripts/services_import.csv
-- ============================================================

BEGIN;

-- 1. Add VAT columns to services
ALTER TABLE services
  ADD COLUMN IF NOT EXISTS vat_status text
    CHECK (vat_status IS NULL OR vat_status IN ('voll', 'befreit')),
  ADD COLUMN IF NOT EXISTS vat_rate_pct numeric(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_file text,
  ADD COLUMN IF NOT EXISTS sub_category text,
  ADD COLUMN IF NOT EXISTS invoice_type text
    CHECK (invoice_type IS NULL OR invoice_type IN ('direct_patient', 'tardoc_insurer')),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_services_code ON services(code) WHERE code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_services_vat_status ON services(vat_status);

-- 2. Create the 3 new categories
INSERT INTO service_categories (id, name, description, sort_order, color)
VALUES
  ('55555555-5555-5555-5555-000000000001', 'Cosmetic Retail Products',
   'Retail products: ZO Skin Health, 3D Lip, gift vouchers, skincare kits.', 100, 'bg-pink-300/70'),
  ('55555555-5555-5555-5555-000000000002', 'Surgical Materials & Consumables',
   'Medical consumables: bandages, sutures, needles, dressings.', 101, 'bg-amber-300/70'),
  ('55555555-5555-5555-5555-000000000003', 'Aesthetic & Medical Services',
   'Aesthetic and medical services: injections, laser, IV therapy, consultations, interventions, memberships.', 102, 'bg-sky-300/70')
ON CONFLICT (name) DO UPDATE SET
  description = EXCLUDED.description,
  sort_order = EXCLUDED.sort_order,
  color = EXCLUDED.color;

-- 3. Staging table for CSV
DROP TABLE IF EXISTS _services_staging;
CREATE TEMP TABLE _services_staging (
  source_file text,
  category text,
  sub_category text,
  code text,
  name_fr text,
  price_chf numeric(12,2),
  vat_status text,
  vat_rate_pct numeric(5,2),
  invoice_type text,
  notes text
);

-- 4. Load CSV (called from psql via \copy)
\copy _services_staging FROM 'scripts/services_import.csv' WITH (FORMAT csv, HEADER true);

-- 5. Sanity check
SELECT 'staging rows' AS check, count(*) FROM _services_staging
UNION ALL
SELECT 'voll', count(*) FROM _services_staging WHERE vat_status = 'voll'
UNION ALL
SELECT 'befreit', count(*) FROM _services_staging WHERE vat_status = 'befreit';

-- 6. Upsert services from staging
-- Map source_file -> category_id
-- Disambiguate duplicate names within the same source_file by appending the code.
WITH category_map AS (
  SELECT 'artikel_20260422101652.xlsx'::text AS source_file,
         '55555555-5555-5555-5555-000000000001'::uuid AS category_id
  UNION ALL
  SELECT 'eigeneArtikel_20260422101657.xlsx',
         '55555555-5555-5555-5555-000000000002'::uuid
  UNION ALL
  SELECT 'esthe_tiqueAM_20260422101645.xlsx',
         '55555555-5555-5555-5555-000000000003'::uuid
),
deduped AS (
  SELECT
    s.*,
    count(*) OVER (PARTITION BY s.source_file, s.name_fr) AS dup_count
  FROM _services_staging s
)
INSERT INTO services (
  category_id, name, code, base_price,
  vat_status, vat_rate_pct, source_file, sub_category, invoice_type, notes,
  is_active
)
SELECT
  cm.category_id,
  CASE WHEN d.dup_count > 1 AND d.code <> ''
       THEN d.name_fr || ' (' || d.code || ')'
       ELSE d.name_fr
  END AS name,
  NULLIF(d.code, ''),
  d.price_chf,
  d.vat_status,
  d.vat_rate_pct,
  d.source_file,
  NULLIF(d.sub_category, ''),
  NULLIF(d.invoice_type, ''),
  NULLIF(d.notes, ''),
  true
FROM deduped d
JOIN category_map cm ON cm.source_file = d.source_file
ON CONFLICT (category_id, name) DO UPDATE SET
  code = EXCLUDED.code,
  base_price = EXCLUDED.base_price,
  vat_status = EXCLUDED.vat_status,
  vat_rate_pct = EXCLUDED.vat_rate_pct,
  source_file = EXCLUDED.source_file,
  sub_category = EXCLUDED.sub_category,
  invoice_type = EXCLUDED.invoice_type,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 7. Verification
SELECT
  c.name AS category,
  count(*) AS services,
  count(*) FILTER (WHERE s.vat_status = 'voll') AS voll,
  count(*) FILTER (WHERE s.vat_status = 'befreit') AS befreit
FROM services s
JOIN service_categories c ON s.category_id = c.id
WHERE s.source_file IS NOT NULL
GROUP BY c.name
ORDER BY c.name;

COMMIT;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
