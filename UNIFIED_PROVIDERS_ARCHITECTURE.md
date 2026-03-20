# Unified Providers Architecture

## Overview
The `providers` table serves a **dual purpose** by using a `role` field to distinguish between:
1. **Billing entities** (clinics) - role = `'billing_entity'`
2. **Medical staff** (doctors and nurses) - role = `'doctor'`, `'nurse'`, or `'technician'`

## Providers Table Structure

### Role Types

| Role | Description | Has GLN/ZSR | Has IBAN | Name on Invoice |
|------|-------------|-------------|----------|-----------------|
| `billing_entity` | Clinic/company that bills | ✅ Yes | ✅ Yes (required) | Yes (as biller) |
| `doctor` | Medical doctor | ✅ Yes (required) | ❌ No | Yes (as treating physician) |
| `nurse` | Nurse | ❌ No | ❌ No | ❌ No (hidden) |
| `technician` | Technician | ❌ No | ❌ No | ❌ No (hidden) |

### Fields
```sql
id              -- UUID primary key
name            -- Name (clinic name or staff name)
role            -- 'billing_entity', 'doctor', 'nurse', 'technician'
specialty       -- Medical specialty (for doctors)
email           -- Contact email
phone           -- Contact phone
gln             -- GLN number (required for billing_entity and doctor)
zsr             -- ZSR number (for billing_entity and doctor)
iban            -- Bank IBAN (required for billing_entity, used for QR bill)
street          -- Address
street_no       -- Building number
zip_code        -- Postal code
city            -- City
canton          -- Canton (for tax point calculations)
```

## Invoice Structure

### Invoice Fields

```sql
-- Billing entity (clinic) - REQUIRED
provider_id         -- FK to providers WHERE role='billing_entity'
provider_name       -- Clinic name
provider_gln        -- Clinic GLN (for TARDOC <billers>)
provider_zsr        -- Clinic ZSR (for TARDOC <billers>)
provider_iban       -- Clinic IBAN (ALWAYS used for QR bill payment)

-- Medical staff (doctor/nurse) - REQUIRED
doctor_user_id      -- FK to providers WHERE role IN ('doctor','nurse','technician')
doctor_name         -- Staff name (shown only if doctor)
doctor_gln          -- Staff GLN (only if doctor, for TARDOC <providers>)
doctor_zsr          -- Staff ZSR (only if doctor, for TARDOC <providers>)
doctor_canton       -- Staff canton (for tax calculations)
```

## Frontend Dropdowns

### 1. Billing Entity Dropdown (REQUIRED)
```sql
SELECT id, name 
FROM providers 
WHERE role = 'billing_entity'
ORDER BY name;
```

Shows:
- Aesthetics Clinic XT SA
- Aesthetics Access
- Aesthetics Gstaad
- The Beauty Booth
- MedCapital

### 2. Medical Staff Dropdown (REQUIRED)
```sql
SELECT id, name, role, specialty
FROM providers 
WHERE role IN ('doctor', 'nurse', 'technician')
ORDER BY role, name;
```

Shows all doctors and nurses.

## Business Rules

### 1. Invoice Display
- **Billed by**: [Clinic name from provider_id]
- **Payment**: [Clinic IBAN from provider_iban] on QR bill
- **Treating physician**: 
  - If `staff.role = 'doctor'`: Show doctor name
  - If `staff.role IN ('nurse', 'technician')`: **Hide name**

### 2. TARDOC XML Generation

#### If Medical Staff is a Doctor
```xml
<invoice:billers>
  <invoice:biller_gln gln="[clinic GLN from provider_id]">
    <!-- Clinic details -->
  </invoice:biller_gln>
</invoice:billers>

<invoice:providers>
  <invoice:provider_gln gln="[doctor GLN from doctor_user_id]">
    <!-- Doctor details -->
  </invoice:provider_gln>
</invoice:providers>

<invoice:service_ex 
  provider_id="[doctor GLN]" 
  responsible_id="[doctor GLN]" 
/>
```

#### If Medical Staff is a Nurse
```xml
<invoice:billers>
  <invoice:biller_gln gln="[clinic GLN from provider_id]">
    <!-- Clinic details -->
  </invoice:biller_gln>
</invoice:billers>

<invoice:providers>
  <invoice:provider_gln gln="[clinic GLN from provider_id]">
    <!-- Clinic details (fallback) -->
  </invoice:provider_gln>
</invoice:providers>

<invoice:service_ex 
  provider_id="[clinic GLN]" 
  responsible_id="[clinic GLN]" 
/>
```

## Database Trigger Logic

When an invoice is created/updated, the trigger automatically:

1. **Validates provider_id** points to a billing entity (role='billing_entity')
2. **Validates doctor_user_id** points to medical staff (role='doctor'/'nurse'/'technician')
3. **Populates provider_iban** from the billing entity
4. **Populates doctor_gln, doctor_zsr, doctor_canton** from medical staff
5. **Clears doctor_gln and doctor_zsr** if staff is a nurse/technician (they don't have billing credentials)

## Migration Order

Run migrations in this order:

1. ✅ **`008_add_role_to_providers.sql`** - Adds `role` column to providers table
2. ✅ **`006_update_invoice_billing_logic.sql`** - Adds billing fields to invoices + trigger
3. ⚠️ **Manual step**: Update existing providers to set correct roles
4. ⚠️ **Manual step**: Add doctors and nurses as providers with appropriate roles

## Example Queries

### Get all billing entities
```sql
SELECT * FROM providers WHERE role = 'billing_entity';
```

### Get all doctors
```sql
SELECT * FROM providers WHERE role = 'doctor';
```

### Get all nurses
```sql
SELECT * FROM providers WHERE role IN ('nurse', 'technician');
```

### Get invoice with full billing info
```sql
SELECT 
  i.*,
  billing.name as billing_entity_name,
  billing.iban as payment_iban,
  staff.name as staff_name,
  staff.role as staff_role,
  staff.gln as staff_gln
FROM invoices i
JOIN providers billing ON i.provider_id = billing.id
JOIN providers staff ON i.doctor_user_id = staff.id
WHERE i.id = '[invoice_id]';
```

## Key Benefits

✅ **Single source of truth** - All providers (clinics and staff) in one table
✅ **Simple role-based filtering** - Easy to query by role
✅ **Automatic validation** - Trigger ensures correct roles are used
✅ **Flexible** - Easy to add new roles or entity types
✅ **Clean architecture** - No need for separate doctors/users table
