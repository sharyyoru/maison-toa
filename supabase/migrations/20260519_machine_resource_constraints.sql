-- ============================================================
-- PHASE 1: Machine Resource Constraints
-- Creates machines table, service_machines junction, and adds
-- machine_id + service_ids columns to appointments.
-- ============================================================

BEGIN;

-- 1. Machines table
CREATE TABLE IF NOT EXISTS machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  max_concurrent INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Service-Machine junction
CREATE TABLE IF NOT EXISTS service_machines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID NOT NULL REFERENCES services(id) ON DELETE CASCADE,
  machine_id UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  UNIQUE(service_id, machine_id)
);

CREATE INDEX IF NOT EXISTS idx_service_machines_service ON service_machines(service_id);
CREATE INDEX IF NOT EXISTS idx_service_machines_machine ON service_machines(machine_id);

-- 3. Add columns to appointments
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS machine_id UUID REFERENCES machines(id) ON DELETE SET NULL;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS service_ids UUID[] DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_appointments_machine_id ON appointments(machine_id);

-- ============================================================
-- 4. Seed machines
-- ============================================================

INSERT INTO machines (id, name, max_concurrent) VALUES
  ('aaaaaaaa-0001-0001-0001-000000000001', 'HIFU', 1),
  ('aaaaaaaa-0001-0001-0001-000000000002', 'ONDA', 1),
  ('aaaaaaaa-0001-0001-0001-000000000003', 'Miradry', 1),
  ('aaaaaaaa-0001-0001-0001-000000000004', 'Laser Platform (Pigment/Tattoo/Vascular/Pico)', 1),
  ('aaaaaaaa-0001-0001-0001-000000000005', 'Laser Hair Removal', 1),
  ('aaaaaaaa-0001-0001-0001-000000000006', 'CoolSculpting', 1),
  ('aaaaaaaa-0001-0001-0001-000000000007', 'LED Phototherapy', 2)
ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, max_concurrent = EXCLUDED.max_concurrent;

-- ============================================================
-- 5. Seed service_machines mappings
-- ============================================================

-- HIFU services → HIFU machine
INSERT INTO service_machines (service_id, machine_id)
SELECT s.id, 'aaaaaaaa-0001-0001-0001-000000000001'
FROM services s WHERE s.is_active = true AND s.name ILIKE '%HIFU%'
ON CONFLICT (service_id, machine_id) DO NOTHING;

-- ONDA services → ONDA machine
INSERT INTO service_machines (service_id, machine_id)
SELECT s.id, 'aaaaaaaa-0001-0001-0001-000000000002'
FROM services s WHERE s.is_active = true AND s.name ILIKE '%ONDA%'
ON CONFLICT (service_id, machine_id) DO NOTHING;

-- Miradry services → Miradry machine
INSERT INTO service_machines (service_id, machine_id)
SELECT s.id, 'aaaaaaaa-0001-0001-0001-000000000003'
FROM services s WHERE s.is_active = true AND s.name ILIKE '%Miradry%'
ON CONFLICT (service_id, machine_id) DO NOTHING;

-- Laser pigmentaire, détatouage, vasculaire, Pico → Laser Platform (shared machine)
INSERT INTO service_machines (service_id, machine_id)
SELECT s.id, 'aaaaaaaa-0001-0001-0001-000000000004'
FROM services s WHERE s.is_active = true AND (
  s.name ILIKE '%pigmentaire%' OR
  s.name ILIKE '%détatouage%' OR
  s.name ILIKE '%vasculaire%' OR
  s.name ILIKE '%Laser Pico%' OR
  s.name ILIKE '%pico melasma%'
)
ON CONFLICT (service_id, machine_id) DO NOTHING;

-- CoolSculpting services → CoolSculpting machine
INSERT INTO service_machines (service_id, machine_id)
SELECT s.id, 'aaaaaaaa-0001-0001-0001-000000000006'
FROM services s WHERE s.is_active = true AND (
  s.name ILIKE '%Coolsculpting%' OR
  s.name ILIKE '%coolsculpting%'
)
ON CONFLICT (service_id, machine_id) DO NOTHING;

-- LED / Masque LED → LED Phototherapy machine
INSERT INTO service_machines (service_id, machine_id)
SELECT s.id, 'aaaaaaaa-0001-0001-0001-000000000007'
FROM services s WHERE s.is_active = true AND (
  s.name ILIKE '%LED%' OR
  s.name ILIKE '%Photothérapie%' OR
  s.name ILIKE '%Phototherapy%'
)
ON CONFLICT (service_id, machine_id) DO NOTHING;

-- ============================================================
-- 6. Verification
-- ============================================================

SELECT m.name AS machine, m.max_concurrent, COUNT(sm.id) AS services_linked
FROM machines m
LEFT JOIN service_machines sm ON sm.machine_id = m.id
GROUP BY m.id, m.name, m.max_concurrent
ORDER BY m.name;

COMMIT;
