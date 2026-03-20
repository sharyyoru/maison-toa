# Old vs New Invoice Architecture

## OLD System (Before Role Field)

### Single `providers` table used for everything:
```sql
-- Old invoice structure
provider_id -> providers.id  (could be doctor OR clinic, no distinction)
provider_name -> snapshot
provider_gln -> snapshot
provider_zsr -> snapshot
doctor_user_id -> NULL (not used)
```

**Problem**: No way to distinguish between:
- Billing entity (clinic with IBAN)
- Medical staff (doctor/nurse who performed service)

## NEW System (With Role Field)

### Same `providers` table, but with `role` field:

```sql
-- Providers table now has role
role = 'billing_entity'  -- Clinics (5 entities)
role = 'doctor'          -- Doctors (have GLN/ZSR)
role = 'nurse'           -- Nurses (no GLN/ZSR)
role = 'technician'      -- Technicians (no GLN/ZSR)
```

### New invoice structure:
```sql
-- Billing entity (clinic)
provider_id -> providers.id WHERE role='billing_entity'
provider_name -> snapshot
provider_gln -> snapshot
provider_zsr -> snapshot
provider_iban -> NEW: clinic IBAN for QR bill

-- Medical staff (doctor/nurse)
doctor_user_id -> providers.id WHERE role IN ('doctor','nurse','technician')
doctor_name -> snapshot
doctor_gln -> NEW: staff GLN (only if doctor)
doctor_zsr -> NEW: staff ZSR (only if doctor)
doctor_canton -> NEW: staff canton
```

## Migration Strategy

### For OLD Invoices (before role field):

**Scenario 1: Old invoice with only `provider_id`**
```sql
-- Old data
provider_id = 'abc-123'  -- Was the doctor
doctor_user_id = NULL
provider_gln = '7601000000001'
doctor_gln = NULL
```

**Fallback logic:**
1. Try to fetch from `providers` using `provider_id`
2. If `doctor_user_id` is NULL, assume `provider_id` was the doctor
3. Use invoice snapshot fields (`provider_gln`, `provider_zsr`) for doctor data
4. Use hardcoded IBAN fallback if `provider_iban` is NULL

### For NEW Invoices (with role field):

**Scenario 2: New invoice with both IDs**
```sql
-- New data
provider_id = 'clinic-123'     -- Billing entity (role='billing_entity')
doctor_user_id = 'doctor-456'  -- Medical staff (role='doctor')
provider_iban = 'CH09...'      -- Clinic IBAN
doctor_gln = '7601000000001'   -- Doctor GLN
```

**Direct lookup:**
1. Fetch billing entity from `providers` WHERE `id = provider_id`
2. Fetch medical staff from `providers` WHERE `id = doctor_user_id`
3. Use live data + snapshot fields

## Fallback Chain for PDF Generation

### IBAN (for QR bill):
```
1. invoice.provider_iban (NEW field)
2. live providers.iban (from provider_id)
3. hardcoded default: "CH0930788000050249289"
```

### Doctor GLN (for TARDOC XML):
```
1. invoice.doctor_gln (NEW field)
2. live providers.gln (from doctor_user_id)
3. invoice.provider_gln (OLD snapshot, if doctor_user_id is NULL)
4. NULL (will fail TARDOC validation)
```

### Doctor ZSR (for TARDOC XML):
```
1. invoice.doctor_zsr (NEW field)
2. live providers.zsr (from doctor_user_id)
3. invoice.provider_zsr (OLD snapshot, if doctor_user_id is NULL)
4. NULL
```

## Frontend Changes

### OLD: Single dropdown
```typescript
// Only selected provider (could be doctor or clinic)
provider_id: selectedProviderId
```

### NEW: Two dropdowns
```typescript
// Billing entity dropdown (clinics only)
provider_id: selectedProviderId  // WHERE role='billing_entity'

// Medical staff dropdown (doctors and nurses)
doctor_user_id: consultationDoctorId  // WHERE role IN ('doctor','nurse','technician')
```

## Data Migration Steps

### Step 1: Add role to existing providers
```sql
-- Identify which providers are billing entities (have IBAN)
UPDATE providers 
SET role = 'billing_entity' 
WHERE iban IS NOT NULL;

-- Identify which providers are doctors (have GLN)
UPDATE providers 
SET role = 'doctor' 
WHERE gln IS NOT NULL AND role IS NULL;

-- Rest are nurses/technicians
UPDATE providers 
SET role = 'nurse' 
WHERE role IS NULL;
```

### Step 2: Backfill invoice fields
```sql
-- Backfill provider_iban from billing entities
UPDATE invoices i
SET provider_iban = p.iban
FROM providers p
WHERE i.provider_id = p.id
AND p.role = 'billing_entity'
AND i.provider_iban IS NULL;

-- For old invoices where provider_id was the doctor
-- Copy provider_id to doctor_user_id if doctor_user_id is NULL
UPDATE invoices
SET doctor_user_id = provider_id
WHERE doctor_user_id IS NULL
AND provider_id IS NOT NULL;

-- Backfill doctor fields from providers
UPDATE invoices i
SET 
  doctor_gln = p.gln,
  doctor_zsr = p.zsr,
  doctor_canton = p.canton
FROM providers p
WHERE i.doctor_user_id = p.id
AND p.role = 'doctor'
AND i.doctor_gln IS NULL;
```

### Step 3: Verify migration
```sql
-- Check for invoices missing critical data
SELECT 
  COUNT(*) as total,
  COUNT(provider_iban) as has_iban,
  COUNT(doctor_user_id) as has_doctor,
  COUNT(CASE WHEN billing_type='TP' AND doctor_gln IS NULL THEN 1 END) as insurance_missing_gln
FROM invoices;
```

## Summary

✅ **Old invoices continue to work** via fallback logic
✅ **New invoices use improved structure** with separate billing entity and medical staff
✅ **PDF generation handles both** old and new data formats
✅ **No data loss** - all old data preserved in snapshot fields
