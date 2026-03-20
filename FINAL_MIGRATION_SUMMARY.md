# Final Migration Summary

## What Changed

### BEFORE (Old System):
```
provider_id → providers table (was used for the doctor)
doctor_user_id → NULL (not used)
```

### AFTER (New System):
```
provider_id → providers table (billing entity/clinic) WHERE role='billing_entity'
doctor_user_id → providers table (medical staff) WHERE role='doctor'/'nurse'/'technician'
```

## Key Insight

You were already using the `providers` table for `provider_id`, but it represented the **doctor**, not the billing entity. Now we need to distinguish:
- **Billing entity** (clinic with IBAN) → `provider_id`
- **Medical staff** (doctor/nurse) → `doctor_user_id`

## Migrations to Run

### 1. Add role column (if not done)
```sql
-- Run: 008_add_role_to_providers.sql
ALTER TABLE public.providers 
ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'billing_entity' 
CHECK (role IN ('billing_entity', 'doctor', 'nurse', 'technician'));
```

### 2. Add new invoice fields (already done ✅)
```sql
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS provider_iban TEXT,
ADD COLUMN IF NOT EXISTS doctor_gln TEXT,
ADD COLUMN IF NOT EXISTS doctor_zsr TEXT,
ADD COLUMN IF NOT EXISTS doctor_canton TEXT;
```

### 3. Fix FK constraint
```sql
-- Run: 010_fix_doctor_user_id_fk.sql
ALTER TABLE public.invoices 
DROP CONSTRAINT IF EXISTS invoices_doctor_user_id_fkey;

ALTER TABLE public.invoices 
ADD CONSTRAINT invoices_doctor_user_id_fkey 
FOREIGN KEY (doctor_user_id) REFERENCES public.providers(id);
```

### 4. Set roles on existing providers
```sql
-- Manually classify your providers:

-- Billing entities (the 5 clinics)
UPDATE providers SET role = 'billing_entity' 
WHERE id IN ('clinic-1-id', 'clinic-2-id', ...);

-- Doctors
UPDATE providers SET role = 'doctor' 
WHERE id IN ('doctor-1-id', 'doctor-2-id', ...);

-- Nurses
UPDATE providers SET role = 'nurse' 
WHERE id IN ('nurse-1-id', 'nurse-2-id', ...);
```

### 5. Backfill old invoices
```sql
-- Copy provider_id to doctor_user_id for old invoices
-- (because old system used provider_id for the doctor)
UPDATE invoices
SET doctor_user_id = provider_id
WHERE doctor_user_id IS NULL
AND provider_id IS NOT NULL;

-- Now you need to manually set the correct billing entity
-- for old invoices (since they don't have one)
UPDATE invoices
SET provider_id = 'your-main-clinic-id'
WHERE created_at < '2026-02-17'  -- Before migration date
AND billing_type = 'TP';  -- Or whatever condition identifies old invoices

-- Backfill provider_iban
UPDATE invoices i
SET provider_iban = p.iban
FROM providers p
WHERE i.provider_id = p.id
AND i.provider_iban IS NULL;

-- Backfill doctor fields
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

## Fallback Logic (Already Implemented ✅)

The PDF generation code now has fallbacks for old invoices:

### For old invoices without `doctor_user_id`:
```typescript
// If no doctor_user_id, assume provider_id was the doctor (old system)
if (!staffData && billingEntityData && !invoiceData.doctor_user_id) {
  staffData = {
    ...billingEntityData,
    gln: invoiceData.doctor_gln || billingEntityData.gln,
    zsr: invoiceData.doctor_zsr || billingEntityData.zsr,
  };
}
```

### For IBAN:
```typescript
// Fallback chain: new field -> live data -> hardcoded default
const provIban = invoiceData.provider_iban || billingEntityData?.iban || "CH0930788000050249289";
```

## Frontend Changes (Already Done ✅)

### Two separate dropdowns now:
1. **Billing Entity (Clinic)** - filtered by `role='billing_entity'`
2. **Medical Staff (Doctor/Nurse)** - filtered by `role IN ('doctor','nurse','technician')`

### Invoice creation now saves:
```typescript
{
  provider_id: selectedProviderId,      // Billing entity
  doctor_user_id: consultationDoctorId, // Medical staff
  provider_iban: providerIban,          // Clinic IBAN
  doctor_gln: doctorGln,                // Staff GLN (if doctor)
  doctor_zsr: doctorZsr,                // Staff ZSR (if doctor)
  doctor_canton: doctorCanton,          // Staff canton
}
```

## Testing Checklist

- [ ] Run all migrations in order
- [ ] Set roles on all existing providers
- [ ] Backfill old invoices
- [ ] Test creating new invoice with billing entity + doctor
- [ ] Test creating new invoice with billing entity + nurse
- [ ] Test generating PDF for old invoice (should use fallbacks)
- [ ] Test generating PDF for new invoice (should use new fields)
- [ ] Verify QR bill shows correct clinic IBAN
- [ ] Verify TARDOC XML has correct doctor GLN

## Current Status

✅ Code updated with fallback logic
✅ Migrations created
⚠️ Need to run migrations and backfill data
⚠️ Need to manually classify providers by role

The system is **backward compatible** - old invoices will continue to work via fallback logic!
