# Step 0 findings — maisontoa-clinic (`mwtdhbllkzuryswrumrd`)

Region: ap-south-1 · created 2026-03-20 · status ACTIVE_HEALTHY
Collected: 2026-10-09T04:49:32.088Z

## Advisor counts

| Advisor | Errors | Warns | Info |
|---|---|---|---|
| security | 0 | 79 | 86 |
| performance | 0 | 42 | 263 |

## Public tables with RLS DISABLED (0 of 155)

_none — all public tables have RLS enabled_

## Views running as SECURITY DEFINER (no `security_invoker`) — 0

_none_

## Storage buckets with `public = true` — 0

_none_

## Tables granted to `anon` / `PUBLIC` — 0

**0** of these are WRITABLE by an
unauthenticated caller (INSERT / UPDATE / DELETE / TRUNCATE), which permits
tampering and destruction of records, not only disclosure.

_none_

## Leftover scratch tables — 16

- `patients_master_stage` — 0 rows, RLS on, sensitive columns: birth_date_text
- `temp_patient_treatment_2` — 154133 rows, RLS on, sensitive columns: patient_id
- `tmp_accounted_medical_invoices` — 45196 rows, RLS on, sensitive columns: accounted_medical_benefit_id, health_insurance_law, medical_case_id, medical_case_no, medical_case_subject, patient_birthdate, patient_first_name, patient_gender, patient_id, patient_last_name, patient_number, source_unaccounted_medical_benefit_id
- `tmp_appointments` — 111821 rows, RLS on, sensitive columns: patient_id, patient_email, patient_phone, patient_first_name, patient_last_name, dob, street_address, manual_patient_info
- `tmp_axenita_invoice_lines` — 41661 rows, RLS on, sensitive columns: medical_case_subject, source_unaccounted_medical_benefit_id, health_insurance_law, patient_id, patient_last_name, medical_case_no, accounted_medical_benefit_id, patient_birthdate, medical_case_id, patient_gender, patient_first_name, patient_number
- `tmp_catalog_codes` — 0 rows, RLS on
- `tmp_contacts` — 0 rows, RLS on, sensitive columns: patient_id, phone, email, dob
- `tmp_contacts_phone` — 16030 rows, RLS on, sensitive columns: phone
- `tmp_deals` — 0 rows, RLS on
- `tmp_invoice_import` — 0 rows, RLS on, sensitive columns: medical_case_subject, source_unaccounted_medical_benefit_id, health_insurance_law, patient_id, patient_last_name, medical_case_no, accounted_medical_benefit_id, patient_birthdate, medical_case_id, patient_gender, patient_first_name, patient_number
- `tmp_invoice_raw` — 45067 rows, RLS on, sensitive columns: invoicing_party_phone, patient_streetno, care_provider_email, medical_case_law, medical_case_subject, invoice_recipient_patient_guarant_insured_number, payment_details_account_iban, assigner_address_address_addition, invoicing_party_address_type, assigner_address_canton, care_provider_address_type, assigner_address_po_box, assigner_address_salutation, medical_case_no, care_provider_address_addition, patient_pobox, payment_details_account_payment_recipient_address_line_1, payment_details_bank_address_zip_code, payment_details_account_payment_recipient_address_line_2, invoice_recipient_address_type, patient_language, patient_lastname, patient_firstname, assigner_address_street, second_invoice_recipient_address_type, patient_gender, medical_case_external_reference_number, medical_case_reason, patient_guarant_insurance_card_number, assigner_address_street_no, invoice_notes, invoicing_party_address_addition, second_invoice_recipient_hmo_insurance_model_kind, patient_salutation, medical_case_site, patient_ssn, payment_details_bank_address_city, assigner_address_title, assigner_address_lastname, patient_canton, patient_id, patient_title, patient_city, patient_zip, assigner_address_gln, care_provider_phone, invoicing_party_email, assigner_address_firstname, patient_street, payment_details_bank_address_country, assigner_address_zip_code, second_invoice_recipient_kvg_insurance_model, patient_birthdate, assigner_address_city, patient_guarantor_insured_number, invoice_recipient_hmo_insurance_model_kind, assigner_address_type, patient_country, assigner_address_country, invoice_recipient_address_addition, invoice_recipient_kvg_insurance_model, second_invoice_recipient_address_addition, patient_number, patient_address_addition
- `tmp_notes` — 0 rows, RLS on, sensitive columns: patient_id
- `tmp_patient_axenita` — 0 rows, RLS on, sensitive columns: matched_patient_id
- `tmp_patient_with_address_and_ssn` — 0 rows, RLS on, sensitive columns: patientno, birthday, patientfieldvalue1, patientfieldvalue2, patientfieldvalue3, patientfieldvalue4, patientfieldvalue5, extended_info.ssn, extended_info.birthDate, extended_info.patientNo, extended_info.patientMandator_name, extended_info.patientMandator_id, extended_info.protectedPatient, address.street, address.streetNo, address.addressAddition, address.poBox, address.zipCode, address.city, address.canton_shortName, address.canton_name, address.country_shortName, address.country_name, address.error
- `tmp_patients` — 16192 rows, RLS on, sensitive columns: patientno, birthday, patientfieldvalue1, patientfieldvalue2, patientfieldvalue3, patientfieldvalue4, patientfieldvalue5
- `tmp_treatment_flat` — 0 rows, RLS on, sensitive columns: patient_id

## RLS enabled but NO policies (deny-all — may already be breaking features) — 86

- `admin_gmail_accounts`
- `admin_task_comments`
- `admin_task_mentions`
- `admin_task_notifications`
- `admin_tasks`
- `admin_users`
- `bank_accounts`
- `bank_payment_import_items`
- `bank_payment_imports`
- `booking_categories`
- `booking_category_doctors`
- `booking_doctors`
- `booking_links`
- `booking_treatment_doctors`
- `booking_treatments`
- `calendar_defaults`
- `chat_folders`
- `client_invoices`
- `clinics`
- `colored_line_configurations`
- `consultation_note_events`
- `crisalix_reconstructions`
- `demo_bookings`
- `doctor_scheduling_settings`
- `document_templates`
- `email_reply_notifications`
- `exceptional_booking_availability`
- `external_labs`
- `invoice_installments`
- `machines`
- `medication_template_items`
- `medication_templates`
- `medidata_config`
- `medidata_notifications_log`
- `medidata_responses`
- `medidata_submission_history`
- `medidata_submission_jobs`
- `medidata_submissions`
- `organization_api_keys`
- `organization_audit_log`
- `organization_invitations`
- `organization_members`
- `organization_settings`
- `organizations`
- `patient_document_versions`
- `patient_documents`
- `patient_edit_locks`
- `patient_insurances`
- `patient_note_mentions`
- `patient_prescriptions`
- `patients_master_stage`
- `pdf_generation_jobs`
- `sales_pipeline_automation_runs`
- `sales_pipeline_automations`
- `sales_pipeline_email_templates`
- `scheduled_emails`
- `service_categories`
- `service_group_services`
- `service_groups`
- `service_machines`
- `services`
- `stripe_transactions`
- `stripe_webhook_events`
- `swiss_insurer_laws`
- `swiss_insurers`
- `task_comment_mentions`
- `task_comments`
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
- `users`
- `workflow_actions`
- `workflow_events`
- `workflow_jobs`

## Warning-level items (Phase 3)

- Functions with mutable `search_path`: **75**
- `SECURITY DEFINER` functions: **29**
- Extensions installed in `public`: _none_

## Access logs

_log export skipped_
