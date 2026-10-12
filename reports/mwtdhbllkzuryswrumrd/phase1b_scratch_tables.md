# Phase 1b — leftover scratch tables (`mwtdhbllkzuryswrumrd`)

Generated 2026-10-12T21:31:55.611Z. **Nothing has been dropped.**

16 scratch tables holding **0 rows** in total.
0 contain data; 16 are empty.

## Tables containing data

| Table | Exact rows | Cols | Special-category columns | Dependents |
|---|---:|---:|---|---|


## Empty tables (safe to drop, no data loss)

- `patients_master_stage`
- `temp_patient_treatment_2`
- `tmp_accounted_medical_invoices`
- `tmp_appointments`
- `tmp_axenita_invoice_lines`
- `tmp_catalog_codes`
- `tmp_contacts`
- `tmp_contacts_phone`
- `tmp_deals`
- `tmp_invoice_import`
- `tmp_invoice_raw`
- `tmp_notes`
- `tmp_patient_axenita`
- `tmp_patient_with_address_and_ssn`
- `tmp_patients`
- `tmp_treatment_flat`

## Recommendation

All of these are migration artifacts in the `public` schema. Until Phase 1
they were readable and writable by any holder of the anon key. They are not
referenced by the application (verify against the dependents column above).

**Before dropping**, export them: they may be the only remaining copy of
pre-migration source data. The generated migration is a DROP only — take the
backup first.

## Approval

- [ ] Owner has confirmed these tables are not needed
- [ ] Contents exported to the encrypted backup
- [ ] Dependents column reviewed and empty, or dependents handled

Migration to apply once all three are ticked:
`supabase/migrations-pending-approval/20261012_drop_scratch_tables_mwtdhbllkzuryswrumrd.sql`

It is deliberately **outside** `supabase/migrations/` so no migration runner can
apply an irreversible DROP before it has been approved. Move it in, or apply it
explicitly with `scripts/security/apply-sql.mjs`, once approved.
