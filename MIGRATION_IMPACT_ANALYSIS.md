# Migration Impact Analysis & Solutions

## Problem Summary

You're transitioning from a system where:
- **OLD**: `doctor_user_id` → `users` table (doctors/staff)
- **NEW**: `staff_provider_id` → `providers` table (with role field)

This creates a **foreign key conflict** because existing invoices reference the `users` table, but new code wants to use the `providers` table.

## Impact on Existing Data

### 1. **Existing Invoices (BEFORE migration)**
```sql
SELECT 
  id,
  doctor_user_id,        -- Points to users.id
  doctor_name,           -- Snapshot
  provider_id,           -- Points to providers.id
  provider_name,         -- Snapshot
  provider_gln,          -- Snapshot
  provider_zsr,          -- Snapshot
  provider_iban,         -- NULL (doesn't exist yet)
  doctor_gln,            -- NULL (doesn't exist yet)
  doctor_zsr,            -- NULL (doesn't exist yet)
  doctor_canton          -- NULL (doesn't exist yet)
FROM invoices;
```

**Issues:**
- ❌ No `provider_iban` → PDF generation uses hardcoded fallback
- ❌ No `doctor_gln`/`doctor_zsr` → TARDOC XML generation may fail
- ❌ `doctor_user_id` points to `users` table, not `providers`

### 2. **PDF Generation Impact**
- **Cash invoices**: Will use hardcoded IBAN `"CH0930788000050249289"` instead of correct clinic IBAN
- **Insurance invoices**: May fail TARDOC XML generation due to missing doctor GLN/ZSR

### 3. **Database Constraint Issue**
Current FK constraint:
```sql
CONSTRAINT invoices_doctor_user_id_fkey 
FOREIGN KEY (doctor_user_id) REFERENCES public.users(id)
```

If you try to insert `doctor_user_id` with a `providers.id`, it will **FAIL** because of FK constraint violation.

## Recommended Solution: Dual System

### Architecture

Keep both systems running in parallel:

| Field | References | Used For | Status |
|-------|------------|----------|--------|
| `doctor_user_id` | `users.id` | **Old invoices** | Keep for backward compatibility |
| `staff_provider_id` | `providers.id` | **New invoices** | Add new field |

### Migration Steps

#### Step 1: Add `staff_provider_id` field
```sql
-- Run migration 009_fix_dual_reference_system.sql
ALTER TABLE public.invoices 
ADD COLUMN IF NOT EXISTS staff_provider_id UUID REFERENCES public.providers(id);
```

#### Step 2: Update trigger to handle both systems
The trigger will:
- Check `staff_provider_id` first (new system)
- Fall back to `doctor_user_id` (old system)
- Populate `provider_iban`, `doctor_gln`, `doctor_zsr`, `doctor_canton`

#### Step 3: Backfill existing invoices

**Option A: Match by email/name (automated)**
```sql
-- Match users to providers by email or name
UPDATE invoices i
SET staff_provider_id = p.id
FROM users u
JOIN providers p ON (
  LOWER(p.email) = LOWER(u.email) 
  OR LOWER(p.name) = LOWER(u.full_name)
)
WHERE i.doctor_user_id = u.id
AND i.staff_provider_id IS NULL
AND p.role IN ('doctor', 'nurse', 'technician');

-- Check results
SELECT 
  COUNT(*) as total_invoices,
  COUNT(staff_provider_id) as matched_invoices,
  COUNT(*) - COUNT(staff_provider_id) as unmatched_invoices
FROM invoices;
```

**Option B: Manual mapping (if automated fails)**
```sql
-- Create temporary mapping table
CREATE TEMP TABLE user_provider_mapping (
  user_id UUID,
  provider_id UUID
);

-- Insert mappings manually
INSERT INTO user_provider_mapping VALUES
  ('user-id-1', 'provider-id-1'),
  ('user-id-2', 'provider-id-2');

-- Apply mappings
UPDATE invoices i
SET staff_provider_id = m.provider_id
FROM user_provider_mapping m
WHERE i.doctor_user_id = m.user_id;
```

