# Old Data Structure Explained

## OLD System (Before Role Field)

### The Doctor Record Had EVERYTHING

In the old system, a single provider record contained both doctor info AND billing entity info:

```sql
-- providers table (OLD)
{
  id: 'doctor-abc-123',
  name: 'Dr. Xavier Tenorio',
  specialty: 'Plastic Surgery',
  gln: '7601000771179',           -- Doctor's GLN
  zsr: 'Z276825',                 -- Doctor's ZSR
  iban: 'CH0930788000050249289',  -- Clinic's bank account (embedded in doctor record!)
  street: 'Chemin Rieu',          -- Clinic address (embedded in doctor record!)
  street_no: '18',
  zip_code: '1208',
  city: 'Genève',
  canton: 'GE',
  phone: '022 732 22 23',
  email: 'xavier@clinic.ch'
}
```

### Old Invoice Structure

```sql
-- invoices table (OLD)
{
  provider_id: 'doctor-abc-123',     -- Points to doctor (who has everything)
  doctor_user_id: NULL,              -- Not used
  
  -- Snapshot fields (saved at invoice creation)
  provider_name: 'Dr. Xavier Tenorio',
  provider_gln: '7601000771179',
  provider_zsr: 'Z276825',
  doctor_name: NULL,
  
  -- New fields don't exist yet
  provider_iban: NULL,
  doctor_gln: NULL,
  doctor_zsr: NULL,
  doctor_canton: NULL
}
```

### How PDF Generation Worked (OLD)

```typescript
// Fetch provider (which was the doctor)
const provider = await getProvider(invoice.provider_id);

// Use for EVERYTHING:
doctorName = provider.name;           // Dr. Xavier Tenorio
doctorGLN = provider.gln;             // 7601000771179
clinicIBAN = provider.iban;           // CH09... (embedded in doctor record!)
clinicAddress = provider.street;      // Chemin Rieu 18
```

**Key point**: The doctor record contained the clinic's IBAN and address!

---

## NEW System (With Role Field)

### Separation of Concerns

Now we separate doctor info from billing entity info:

```sql
-- Billing Entity (Clinic)
{
  id: 'clinic-xyz-789',
  name: 'Aesthetics Clinic XT SA',
  role: 'billing_entity',
  gln: '7601000771179',              -- Clinic's GLN
  zsr: 'Z276825',                    -- Clinic's ZSR
  iban: 'CH0930788000050249289',     -- Clinic's bank account
  street: 'Chemin Rieu',
  street_no: '18',
  zip_code: '1208',
  city: 'Genève',
  canton: 'GE'
}

-- Doctor (Medical Staff)
{
  id: 'doctor-abc-123',
  name: 'Dr. Xavier Tenorio',
  role: 'doctor',
  specialty: 'Plastic Surgery',
  gln: '7601000000001',              -- Doctor's personal GLN
  zsr: 'Z123456',                    -- Doctor's personal ZSR
  iban: NULL,                        -- No IBAN (doesn't bill directly)
  street: NULL,                      -- No address (uses clinic address)
  canton: 'GE'
}
```

### New Invoice Structure

```sql
-- invoices table (NEW)
{
  provider_id: 'clinic-xyz-789',     -- Billing entity (clinic)
  doctor_user_id: 'doctor-abc-123',  -- Medical staff (doctor)
  
  -- Snapshot fields
  provider_name: 'Aesthetics Clinic XT SA',
  provider_gln: '7601000771179',
  provider_zsr: 'Z276825',
  doctor_name: 'Dr. Xavier Tenorio',
  
  -- New fields (populated at invoice creation)
  provider_iban: 'CH0930788000050249289',  -- Clinic IBAN
  doctor_gln: '7601000000001',             -- Doctor GLN
  doctor_zsr: 'Z123456',                   -- Doctor ZSR
  doctor_canton: 'GE'                      -- Doctor canton
}
```

### How PDF Generation Works (NEW)

