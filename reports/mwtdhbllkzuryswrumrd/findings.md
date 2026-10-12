# Step 0 findings — maisontoa-clinic (`mwtdhbllkzuryswrumrd`)

Region: ap-south-1 · created 2026-03-20 · status ACTIVE_HEALTHY
Collected: 2026-10-09T04:22:31.868Z

## Advisor counts

| Advisor | Errors | Warns | Info |
|---|---|---|---|
| security | 79 | 79 | 7 |
| performance | 0 | 42 | 263 |

## Public tables with RLS DISABLED (79 of 155)

- `admin_gmail_accounts` (~0 rows)
- `admin_task_comments` (~0 rows)
- `admin_task_mentions` (~0 rows)
- `admin_task_notifications` (~0 rows)
- `admin_tasks` (~0 rows)
- `admin_users` (~2 rows)
- `bank_accounts` (~3 rows)
- `bank_payment_import_items` (~596 rows)
- `bank_payment_imports` (~247 rows)
- `booking_categories` (~12 rows)
- `booking_category_doctors` (~2 rows)
- `booking_doctors` (~10 rows)
- `booking_links` (~7 rows)
- `booking_treatment_doctors` (~332 rows)
- `booking_treatments` (~106 rows)
- `calendar_defaults` (~19 rows)
- `chat_folders` (~0 rows)
- `client_invoices` (~0 rows)
- `clinics` (~1 rows)
- `consultation_note_events` (~92835 rows)
- `crisalix_reconstructions` (~0 rows)
- `demo_bookings` (~0 rows)
- `doctor_scheduling_settings` (~11 rows)
- `document_templates` (~0 rows)
- `email_reply_notifications` (~0 rows)
- `external_labs` (~0 rows)
- `invoice_installments` (~365 rows)
- `machines` (~9 rows)
- `medication_template_items` (~2 rows)
- `medication_templates` (~2 rows)
- `medidata_config` (~1 rows)
- `medidata_notifications_log` (~96 rows)
- `medidata_responses` (~324 rows)
- `medidata_submission_history` (~1054 rows)
- `medidata_submission_jobs` (~383 rows)
- `medidata_submissions` (~360 rows)
- `organization_api_keys` (~1 rows)
- `organization_audit_log` (~0 rows)
- `organization_invitations` (~0 rows)
- `organization_members` (~0 rows)
- `organization_settings` (~0 rows)
- `organizations` (~0 rows)
- `patient_document_versions` (~0 rows)
- `patient_documents` (~177 rows)
- `patient_edit_locks` (~3514 rows)
- `patient_insurances` (~12130 rows)
- `patient_note_mentions` (~0 rows)
- `patient_prescriptions` (~1661 rows)
- `patients_master_stage` (~0 rows)
- `pdf_generation_jobs` (~2751 rows)
- `scheduled_emails` (~3284 rows)
- `service_categories` (~21 rows)
- `service_group_services` (~12 rows)
- `service_groups` (~3 rows)
- `service_machines` (~49 rows)
- `services` (~621 rows)
- `stripe_transactions` (~599 rows)
- `stripe_webhook_events` (~667 rows)
- `swiss_insurer_laws` (~319 rows)
- `swiss_insurers` (~234 rows)
- `task_comment_mentions` (~19 rows)
- `task_comments` (~20 rows)
- `temp_patient_treatment_2` (~154133 rows)
- `tmp_accounted_medical_invoices` (~45196 rows)
- `tmp_appointments` (~111821 rows)
- `tmp_axenita_invoice_lines` (~41661 rows)
- `tmp_catalog_codes` (~0 rows)
- `tmp_contacts` (~0 rows)
- `tmp_contacts_phone` (~16030 rows)
- `tmp_deals` (~0 rows)
- `tmp_invoice_import` (~0 rows)
- `tmp_invoice_raw` (~45067 rows)
- `tmp_notes` (~0 rows)
- `tmp_patient_axenita` (~0 rows)
- `tmp_patient_with_address_and_ssn` (~0 rows)
- `tmp_patients` (~16192 rows)
- `tmp_treatment_flat` (~0 rows)
- `users` (~16 rows)
- `workflow_actions` (~0 rows)

## Views running as SECURITY DEFINER (no `security_invoker`) — 0

_none_

## Storage buckets with `public = true` — 8

- `avatars`
- `booking-images`
- `cash-receipts`
- `doctor-images`
- `email-assets`
- `emailgallery`
- `invoice-pdfs`
- `page-builder-images`