#### Step 4: Backfill billing fields
```sql
-- Backfill provider_iban from providers
UPDATE invoices i
SET provider_iban = p.iban
FROM providers p
WHERE i.provider_id = p.id
AND i.provider_iban IS NULL;

-- Backfill doctor_gln, doctor_zsr, doctor_canton (only for doctors)
UPDATE invoices i
SET 
  doctor_gln = p.gln,
  doctor_zsr = p.zsr,
  doctor_canton = p.canton
FROM providers p
WHERE i.staff_provider_id = p.id
AND p.role = 'doctor'
AND i.doctor_gln IS NULL;
```

#### Step 5: Verify backfill
```sql
-- Check invoices missing critical data
SELECT 
  id,
  invoice_number,
  payment_method,
  billing_type,
  provider_iban IS NULL as missing_iban,
  doctor_gln IS NULL as missing_doctor_gln,
  staff_provider_id IS NULL as missing_staff_mapping
FROM invoices
WHERE provider_iban IS NULL 
   OR (billing_type = 'TP' AND doctor_gln IS NULL);
```

## Code Changes Summary

### Frontend (`MedicalConsultationsCard.tsx`)
✅ **Updated**: Now saves both `doctor_user_id` AND `staff_provider_id`
```typescript
invoiceInsertPayload = {
  staff_provider_id: consultationDoctorId,  // NEW: FK to providers
  doctor_user_id: consultationDoctorId,     // OLD: Keep for compatibility
  // ... rest
}
```

### Backend (`generate-pdf/route.ts`)
✅ **Updated**: Tries both systems
```typescript
// Try new system first
const staffId = invoiceData.staff_provider_id || invoiceData.doctor_user_id;

// Try providers table first
const staffData = await getFromProviders(staffId);

// Fallback to users table if not found
if (!staffData) {
  const userData = await getFromUsers(staffId);
}
```

### Database Trigger
✅ **Updated**: Handles both old and new systems
```sql
-- Prefers staff_provider_id, falls back to doctor_user_id
staff_id := COALESCE(NEW.staff_provider_id, NEW.doctor_user_id);
```

## Rollback Strategy

If something goes wrong:

### 1. Remove new field
```sql
ALTER TABLE public.invoices DROP COLUMN IF EXISTS staff_provider_id;
```

### 2. Revert trigger
```sql
DROP TRIGGER IF EXISTS trigger_populate_invoice_billing_fields ON public.invoices;
-- Restore old trigger (if you had one)
```

### 3. Revert code changes
- Remove `staff_provider_id` from invoice creation
- Remove dual-system logic from PDF generation

## Testing Checklist

- [ ] Create new invoice with billing entity + doctor → Check `staff_provider_id` is populated
- [ ] Create new invoice with billing entity + nurse → Check `doctor_gln` is NULL
- [ ] Generate PDF for old invoice (with only `doctor_user_id`) → Should work with fallback
- [ ] Generate PDF for new invoice (with `staff_provider_id`) → Should use correct data
- [ ] Generate TARDOC XML for insurance invoice → Check doctor GLN is correct
- [ ] Verify QR bill uses correct clinic IBAN (not hardcoded)

## Migration Timeline

1. **Phase 1: Add new field** (Safe, no breaking changes)
   - Run migration `009_fix_dual_reference_system.sql`
   - Deploy updated code
   - Test with new invoices

2. **Phase 2: Backfill data** (Run during low traffic)
   - Match users to providers
   - Backfill billing fields
   - Verify results

3. **Phase 3: Monitor** (1-2 weeks)
   - Check for any issues with old invoices
   - Verify PDF generation works for all invoices
   - Monitor error logs

4. **Phase 4: Cleanup** (Optional, after 1-2 months)
   - Once confident all data is migrated
   - Consider deprecating `doctor_user_id` (but keep for historical data)

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| Old invoices can't generate PDFs | 🔴 High | Dual system with fallback logic |
| User-to-provider matching fails | 🟡 Medium | Manual mapping option provided |
| Missing IBAN for old invoices | 🟡 Medium | Backfill script + hardcoded fallback |
| FK constraint violation | 🟢 Low | New field doesn't conflict with old FK |

## Conclusion

✅ **Safe to proceed** with the dual system approach
- Old invoices continue to work (backward compatible)
- New invoices use the improved system
- Gradual migration path with backfill scripts
- Rollback strategy available if needed