```typescript
// Fetch billing entity (clinic)
const billingEntity = await getProvider(invoice.provider_id);

// Fetch medical staff (doctor)
const doctor = await getProvider(invoice.doctor_user_id);

// Use separately:
doctorName = doctor.name;              // Dr. Xavier Tenorio
doctorGLN = doctor.gln;                // 7601000000001
clinicIBAN = billingEntity.iban;       // CH09...
clinicAddress = billingEntity.street;  // Chemin Rieu 18
```

---

## Fallback Logic for Old Invoices

### Problem: Old invoices don't have `doctor_user_id`

```sql
-- Old invoice
provider_id: 'doctor-abc-123'  -- This IS the doctor
doctor_user_id: NULL           -- Not set
```

### Solution: Use provider_id for BOTH doctor and billing entity

```typescript
// Fetch provider (which was the doctor in old system)
const provider = await getProvider(invoice.provider_id);

// If no doctor_user_id, this provider IS the doctor
if (!invoice.doctor_user_id) {
  // Use provider for BOTH roles
  billingEntity = provider;  // Has IBAN and address
  doctor = provider;         // Has GLN and ZSR
  
  // Prefer snapshot data from invoice (more accurate)
  doctorGLN = invoice.provider_gln || provider.gln;
  doctorZSR = invoice.provider_zsr || provider.zsr;
  clinicIBAN = provider.iban;  // Embedded in doctor record
}
```

### Fallback Chain for Each Field

**IBAN (for QR bill):**
```
1. invoice.provider_iban (NEW field)
2. billingEntity.iban (live data)
3. "CH0930788000050249289" (hardcoded fallback)
```

**Doctor GLN (for TARDOC XML):**
```
1. invoice.doctor_gln (NEW field)
2. doctor.gln (live data from doctor_user_id)
3. invoice.provider_gln (OLD snapshot - when provider_id was the doctor)
4. billingEntity.gln (fallback to provider_id)
```

**Doctor ZSR (for TARDOC XML):**
```
1. invoice.doctor_zsr (NEW field)
2. doctor.zsr (live data from doctor_user_id)
3. invoice.provider_zsr (OLD snapshot - when provider_id was the doctor)
4. billingEntity.zsr (fallback to provider_id)
```

---

## Migration Impact

### What happens to old provider records?

**Option 1: Keep them as-is (doctor with embedded billing info)**
```sql
-- Old doctor record stays the same
UPDATE providers 
SET role = 'doctor' 
WHERE id = 'doctor-abc-123';

-- This doctor still has IBAN and address embedded
-- Old invoices will continue to work via fallback logic
```

**Option 2: Create separate billing entity**
```sql
-- Create new billing entity record
INSERT INTO providers (id, name, role, gln, zsr, iban, street, ...)
VALUES ('clinic-xyz-789', 'Aesthetics Clinic XT SA', 'billing_entity', ...);

-- Update old doctor record (remove billing info)
UPDATE providers 
SET 
  role = 'doctor',
  iban = NULL,  -- Remove IBAN (now in billing entity)
  street = NULL -- Remove address (now in billing entity)
WHERE id = 'doctor-abc-123';

-- Update old invoices to use new billing entity
UPDATE invoices
SET provider_id = 'clinic-xyz-789'  -- Point to new billing entity
WHERE provider_id = 'doctor-abc-123'
AND created_at < '2026-02-17';
```

**Recommendation**: Option 1 is safer - keep old data as-is, fallback logic handles it.

---

## Summary

✅ **Old invoices**: `provider_id` was the doctor who had IBAN/address embedded
✅ **New invoices**: `provider_id` is billing entity, `doctor_user_id` is doctor (separate)
✅ **Fallback logic**: Uses `provider_id` for both roles if `doctor_user_id` is NULL
✅ **Snapshot fields**: Invoice saves copies of data at creation time (provider_name, provider_gln, etc.)
✅ **No data loss**: Old invoices continue to work with embedded billing info
