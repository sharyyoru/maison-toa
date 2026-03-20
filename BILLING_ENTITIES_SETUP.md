# Billing Entities Setup Guide

## Overview
The system uses **billing entities** (clinics) and **medical staff** (doctors/nurses) separately.

## The 5 Billing Entities

These are stored in the `providers` table:

1. **Aesthetics Clinic XT SA**
2. **Aesthetics Access**
3. **Aesthetics Gstaad**
4. **The Beauty Booth**
5. **MedCapital**

Each entity has its own:
- GLN (for TARDOC insurance billing)
- ZSR (for TARDOC insurance billing)
- IBAN (bank account for payments)
- Address

## Medical Staff (Users Table)

### Doctors
- Have GLN and ZSR
- Name **appears on invoice**
- Used in TARDOC XML `<providers>` section

### Nurses/Technicians
- **No GLN or ZSR** (no billing credentials)
- Name **does NOT appear on invoice**
- Used for statistics only

## Invoice Creation Flow

### 1. User selects Billing Entity (REQUIRED)
Dropdown shows the 5 clinics:
- Aesthetics Clinic XT SA
- Aesthetics Access
- Aesthetics Gstaad
- The Beauty Booth
- MedCapital

This determines:
- Which bank account (IBAN) appears on QR bill
- Which entity name appears on invoice
- Which GLN/ZSR is used as biller in TARDOC XML

### 2. User selects Medical Staff (REQUIRED)
Dropdown shows all users (doctors and nurses)

This determines:
- Who performed the service (for statistics)
- If doctor: Name appears on invoice, GLN/ZSR used in TARDOC XML
- If nurse: Name hidden on invoice, clinic GLN/ZSR used as fallback

## Database Fields

### Invoices Table
```sql
provider_id         -- FK to providers (billing entity/clinic) - REQUIRED
provider_name       -- Clinic name
provider_gln        -- Clinic GLN (for TARDOC <billers>)
provider_zsr        -- Clinic ZSR (for TARDOC <billers>)
provider_iban       -- Clinic IBAN (for QR bill) - ALWAYS USED

doctor_user_id      -- FK to users (medical staff) - REQUIRED
doctor_name         -- Staff name (shown only if doctor)
doctor_gln          -- Staff GLN (only if doctor, for TARDOC <providers>)
doctor_zsr          -- Staff ZSR (only if doctor, for TARDOC <providers>)
doctor_canton       -- Staff canton (for tax calculations)
```

### Auto-Population Logic
When an invoice is created, a trigger automatically:
1. Populates `provider_iban` from the selected clinic
2. Populates `doctor_gln`, `doctor_zsr`, `doctor_canton` from the selected user
3. **Clears** `doctor_gln` and `doctor_zsr` if user is a nurse (not a doctor)

## Invoice Display Rules

### All Invoices
- **Billed by**: [Clinic name] (from provider_id)
- **Payment**: [Clinic IBAN] on QR bill (from provider_iban)

### If Medical Staff is a Doctor
- **Treating physician**: Dr. [Name] (shown on invoice)

### If Medical Staff is a Nurse
- **Treating physician**: (NOT shown on invoice)

## TARDOC XML Structure

### If Medical Staff is a Doctor
```xml
<invoice:billers>
  <invoice:biller_gln gln="[clinic GLN]">
    <!-- Clinic details -->
  </invoice:biller_gln>
</invoice:billers>

<invoice:providers>
  <invoice:provider_gln gln="[doctor GLN]">
    <!-- Doctor details -->
  </invoice:provider_gln>
</invoice:providers>

<invoice:service_ex provider_id="[doctor GLN]" responsible_id="[doctor GLN]" />
```

### If Medical Staff is a Nurse
```xml
<invoice:billers>
  <invoice:biller_gln gln="[clinic GLN]">
    <!-- Clinic details -->
  </invoice:biller_gln>
</invoice:billers>

<invoice:providers>
  <invoice:provider_gln gln="[clinic GLN]">
    <!-- Clinic details (fallback) -->
  </invoice:provider_gln>
</invoice:providers>

<invoice:service_ex provider_id="[clinic GLN]" responsible_id="[clinic GLN]" />
```

## Migration Scripts

### `005_add_tardoc_fields_to_doctors.sql`
Adds GLN, ZSR, IBAN, canton to **users** table (for doctors)

### `006_update_invoice_billing_logic.sql`
- Adds `provider_iban`, `doctor_gln`, `doctor_zsr`, `doctor_canton` to invoices table
- Creates trigger to auto-populate billing fields
- Clears doctor GLN/ZSR if user is a nurse

### `007_setup_billing_entities.sql`
Inserts the 5 billing entities into providers table
**TODO**: Fill in actual GLN, ZSR, IBAN, and address for each entity

## Next Steps

1. ✅ Run migration `005_add_tardoc_fields_to_doctors.sql`
2. ✅ Run migration `006_update_invoice_billing_logic.sql`
3. ⚠️ Update `007_setup_billing_entities.sql` with actual GLN/ZSR/IBAN for each clinic
4. ✅ Run migration `007_setup_billing_entities.sql`
5. 🔧 Update frontend invoice form:
   - Add dropdown for billing entity (5 clinics)
   - Keep dropdown for medical staff (doctors and nurses)
   - Show/hide doctor name based on user role
6. 🔧 Update PDF generation to use `provider_iban` for QR bill
7. 🔧 Update TARDOC XML generation to handle nurse fallback logic