## Tables granted to `anon` / `PUBLIC` — 155

**155** of these are WRITABLE by an
unauthenticated caller (INSERT / UPDATE / DELETE / TRUNCATE), which permits
tampering and destruction of records, not only disclosure.

- `admin_gmail_accounts` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `admin_task_comments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `admin_task_mentions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `admin_task_notifications` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `admin_tasks` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `admin_users` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `appointment_status_options` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `appointments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `bank_accounts` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `bank_payment_import_items` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `bank_payment_imports` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_blocked_dates` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_categories` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_category_doctors` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_doctors` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_links` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_treatment_doctors` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `booking_treatments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `calendar_defaults` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `chat_conversations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `chat_folders` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `chat_messages` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `client_invoices` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `clinic_onboarding_submissions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `clinic_onboarding_tokens` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `clinics` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `colored_line_configurations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `consultation_collab_docs` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `consultation_note_events` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `consultations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `crisalix_reconstructions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `deal_stages` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `deals` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `demo_bookings` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `doctor_scheduling_settings` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `document_template_overrides` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `document_templates` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `documents` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `email_attachments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `email_reply_notifications` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `email_template_categories` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `email_template_versions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `email_templates` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `emails` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `embed_form_leads` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `exceptional_booking_availability` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `external_labs` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `favorites` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `icd10_code_options` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `invoice_installments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `invoice_line_items` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `invoice_payments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `invoices` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `lead_imports` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `machines` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `marketing_campaign_recipients` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `marketing_campaigns` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `marketing_lists` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medical_records` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medication_template_items` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medication_templates` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medidata_config` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medidata_notifications_log` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medidata_responses` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medidata_submission_history` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medidata_submission_jobs` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `medidata_submissions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `organization_api_keys` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `organization_audit_log` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `organization_invitations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `organization_members` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `organization_settings` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `organizations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_consents` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_consultation_data` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_deposits` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_document_versions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_documents` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_edit_locks` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_form_submissions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_health_background` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_insurances` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_intake_photos` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_intake_preferences` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_intake_submissions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_measurements` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_memberships` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_note_mentions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_notes` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_packages` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_prescriptions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_property_definitions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_property_values` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_quotes` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_simulations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_surgeries` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_tag_assignments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_tags` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_treatment_areas` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_treatment_preferences` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patient_treatments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patients` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `patients_master_stage` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `pdf_generation_jobs` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `providers` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `sales_pipeline_automation_runs` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `sales_pipeline_automations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `sales_pipeline_email_templates` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `scheduled_emails` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `service_categories` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `service_group_services` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `service_groups` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `service_machines` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `services` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `site_settings` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `stripe_transactions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `stripe_webhook_events` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `swiss_insurer_laws` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `swiss_insurers` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tardoc_group_items` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tardoc_groups` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `task_comment_mentions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `task_comments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tasks` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `temp_patient_treatment_2` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_accounted_medical_invoices` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_appointments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_axenita_invoice_lines` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_catalog_codes` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_contacts` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_contacts_phone` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_deals` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_invoice_import` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_invoice_raw` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_notes` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_patient_axenita` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_patient_with_address_and_ssn` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_patients` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `tmp_treatment_flat` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `user_availability` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `users` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `whatsapp_conversations` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `whatsapp_messages` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `whatsapp_queue` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `whatsapp_templates` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_actions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_enrollment_steps` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_enrollments` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_events` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_jobs` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_runs_v2` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_staff_notifications` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_step_runs_v2` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflow_versions` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**
- `workflows` (anon): DELETE,INSERT,MAINTAIN,REFERENCES,SELECT,TRIGGER,TRUNCATE,UPDATE **[WRITABLE]**

## Leftover scratch tables — 16

- `patients_master_stage` — 0 rows, RLS OFF, sensitive columns: birth_date_text
- `temp_patient_treatment_2` — 154133 rows, RLS OFF, sensitive columns: patient_id
- `tmp_accounted_medical_invoices` — 45196 rows, RLS OFF, sensitive columns: accounted_medical_benefit_id, health_insurance_law, medical_case_id, medical_case_no, medical_case_subject, patient_birthdate, patient_first_name, patient_gender, patient_id, patient_last_name, patient_number, source_unaccounted_medical_benefit_id
- `tmp_appointments` — 111821 rows, RLS OFF, sensitive columns: patient_id, patient_email, patient_phone, patient_first_name, patient_last_name, dob, street_address, manual_patient_info
- `tmp_axenita_invoice_lines` — 41661 rows, RLS OFF, sensitive columns: medical_case_subject, source_unaccounted_medical_benefit_id, health_insurance_law, patient_id, patient_last_name, medical_case_no, accounted_medical_benefit_id, patient_birthdate, medical_case_id, patient_gender, patient_first_name, patient_number
- `tmp_catalog_codes` — 0 rows, RLS OFF
- `tmp_contacts` — 0 rows, RLS OFF, sensitive columns: patient_id, phone, email, dob
- `tmp_contacts_phone` — 16030 rows, RLS OFF, sensitive columns: phone
- `tmp_deals` — 0 rows, RLS OFF
- `tmp_invoice_import` — 0 rows, RLS OFF, sensitive columns: medical_case_subject, source_unaccounted_medical_benefit_id, health_insurance_law, patient_id, patient_last_name, medical_case_no, accounted_medical_benefit_id, patient_birthdate, medical_case_id, patient_gender, patient_first_name, patient_number
- `tmp_invoice_raw` — 45067 rows, RLS OFF, sensitive columns: invoicing_party_phone, patient_streetno, care_provider_email, medical_case_law, medical_case_subject, invoice_recipient_patient_guarant_insured_number, payment_details_account_iban, assigner_address_address_addition, invoicing_party_address_type, assigner_address_canton, care_provider_address_type, assigner_address_po_box, assigner_address_salutation, medical_case_no, care_provider_address_addition, patient_pobox, payment_details_account_payment_recipient_address_line_1, payment_details_bank_address_zip_code, payment_details_account_payment_recipient_address_line_2, invoice_recipient_address_type, patient_language, patient_lastname, patient_firstname, assigner_address_street, second_invoice_recipient_address_type, patient_gender, medical_case_external_reference_number, medical_case_reason, patient_guarant_insurance_card_number, assigner_address_street_no, invoice_notes, invoicing_party_address_addition, second_invoice_recipient_hmo_insurance_model_kind, patient_salutation, medical_case_site, patient_ssn, payment_details_bank_address_city, assigner_address_title, assigner_address_lastname, patient_canton, patient_id, patient_title, patient_city, patient_zip, assigner_address_gln, care_provider_phone, invoicing_party_email, assigner_address_firstname, patient_street, payment_details_bank_address_country, assigner_address_zip_code, second_invoice_recipient_kvg_insurance_model, patient_birthdate, assigner_address_city, patient_guarantor_insured_number, invoice_recipient_hmo_insurance_model_kind, assigner_address_type, patient_country, assigner_address_country, invoice_recipient_address_addition, invoice_recipient_kvg_insurance_model, second_invoice_recipient_address_addition, patient_number, patient_address_addition
- `tmp_notes` — 0 rows, RLS OFF, sensitive columns: patient_id
- `tmp_patient_axenita` — 0 rows, RLS OFF, sensitive columns: matched_patient_id
- `tmp_patient_with_address_and_ssn` — 0 rows, RLS OFF, sensitive columns: patientno, birthday, patientfieldvalue1, patientfieldvalue2, patientfieldvalue3, patientfieldvalue4, patientfieldvalue5, extended_info.ssn, extended_info.birthDate, extended_info.patientNo, extended_info.patientMandator_name, extended_info.patientMandator_id, extended_info.protectedPatient, address.street, address.streetNo, address.addressAddition, address.poBox, address.zipCode, address.city, address.canton_shortName, address.canton_name, address.country_shortName, address.country_name, address.error
- `tmp_patients` — 16192 rows, RLS OFF, sensitive columns: patientno, birthday, patientfieldvalue1, patientfieldvalue2, patientfieldvalue3, patientfieldvalue4, patientfieldvalue5
- `tmp_treatment_flat` — 0 rows, RLS OFF, sensitive columns: patient_id

## RLS enabled but NO policies (deny-all — may already be breaking features) — 7

- `colored_line_configurations`
- `exceptional_booking_availability`
- `sales_pipeline_automation_runs`
- `sales_pipeline_automations`
- `sales_pipeline_email_templates`
- `workflow_events`
- `workflow_jobs`

## Warning-level items (Phase 3)

- Functions with mutable `search_path`: **75**
- `SECURITY DEFINER` functions: **29**
- Extensions installed in `public`: _none_

## Access logs

See `access_logs_summary.md`.
