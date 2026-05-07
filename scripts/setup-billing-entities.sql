-- ============================================================
-- BILLING ENTITIES SETUP
-- Date: 2026-04-29
-- Creates 3 billing entities and links doctors to them
-- ============================================================

BEGIN;

-- 1. Add missing columns to providers
ALTER TABLE providers ADD COLUMN IF NOT EXISTS bic text;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS billing_entity_id uuid
  REFERENCES providers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_providers_billing_entity_id ON providers(billing_entity_id);

-- 2. Create 3 billing entities (with stable UUIDs so we can reference them)
-- Entity 1: TOA Practice (general)
INSERT INTO providers (id, name, role, iban, bic, zsr, is_demo)
VALUES (
  '11111111-1111-1111-1111-000000000001',
  'Maison TOA',
  'billing_entity',
  'CH04 0024 3243 5408 2003 X',
  'UBSWCHZH80A',
  'Z797322',
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  iban = EXCLUDED.iban,
  bic = EXCLUDED.bic,
  zsr = EXCLUDED.zsr;

-- Entity 2: Dr Alexandra Miles
INSERT INTO providers (id, name, role, iban, bic, zsr, is_demo)
VALUES (
  '11111111-1111-1111-1111-000000000002',
  'Dr Alexandra Miles',
  'billing_entity',
  'CH26 0024 3243 5408 2001 V',
  'UBSWCHZH80A',
  'Z797322',
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  iban = EXCLUDED.iban,
  bic = EXCLUDED.bic,
  zsr = EXCLUDED.zsr;

-- Entity 3: Dr Sophie Nordback
INSERT INTO providers (id, name, role, iban, bic, zsr, is_demo)
VALUES (
  '11111111-1111-1111-1111-000000000003',
  'Dr Sophie Nordback',
  'billing_entity',
  'CH64 0024 3243 5408 2002 N',
  'UBSWCHZH80A',
  'Z797322',
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  iban = EXCLUDED.iban,
  bic = EXCLUDED.bic,
  zsr = EXCLUDED.zsr;

-- 3. Link doctors to billing entities
-- Entity 1: Plakalo, Koltunova, Benani, Guarino
UPDATE providers SET billing_entity_id = '11111111-1111-1111-1111-000000000001'
WHERE role = 'doctor' AND name IN (
  'Dr. Adnan Plakalo',
  'Dr Natalia Koltunova',
  'Dr Reda Benani',
  'Laetitia Guarino'
);

-- Entity 2: Dr Miles
UPDATE providers SET billing_entity_id = '11111111-1111-1111-1111-000000000002'
WHERE role = 'doctor' AND name = 'Dr Alexandra Miles';

-- Entity 3: Dr Nordback
UPDATE providers SET billing_entity_id = '11111111-1111-1111-1111-000000000003'
WHERE role = 'doctor' AND name = 'Dr Sophie Nordback';

-- 4. Verification
SELECT
  d.name AS doctor,
  be.name AS billing_entity,
  be.iban,
  be.bic,
  be.zsr
FROM providers d
LEFT JOIN providers be ON d.billing_entity_id = be.id
WHERE d.role = 'doctor'
ORDER BY be.name NULLS LAST, d.name;

COMMIT;
