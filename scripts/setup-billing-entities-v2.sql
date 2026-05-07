-- ============================================================
-- BILLING ENTITIES SETUP V2
-- Date: 2026-04-29
-- Models: clinics, bank_accounts, providers (medical + aesthetic billing identities)
-- Replaces v1 migration.
-- ============================================================

BEGIN;

-- ============================================================
-- PART 1: Clean up v1 migration
-- ============================================================

-- Unlink doctors from old billing_entity_id (only if column still exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'providers' AND column_name = 'billing_entity_id'
  ) THEN
    EXECUTE 'UPDATE providers SET billing_entity_id = NULL WHERE billing_entity_id IS NOT NULL';
  END IF;
END $$;

-- Drop old billing entities created in v1
DELETE FROM providers WHERE id IN (
  '11111111-1111-1111-1111-000000000001',
  '11111111-1111-1111-1111-000000000002',
  '11111111-1111-1111-1111-000000000003'
);

-- Drop the column (we use doctor_id on billing entity instead)
ALTER TABLE providers DROP COLUMN IF EXISTS billing_entity_id;
DROP INDEX IF EXISTS idx_providers_billing_entity_id;

-- ============================================================
-- PART 2: New tables
-- ============================================================

-- 2a. Clinics
CREATE TABLE IF NOT EXISTS clinics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  address text,
  rcc text,
  vat_number text,
  bank_name text,
  bic text,
  gln text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2b. Bank accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid REFERENCES clinics(id) ON DELETE CASCADE,
  account_number text,
  iban text NOT NULL UNIQUE,
  bic text,
  is_demo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bank_accounts_clinic_id ON bank_accounts(clinic_id);

-- ============================================================
-- PART 3: Extend providers for billing entities
-- ============================================================

ALTER TABLE providers ADD COLUMN IF NOT EXISTS billing_type text
  CHECK (billing_type IS NULL OR billing_type IN ('medical', 'aesthetic'));
ALTER TABLE providers ADD COLUMN IF NOT EXISTS invoice_method text
  CHECK (invoice_method IS NULL OR invoice_method IN ('tardoc_insurer', 'direct_patient'));
ALTER TABLE providers ADD COLUMN IF NOT EXISTS vat_enabled boolean DEFAULT false;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS vat_rate numeric(5,2);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS bank_account_id uuid
  REFERENCES bank_accounts(id) ON DELETE SET NULL;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS clinic_id uuid
  REFERENCES clinics(id) ON DELETE SET NULL;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS doctor_id uuid
  REFERENCES providers(id) ON DELETE SET NULL;
ALTER TABLE providers ADD COLUMN IF NOT EXISTS retrocession_pct numeric(5,2);
ALTER TABLE providers ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_providers_doctor_id ON providers(doctor_id);
CREATE INDEX IF NOT EXISTS idx_providers_bank_account_id ON providers(bank_account_id);
CREATE INDEX IF NOT EXISTS idx_providers_clinic_id ON providers(clinic_id);

-- ============================================================
-- PART 4: Seed clinic
-- ============================================================

