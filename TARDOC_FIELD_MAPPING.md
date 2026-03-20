# TARDOC Invoice Field Mapping

> Which data comes from TARDOC (automatic from the catalog) vs. which data must come from your system (clinic/patient/provider records)?

---

## 1. Invoice Line Item Fields (`invoice_line_items`)

### A. Fields sourced from TARDOC Catalog (automatic when user picks a service)

These are populated automatically when a TARDOC service is selected from the Sumex1 catalog. **You don't need to enter these manually.**

| DB Column | TARDOC API Field | Description | Example |
|---|---|---|---|
| `tardoc_code` | `pbstrCode` | The TARDOC tariff code (e.g. `AA.00.0010`) | `AG.00.0060` |
| `name` | `pbstrName255` | Service description in the selected language | `Anesthésie de nerfs périphériques...` |
| `code` | `pbstrCode` | Same as tardoc_code, stored for display | `AG.00.0060` |
| `tp_al` | `pdTP_MT` | Tax points Medical/Doctor (Pt PM) — doctor's intellectual work | `31.69` |
| `tp_tl` | `pdTP_TT` | Tax points Technical (Pt PT) — infrastructure/equipment cost | `36.86` |
| `tariff_code` | hardcoded `7` | TARDOC tariff type identifier (always 7 = TARDOC, was 001 for TARMED) | `7` |
| `record_id` | `plRecordID` | Internal Sumex catalog record ID | `12345` |
| `section_code` | `pbstrSection` | TARDOC section code | `AG` |
| `catalog_name` | hardcoded | Always `"TARDOC"` for TARDOC lines | `TARDOC` |
| `catalog_nature` | hardcoded | Always `"TARIFF_CATALOG"` | `TARIFF_CATALOG` |
| `service_attributes` | derived | Bitmap: side required, sex required etc. from `peSideRequired`, `peSexRequired` | `0` |
| `external_factor_mt` | `pdInternalFactor_MT` | Internal scaling factor for medical tax points (usually 1.0) | `1.0` |
| `external_factor_tt` | `pdInternalFactor_TT` | Internal scaling factor for technical tax points (usually 1.0) | `1.0` |

### B. Fields sourced from Your System (must be provided by clinic/user)

These come from your database, clinic settings, or the user's selections during invoice creation.

| DB Column | Source | Description | Where to Check |
|---|---|---|---|
| `quantity` | **User input** | Number of units billed (e.g. 1 consultation, 5 minutes) | Invoice form qty field |
| `unit_price` | **Calculated** | = `(tp_al × tp_al_value) + (tp_tl × tp_tl_value)` per unit | Auto-calculated from tax points × canton value |
| `total_price` | **Calculated** | = `unit_price × quantity` | Auto-calculated |
| `tp_al_value` | **Canton tax point value** | CHF per medical tax point, varies by canton (e.g. GE=0.96) | `CANTON_TAX_POINT_VALUES[canton]` in `tardoc.ts` |
| `tp_tl_value` | **Canton tax point value** | CHF per technical tax point (same value as tp_al_value in most cases) | `CANTON_TAX_POINT_VALUES[canton]` in `tardoc.ts` |
| `tp_al_scale_factor` | **System default** | Scale factor (usually 1.0, can be adjusted for special cases) | Default `1` |
| `tp_tl_scale_factor` | **System default** | Scale factor (usually 1.0) | Default `1` |
| `price_al` | **Calculated** | = `tp_al × tp_al_value × tp_al_scale_factor` | Auto-calculated |
| `price_tl` | **Calculated** | = `tp_tl × tp_tl_value × tp_tl_scale_factor` | Auto-calculated |
| `provider_gln` | **`providers` table** | GLN of the provider (biller) for this line item | `providers.gln` — **CHECK: does your provider have a GLN?** |
| `responsible_gln` | **`providers` table** | GLN of the responsible doctor (often same as provider) | `providers.gln` — could differ if referring doctor |
| `billing_role` | **System default** | `"both"` = provider is both biller and performer | Default `"both"` |
| `session_number` | **System default** | Session number within a treatment case (usually 1) | Default `1` |
| `date_begin` | **Invoice form** | Treatment date for this line item | `consultationDate` from form |
| `ref_code` | **Derived** | Reference to main service code for additional services | Auto-set: if line is "additional", points to the main code |
| `service_id` | **Must be `null`** | Set to null for TARDOC lines (UUID FK to services table, not applicable) | Always `null` for TARDOC |
| `discount_percent` | **User input** | Optional discount | Invoice form |
| `vat_rate` | **System** | VAT rate — medical services are usually `"FREE"` (0% VAT in CH) | Default `"FREE"` |
| `comment` | **User input** | Optional comment on the line item | Invoice form |

