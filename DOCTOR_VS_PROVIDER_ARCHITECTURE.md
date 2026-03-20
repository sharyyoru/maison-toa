# Billing Architecture for TARDOC

## Summary
The system has two distinct entities:
- **Billing Entities (providers table)**: The 5 clinics that bill patients (Aesthetics Clinic XT, Aesthetics Access, Aesthetics Gstaad, The Beauty Booth, MedCapital)
- **Medical Staff (users table)**: Doctors and nurses who provide services

## Key Rules:
1. **Billing entity dropdown** must show the 5 clinics
2. **Each entity has its own bank account/IBAN** for invoices
3. **If provider is a doctor**: Name appears on invoice
4. **If provider is a nurse-technician**: Name does NOT appear on invoice
5. **Provider identity used for statistics** only
6. **Nurses don't have GLN/ZSR** (no billing-relevant details)

## TARDOC XML Structure (from sample)

### For Insurance Invoices (Tiers Payant):

```xml
<!-- BILLER = Who bills the insurance (financial entity) -->
<invoice:billers>
  <invoice:biller_gln gln="7601000771179">
    <invoice:person>
      <invoice:familyname>Tenorio</invoice:familyname>
      <invoice:givenname>Xavier</invoice:givenname>
    </invoice:person>
  </invoice:biller_gln>
</invoice:billers>

<!-- PROVIDER = Who performed the medical services (treating physician) -->
<invoice:providers>
  <invoice:provider_gln gln="7601000771179">
    <invoice:person>
      <invoice:familyname>Tenorio</invoice:familyname>
      <invoice:givenname>Xavier</invoice:givenname>
    </invoice:person>
  </invoice:provider_gln>
</invoice:providers>

<!-- SERVICES = Each service references provider_id and responsible_id -->
<invoice:service_ex 
  provider_id="7601000771179" 
  responsible_id="7601000771179"
  code="AA.00.0010"
  ...
/>
```

## Database Architecture

### Providers Table (Billing Entities):
The 5 clinics that bill patients:
1. Aesthetics Clinic XT SA
2. Aesthetics Access
3. Aesthetics Gstaad
4. The Beauty Booth
5. MedCapital

Fields:
- `name` - Clinic name (appears on invoice)
- `gln` - Clinic GLN (used in TARDOC XML `<billers>` section)
- `zsr` - Clinic ZSR (used in TARDOC XML `<billers>` section)
- `iban` - Clinic bank account (used for QR bill payment)
- `street`, `street_no`, `zip_code`, `city`, `canton` - Clinic address

### Users Table (Medical Staff):
Doctors and nurses who provide services:

**Doctors:**
- `role` = 'doctor'
- `gln` - Doctor GLN (used in TARDOC XML `<providers>` section)
- `zsr` - Doctor ZSR (used in TARDOC XML `<providers>` section)
- `full_name` - **Appears on invoice**
- `canton` - For tax point calculations

**Nurses/Technicians:**
- `role` = 'nurse' or 'technician'
- `gln` = NULL (no billing credentials)
- `zsr` = NULL (no billing credentials)
- `full_name` - **Does NOT appear on invoice**
- Used for statistics only

### Invoices Table Fields:

| Field | Description |
|-------|-------------|
| `provider_id` | **REQUIRED** - FK to providers table (billing entity/clinic) |
| `provider_name` | Clinic name (from providers table) |
| `provider_gln` | Clinic GLN (from providers table) |
| `provider_zsr` | Clinic ZSR (from providers table) |
| `provider_iban` | Clinic IBAN (from providers table) - used for payment |
| `doctor_user_id` | **REQUIRED** - FK to users table (medical staff who performed service) |
| `doctor_name` | Staff name - **only shown on invoice if user is a doctor** |
| `doctor_gln` | Staff GLN - **only populated if user is a doctor** |
| `doctor_zsr` | Staff ZSR - **only populated if user is a doctor** |
| `doctor_canton` | Staff canton (for tax point calculations) |

## Use Cases