INSERT INTO clinics (id, name, address, rcc, vat_number, bank_name, bic, gln, is_demo)
VALUES (
  '22222222-2222-2222-2222-000000000001',
  'TOA SA',
  'Voie du Chariot 6, 1003 Lausanne',
  'Z797322',
  'CHE-399.246.847',
  'UBS',
  'UBSWCHZH80A',
  NULL, -- pending
  false
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  address = EXCLUDED.address,
  rcc = EXCLUDED.rcc,
  vat_number = EXCLUDED.vat_number,
  bank_name = EXCLUDED.bank_name,
  bic = EXCLUDED.bic,
  updated_at = now();

-- ============================================================
-- PART 5: Seed bank accounts
-- ============================================================

INSERT INTO bank_accounts (id, clinic_id, account_number, iban, bic, is_demo)
VALUES
  ('33333333-3333-3333-3333-000000000001', '22222222-2222-2222-2222-000000000001',
   '243-540820.03X', 'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', false),
  ('33333333-3333-3333-3333-000000000002', '22222222-2222-2222-2222-000000000001',
   '243-540820.01V', 'CH26 0024 3243 5408 2001 V', 'UBSWCHZH80A', false),
  ('33333333-3333-3333-3333-000000000003', '22222222-2222-2222-2222-000000000001',
   '243-540820.02N', 'CH64 0024 3243 5408 2002 N', 'UBSWCHZH80A', false)
ON CONFLICT (iban) DO UPDATE SET
  account_number = EXCLUDED.account_number,
  bic = EXCLUDED.bic,
  clinic_id = EXCLUDED.clinic_id;

-- ============================================================
-- PART 6: Seed billing entities (11 practitioners)
-- ============================================================

-- Helper: lookup doctor IDs by name
WITH doctor_ids AS (
  SELECT id, name FROM providers WHERE role = 'doctor'
),
account_1 AS (SELECT id FROM bank_accounts WHERE iban = 'CH04 0024 3243 5408 2003 X'),
account_2 AS (SELECT id FROM bank_accounts WHERE iban = 'CH26 0024 3243 5408 2001 V'),
account_3 AS (SELECT id FROM bank_accounts WHERE iban = 'CH64 0024 3243 5408 2002 N'),
clinic_id AS (SELECT id FROM clinics WHERE name = 'TOA SA')
INSERT INTO providers (
  id, name, role, billing_type, invoice_method, vat_enabled, vat_rate,
  iban, bic, zsr, bank_account_id, clinic_id, doctor_id, notes, is_demo
)
VALUES
  -- Dr Plakalo (medical, tardoc, no VAT) → Account 1
  ('44444444-4444-4444-4444-000000000001', 'Dr Plakalo', 'billing_entity',
    'medical', 'tardoc_insurer', false, NULL,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr. Adnan Plakalo'),
    'Aesthetic only per Melissa — Tardoc invoices unlikely but account exists', false),

  -- Soins Plakalo (aesthetic, direct, VAT 8.1%) → Account 1
  ('44444444-4444-4444-4444-000000000002', 'Soins Plakalo', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr. Adnan Plakalo'),
    NULL, false),

  -- Dr Koltunova (medical, tardoc, no VAT) → Account 1
  ('44444444-4444-4444-4444-000000000003', 'Dr Koltunova', 'billing_entity',
    'medical', 'tardoc_insurer', false, NULL,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Natalia Koltunova'),
    NULL, false),

  -- Soins Koltunova (aesthetic, direct, VAT 8.1%) → Account 1
  ('44444444-4444-4444-4444-000000000004', 'Soins Koltunova', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Natalia Koltunova'),
    NULL, false),

  -- Soins Assistantes (aesthetic only, no Dr) → Account 1
  ('44444444-4444-4444-4444-000000000005', 'Soins Assistantes', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    NULL,
    'Aesthetic only — no corresponding Dr account', false),

  -- Soins Benani (aesthetic only, no Dr account but linked to Dr Reda Benani as person) → Account 1
  ('44444444-4444-4444-4444-000000000006', 'Soins Benani', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Reda Benani'),
    'Aesthetic only — no corresponding Dr account', false),

  -- Soins Miles (aesthetic, direct, VAT 8.1%) → Account 1
  ('44444444-4444-4444-4444-000000000007', 'Soins Miles', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Alexandra Miles'),
    'Aesthetic side uses Account 1 IBAN; Dr Miles medical side uses Account 2', false),

  -- Soins Nordback (aesthetic, direct, VAT 8.1%) → Account 1
  ('44444444-4444-4444-4444-000000000008', 'Soins Nordback', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Sophie Nordback'),
    'Aesthetic side uses Account 1 IBAN; Dr Nordback medical side uses Account 3', false),

  -- Soins Guarino (aesthetic only) → Account 1
  ('44444444-4444-4444-4444-000000000009', 'Soins Guarino', 'billing_entity',
    'aesthetic', 'direct_patient', true, 8.1,
    'CH04 0024 3243 5408 2003 X', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_1), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Laetitia Guarino'),
    'Aesthetic only — no corresponding Dr account', false),

  -- Dr Miles (medical, tardoc, no VAT) → Account 2
  ('44444444-4444-4444-4444-000000000010', 'Dr Miles', 'billing_entity',
    'medical', 'tardoc_insurer', false, NULL,
    'CH26 0024 3243 5408 2001 V', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_2), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Alexandra Miles'),
    NULL, false),

  -- Dr Nordback (medical, tardoc, no VAT) → Account 3
  ('44444444-4444-4444-4444-000000000011', 'Dr Nordback', 'billing_entity',
    'medical', 'tardoc_insurer', false, NULL,
    'CH64 0024 3243 5408 2002 N', 'UBSWCHZH80A', 'Z797322',
    (SELECT id FROM account_3), (SELECT id FROM clinic_id),
    (SELECT id FROM doctor_ids WHERE name = 'Dr Sophie Nordback'),
    NULL, false)

ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  billing_type = EXCLUDED.billing_type,
  invoice_method = EXCLUDED.invoice_method,
  vat_enabled = EXCLUDED.vat_enabled,
  vat_rate = EXCLUDED.vat_rate,
  iban = EXCLUDED.iban,
  bic = EXCLUDED.bic,
  zsr = EXCLUDED.zsr,
  bank_account_id = EXCLUDED.bank_account_id,
  clinic_id = EXCLUDED.clinic_id,
  doctor_id = EXCLUDED.doctor_id,
  notes = EXCLUDED.notes;

-- ============================================================
-- PART 7: Verification
-- ============================================================

SELECT
  be.name AS billing_entity,
  be.billing_type,
  be.invoice_method,
  be.vat_enabled,
  be.vat_rate,
  ba.account_number,
  be.iban,
  d.name AS linked_doctor
FROM providers be
LEFT JOIN bank_accounts ba ON be.bank_account_id = ba.id
LEFT JOIN providers d ON be.doctor_id = d.id
WHERE be.role = 'billing_entity'
  AND be.id::text LIKE '44444444-%'
ORDER BY be.name;

-- Show doctors with their billing identities
SELECT
  d.name AS doctor,
  array_agg(be.name ORDER BY be.billing_type DESC) AS billing_entities
FROM providers d
LEFT JOIN providers be ON be.doctor_id = d.id AND be.role = 'billing_entity'
WHERE d.role = 'doctor'
GROUP BY d.id, d.name
ORDER BY d.name;

COMMIT;