---

## 2. Invoice Header Fields (`invoices`)

### A. Fields from Patient Records

| DB Column | Source Table/Field | Description | Check |
|---|---|---|---|
| `patient_id` | `patients.id` | Patient UUID | Always available |
| `patient_ssn` | `patients.avs_number` via `patient_insurances.avs_number` | Swiss AVS/AHV number (756.XXXX.XXXX.XX) | **CHECK `patient_insurances` table** — is `avs_number` populated? |
| `patient_card_number` | `patient_insurances.card_number` | Insurance card number | **CHECK `patient_insurances` table** |

### B. Fields from Provider Records

| DB Column | Source Table/Field | Description | Check |
|---|---|---|---|
| `provider_id` | `providers.id` | Provider UUID (the billing entity / clinic) | Invoice form provider dropdown |
| `provider_name` | `providers.name` | Provider display name | `providers.name` |
| `provider_gln` | `providers.gln` | **CRITICAL**: 13-digit GLN (Global Location Number) of the billing provider | **CHECK `providers.gln`** — must be valid for insurance |
| `provider_zsr` | `providers.zsr` | **CRITICAL**: ZSR number (Zahlstellenregister) for Swiss billing | **CHECK `providers.zsr`** — required for insurance |
| `doctor_user_id` | `users.id` | The treating doctor (user in the system) — separate from provider! | **Currently mixed up with provider — needs fix** |
| `doctor_name` | `users.full_name` | Doctor's display name | From `users` table |

### C. Fields from Insurance Records

| DB Column | Source | Description | Check |
|---|---|---|---|
| `insurer_id` | `swiss_insurers.id` / `patient_insurances.insurer_id` | UUID of the insurance company | InsuranceBillingModal or auto from `patient_insurances` |
| `insurance_gln` | `swiss_insurers.gln` / `patient_insurances.insurer_gln` | GLN of the insurance company | **CHECK `patient_insurances.insurer_gln`** |
| `insurance_name` | `swiss_insurers.name` | Insurance company name | From `swiss_insurers` table |
| `health_insurance_law` | **User selection** | `KVG`/`UVG`/`IVG`/`MVG`/`VVG` — determines which law applies | `patient_insurances.law_type` or user picks in modal |
| `billing_type` | **User selection** | `TG` (Tiers Garant = patient pays) or `TP` (Tiers Payant = insurer pays) | `patient_insurances.billing_type` or user picks |
| `medical_case_number` | `patient_insurances.case_number` | Medical case number (especially for UVG accidents) | **CHECK `patient_insurances.case_number`** |

### D. Treatment Context Fields

| DB Column | Source | Description | Check |
|---|---|---|---|
| `treatment_date` | **User input** | Start of treatment (consultation date/time) | Invoice form date field |
| `treatment_date_end` | **User input** | End of treatment (same as start for single visit) | Could default to `treatment_date` |
| `treatment_canton` | **Provider's canton** or **User selection** | Canton where treatment took place — determines tax point value | `providers.canton` — **CHECK this field** |
| `treatment_reason` | **User selection** | `disease` / `accident` / `maternity` / `prevention` | InsuranceBillingModal or invoice form |
| `diagnosis_codes` | **User input** | JSONB array of `{code, type}` — ICD-10 codes | InsuranceBillingModal |
| `copy_to_guarantor` | **System** | Whether to send copy to patient (for TP) | Default `false` |

---

## 3. TARDOC-Specific Rules for Doctor/Provider

### Why Doctor ≠ Provider in TARDOC

TARDOC is strict about **who bills** vs **who treats**:

| Role | What it means | Maps to | Required ID |
|---|---|---|---|
| **Provider (Fournisseur de prestations)** | The billing entity — usually the clinic or practice | `providers` table | **GLN + ZSR** required |
| **Doctor (Médecin responsable)** | The treating physician — the person who performed the service | `users` table or `providers` for solo practices | **GLN** required for the doctor specifically |