### Case 1: Doctor Provides Service - Insurance Invoice
**Scenario**: Dr. Xavier treats patient, Aesthetics Clinic XT bills insurance

- **Billing Entity (provider_id)**: Aesthetics Clinic XT SA (GLN: 7601000771179, IBAN: CH09...)
- **Medical Staff (doctor_user_id)**: Dr. Xavier (GLN: 7601000000001, role: doctor)
- **Invoice Display**: 
  - Billed by: Aesthetics Clinic XT SA
  - Treating physician: Dr. Xavier (name shown)
  - Payment: Clinic IBAN on QR bill
- **TARDOC XML**: 
  - `<billers>` = Clinic GLN
  - `<providers>` = Dr. Xavier GLN
  - `service provider_id` = Dr. Xavier GLN

### Case 2: Nurse Provides Service - Insurance Invoice
**Scenario**: Nurse performs treatment, The Beauty Booth bills insurance

- **Billing Entity (provider_id)**: The Beauty Booth (GLN: XXX, IBAN: CH...)
- **Medical Staff (doctor_user_id)**: Nurse Maria (no GLN, role: nurse)
- **Invoice Display**: 
  - Billed by: The Beauty Booth
  - Treating physician: **NOT SHOWN** (nurse name hidden)
  - Payment: Clinic IBAN on QR bill
- **TARDOC XML**: 
  - `<billers>` = Clinic GLN
  - `<providers>` = Clinic GLN (fallback since nurse has no GLN)
  - `service provider_id` = Clinic GLN

### Case 3: Doctor Provides Service - Cash Invoice
**Scenario**: Dr. Ralf treats patient, Aesthetics Gstaad bills patient directly

- **Billing Entity (provider_id)**: Aesthetics Gstaad (IBAN: CH...)
- **Medical Staff (doctor_user_id)**: Dr. Ralf (GLN: 7601000000002, role: doctor)
- **Invoice Display**: 
  - Billed by: Aesthetics Gstaad
  - Treating physician: Dr. Ralf (name shown)
  - Payment: Clinic IBAN on QR bill
- **PDF**: Standard invoice with QR bill using clinic IBAN

## Migration Scripts

### `005_add_tardoc_fields_to_doctors.sql`
Adds GLN, ZSR, IBAN, bank info, canton to doctors table

### `006_update_invoice_billing_logic.sql`
- Adds doctor billing fields to invoices table
- Creates trigger to auto-populate doctor fields from doctors table
- Creates view and helper function for PDF/XML generation

## Frontend Changes Needed

### Invoice Creation Form:
1. **Always select Doctor** (treating physician) - required
2. **For insurance invoices**: Also select Provider (billing entity)
3. **For cash invoices**: Provider not needed

### Display Logic:
- **Insurance invoice**: Show both "Treating Doctor: Dr. Ralf" and "Billed by: Aesthetics Clinic XT SA"
- **Cash invoice**: Show only "Doctor: Dr. Ralf"

## XML Generation Logic

```typescript
if (isInsuranceInvoice) {
  // BILLER section - use provider
  xml.billers = {
    gln: invoice.provider_gln,
    name: invoice.provider_name,
    // ... provider address
  };
  
  // PROVIDER section - use doctor
  xml.providers = {
    gln: invoice.doctor_gln,
    name: invoice.doctor_name,
    // ... doctor address
  };
  
  // SERVICES - use doctor GLN
  xml.services.forEach(service => {
    service.provider_id = invoice.doctor_gln;
    service.responsible_id = invoice.doctor_gln;
  });
}
```

## Key Takeaways

✅ **Doctor fields are ALWAYS needed** (treating physician)
✅ **Provider fields are needed for insurance billing** (billing entity)
✅ **In solo practice**: Doctor and Provider can be the same person
✅ **In clinic**: Doctor and Provider are different entities
✅ **For cash invoices**: Only doctor fields needed (with IBAN)
✅ **For insurance**: Both doctor and provider fields needed (no IBAN)