### Tax Point Implications

- **`tp_al` (Pt PM / Medical)**: Tax points for the **doctor's intellectual work**. The doctor's qualification level can affect scaling factors.
- **`tp_tl` (Pt PT / Technical)**: Tax points for the **infrastructure/equipment**. Depends on the practice type (hospital vs cabinet).
- **Tax point value (f PM / f PT)**: Set per canton. Both medical and technical usually use the same cantonal value.
- **Billing role**: `"both"` means the provider is both the biller and performer. Could be `"provider"` or `"performer"` if split.

### What You Should Check on Your Provider Records

For TARDOC insurance billing to work, each provider in the `providers` table needs:

| Field | Required? | Description | Your Status |
|---|---|---|---|
| `gln` | **MANDATORY** | 13-digit GLN (e.g. `7601000000001`) | ⬜ Check if populated |
| `zsr` | **MANDATORY** | ZSR number (e.g. `Z123456`) | ⬜ Check if populated |
| `canton` | **IMPORTANT** | Canton code (e.g. `GE`) — determines tax point value | ⬜ Check if populated |
| `name` | **MANDATORY** | Full name of provider/clinic | ⬜ Should be fine |
| `street` | Recommended | Street address | ⬜ Check |
| `street_no` | Recommended | Building number | ⬜ Check |
| `zip_code` | Recommended | Postal code | ⬜ Check |
| `city` | Recommended | City | ⬜ Check |
| `iban` | **MANDATORY for payment** | Swiss IBAN for QR bill | ⬜ Check |
| `vatuid` | Optional | VAT UID number | ⬜ Check if applicable |

### What You Should Check on Patient Insurance Records

For each patient, the `patient_insurances` table should have:

| Field | Required? | Description | Your Status |
|---|---|---|---|
| `insurer_id` | **MANDATORY** | FK to `swiss_insurers` | ⬜ Check |
| `insurer_gln` | **MANDATORY** | GLN of insurer | ⬜ Check (auto from swiss_insurers?) |
| `avs_number` | **MANDATORY** | Patient's AVS/AHV (756.XXXX.XXXX.XX) | ⬜ Check |
| `card_number` | Recommended | Insurance card number | ⬜ Check |
| `policy_number` | Recommended | Policy number | ⬜ Check |
| `law_type` | **MANDATORY** | KVG/UVG/IVG/MVG/VVG | ⬜ Check |
| `billing_type` | **MANDATORY** | TG or TP | ⬜ Check |
| `case_number` | For accidents | UVG case number | ⬜ Check if UVG |
| `is_primary` | Recommended | Whether this is the primary insurance | ⬜ Check |

---

## 4. Summary: Data Flow

```
┌─────────────────────────┐
│    TARDOC Catalog        │ ──→ tardoc_code, name, tp_al, tp_tl, record_id, section_code,
│    (Sumex1 API)          │     external_factor_mt/tt, service_attributes
└─────────────────────────┘

┌─────────────────────────┐
│    Canton Config         │ ──→ tp_al_value, tp_tl_value (CHF per tax point)
│    (tardoc.ts)           │
└─────────────────────────┘

┌─────────────────────────┐
│    providers table       │ ──→ provider_gln, provider_zsr, provider_name, canton,
│    (Your DB)             │     street, city, iban
└─────────────────────────┘

┌─────────────────────────┐
│    patients table        │ ──→ patient_id, name, dob, address, gender
│    (Your DB)             │
└─────────────────────────┘

┌─────────────────────────┐
│    patient_insurances    │ ──→ insurer_id/gln, avs_number, card_number, law_type,
│    (Your DB)             │     billing_type, case_number, policy_number
└─────────────────────────┘

┌─────────────────────────┐
│    swiss_insurers        │ ──→ insurer name, GLN, address
│    (Your DB)             │
└─────────────────────────┘

┌─────────────────────────┐
│    User Input            │ ──→ quantity, treatment_reason, diagnosis_codes,
│    (Invoice Form)        │     treatment_date, doctor selection, provider selection
└─────────────────────────┘

           ▼ All combined into ▼

┌─────────────────────────┐
│    invoices +            │ ──→ PDF generation + XML for MediData submission
│    invoice_line_items    │
└─────────────────────────┘
```
