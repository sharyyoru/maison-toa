# Phase 1 verification — maisontoa-clinic (`mwtdhbllkzuryswrumrd`)

Run: 2026-10-09T04:21:08.023Z
Key used: `publishable` (value never stored)
Method: `HEAD /rest/v1/<relation>?select=*` with `Prefer: count=exact` — counts only, no rows transferred.

## Result: **FAIL** — anon can still read data

Relations probed: **155**

| Verdict | Count | Meaning |
|---|---|---|
| BLOCKED | 0 | 401/403 — anon rejected outright |
| EMPTY | 84 | 200 but zero rows — RLS denying every row |
| NOT_EXPOSED | 0 | 404 — not in the PostgREST schema cache |
| **LEAK** | **56** | **200 with rows — still readable** |
| unexpected/error | 15 | needs manual review |

## LEAKING relations

- `admin_users` (table) — 2 rows readable by anon
- `bank_accounts` (table) — 3 rows readable by anon
- `bank_payment_import_items` (table) — 596 rows readable by anon
- `bank_payment_imports` (table) — 247 rows readable by anon
- `booking_blocked_dates` (table) — 11 rows readable by anon
- `booking_categories` (table) — 12 rows readable by anon
- `booking_category_doctors` (table) — 2 rows readable by anon
- `booking_doctors` (table) — 10 rows readable by anon
- `booking_links` (table) — 7 rows readable by anon
- `booking_treatment_doctors` (table) — 332 rows readable by anon
- `booking_treatments` (table) — 106 rows readable by anon
- `calendar_defaults` (table) — 19 rows readable by anon
- `chat_conversations` (table) — 2 rows readable by anon
- `chat_messages` (table) — 7 rows readable by anon
- `clinics` (table) — 1 rows readable by anon
- `deal_stages` (table) — 14 rows readable by anon
- `deals` (table) — 1143 rows readable by anon
- `doctor_scheduling_settings` (table) — 11 rows readable by anon
- `email_templates` (table) — 10 rows readable by anon
- `invoice_installments` (table) — 365 rows readable by anon
- `machines` (table) — 9 rows readable by anon
- `medication_template_items` (table) — 2 rows readable by anon
- `medication_templates` (table) — 2 rows readable by anon
- `medidata_config` (table) — 1 rows readable by anon
- `medidata_notifications_log` (table) — 96 rows readable by anon
- `medidata_responses` (table) — 324 rows readable by anon
- `medidata_submission_history` (table) — 1054 rows readable by anon
- `medidata_submission_jobs` (table) — 383 rows readable by anon
- `medidata_submissions` (table) — 360 rows readable by anon
- `organization_api_keys` (table) — 1 rows readable by anon
- `patient_documents` (table) — 177 rows readable by anon
- `patient_edit_locks` (table) — 3514 rows readable by anon
- `patient_form_submissions` (table) — 1167 rows readable by anon
- `patient_health_background` (table) — 2 rows readable by anon
- `patient_intake_submissions` (table) — 379 rows readable by anon
- `patient_notes` (table) — 167 rows readable by anon
- `patient_prescriptions` (table) — 1661 rows readable by anon
- `pdf_generation_jobs` (table) — 2751 rows readable by anon
- `providers` (table) — 44 rows readable by anon
- `scheduled_emails` (table) — 3284 rows readable by anon
- `service_categories` (table) — 21 rows readable by anon
- `service_group_services` (table) — 12 rows readable by anon
- `service_groups` (table) — 3 rows readable by anon
- `service_machines` (table) — 49 rows readable by anon
- `services` (table) — 621 rows readable by anon
- `stripe_transactions` (table) — 599 rows readable by anon
- `stripe_webhook_events` (table) — 667 rows readable by anon
- `swiss_insurer_laws` (table) — 319 rows readable by anon
- `swiss_insurers` (table) — 234 rows readable by anon
- `tardoc_group_items` (table) — 177 rows readable by anon
- `tardoc_groups` (table) — 38 rows readable by anon
- `task_comment_mentions` (table) — 19 rows readable by anon
- `task_comments` (table) — 20 rows readable by anon
- `tasks` (table) — 33 rows readable by anon
- `users` (table) — 16 rows readable by anon
- `workflows` (table) — 4 rows readable by anon

## Needs review

- `appointments` — UNEXPECTED_206 HTTP 206
- `consultation_note_events` — UNEXPECTED_206 HTTP 206
- `consultations` — UNEXPECTED_206 HTTP 206
- `emails` — UNEXPECTED_206 HTTP 206
- `invoice_line_items` — UNEXPECTED_206 HTTP 206
- `invoices` — UNEXPECTED_206 HTTP 206
- `patient_insurances` — UNEXPECTED_206 HTTP 206
- `patients` — UNEXPECTED_206 HTTP 206
- `temp_patient_treatment_2` — UNEXPECTED_206 HTTP 206
- `tmp_accounted_medical_invoices` — UNEXPECTED_206 HTTP 206
- `tmp_appointments` — UNEXPECTED_206 HTTP 206
- `tmp_axenita_invoice_lines` — UNEXPECTED_206 HTTP 206
- `tmp_contacts_phone` — UNEXPECTED_206 HTTP 206
- `tmp_invoice_raw` — UNEXPECTED_206 HTTP 206
- `tmp_patients` — UNEXPECTED_206 HTTP 206

## Storage buckets

| Bucket | public flag | anon list | verdict |
|---|---|---|---|
| `avatars` | true | 0 | EMPTY |
| `booking-images` | true | 1 | LEAK |
| `cash-receipts` | true | 0 | EMPTY |
| `doctor-images` | true | 1 | LEAK |
| `document-templates` | false | 0 | EMPTY |
| `email-assets` | true | 1 | LEAK |
| `email-attachments` | false | 0 | EMPTY |
| `emailgallery` | true | 1 | LEAK |
| `finance-documents` | false | 0 | EMPTY |
| `invoice-pdfs` | true | 1 | LEAK |
| `page-builder-images` | true | 0 | EMPTY |
| `patient-avatars` | false | 0 | EMPTY |
| `patient-docs` | false | 0 | EMPTY |
| `patient-documents` | false | 0 | EMPTY |
| `patient-intake-photos` | false | 0 | EMPTY |
| `patient-photos` | false | 0 | EMPTY |

## Full detail

| Relation | Kind | HTTP | anon-visible rows | Verdict |
|---|---|---|---|---|
| `admin_gmail_accounts` | table | 200 | 0 | EMPTY |
| `admin_task_comments` | table | 200 | 0 | EMPTY |
| `admin_task_mentions` | table | 200 | 0 | EMPTY |
| `admin_task_notifications` | table | 200 | 0 | EMPTY |
| `admin_tasks` | table | 200 | 0 | EMPTY |
| `admin_users` | table | 200 | 2 | LEAK |
| `appointment_status_options` | table | 200 | 0 | EMPTY |
| `appointments` | table | 206 | 129613 | UNEXPECTED_206 |
| `bank_accounts` | table | 200 | 3 | LEAK |
| `bank_payment_import_items` | table | 200 | 596 | LEAK |
| `bank_payment_imports` | table | 200 | 247 | LEAK |
| `booking_blocked_dates` | table | 200 | 11 | LEAK |
| `booking_categories` | table | 200 | 12 | LEAK |
| `booking_category_doctors` | table | 200 | 2 | LEAK |
| `booking_doctors` | table | 200 | 10 | LEAK |
| `booking_links` | table | 200 | 7 | LEAK |
| `booking_treatment_doctors` | table | 200 | 332 | LEAK |
| `booking_treatments` | table | 200 | 106 | LEAK |
| `calendar_defaults` | table | 200 | 19 | LEAK |
| `chat_conversations` | table | 200 | 2 | LEAK |
| `chat_folders` | table | 200 | 0 | EMPTY |
| `chat_messages` | table | 200 | 7 | LEAK |
| `client_invoices` | table | 200 | 0 | EMPTY |
| `clinic_onboarding_submissions` | table | 200 | 0 | EMPTY |
| `clinic_onboarding_tokens` | table | 200 | 0 | EMPTY |
| `clinics` | table | 200 | 1 | LEAK |
| `colored_line_configurations` | table | 200 | 0 | EMPTY |
| `consultation_collab_docs` | table | 200 | 0 | EMPTY |
| `consultation_note_events` | table | 206 | 92835 | UNEXPECTED_206 |
| `consultations` | table | 206 | 160522 | UNEXPECTED_206 |
| `crisalix_reconstructions` | table | 200 | 0 | EMPTY |
| `deal_stages` | table | 200 | 14 | LEAK |
| `deals` | table | 200 | 1143 | LEAK |
| `demo_bookings` | table | 200 | 0 | EMPTY |
| `doctor_scheduling_settings` | table | 200 | 11 | LEAK |
| `document_template_overrides` | table | 200 | 0 | EMPTY |
| `document_templates` | table | 200 | 0 | EMPTY |
| `documents` | table | 200 | 0 | EMPTY |
| `email_attachments` | table | 200 | 0 | EMPTY |
| `email_reply_notifications` | table | 200 | 0 | EMPTY |
| `email_template_categories` | table | 200 | 0 | EMPTY |
| `email_template_versions` | table | 200 | 0 | EMPTY |
| `email_templates` | table | 200 | 10 | LEAK |
| `emails` | table | 206 | 10646 | UNEXPECTED_206 |
| `embed_form_leads` | table | 200 | 0 | EMPTY |
| `exceptional_booking_availability` | table | 200 | 0 | EMPTY |
| `external_labs` | table | 200 | 0 | EMPTY |
| `favorites` | table | 200 | 0 | EMPTY |
| `icd10_code_options` | table | 200 | 0 | EMPTY |
| `invoice_installments` | table | 200 | 365 | LEAK |
| `invoice_line_items` | table | 206 | 52407 | UNEXPECTED_206 |
| `invoice_payments` | table | 200 | 0 | EMPTY |
| `invoices` | table | 206 | 49315 | UNEXPECTED_206 |
| `lead_imports` | table | 200 | 0 | EMPTY |
| `machines` | table | 200 | 9 | LEAK |
| `marketing_campaign_recipients` | table | 200 | 0 | EMPTY |
| `marketing_campaigns` | table | 200 | 0 | EMPTY |
| `marketing_lists` | table | 200 | 0 | EMPTY |
| `medical_records` | table | 200 | 0 | EMPTY |
| `medication_template_items` | table | 200 | 2 | LEAK |
| `medication_templates` | table | 200 | 2 | LEAK |
| `medidata_config` | table | 200 | 1 | LEAK |
| `medidata_notifications_log` | table | 200 | 96 | LEAK |
| `medidata_responses` | table | 200 | 324 | LEAK |
| `medidata_submission_history` | table | 200 | 1054 | LEAK |
| `medidata_submission_jobs` | table | 200 | 383 | LEAK |
| `medidata_submissions` | table | 200 | 360 | LEAK |
| `organization_api_keys` | table | 200 | 1 | LEAK |
| `organization_audit_log` | table | 200 | 0 | EMPTY |
| `organization_invitations` | table | 200 | 0 | EMPTY |
| `organization_members` | table | 200 | 0 | EMPTY |
| `organization_settings` | table | 200 | 0 | EMPTY |
| `organizations` | table | 200 | 0 | EMPTY |
| `patient_consents` | table | 200 | 0 | EMPTY |
| `patient_consultation_data` | table | 200 | 0 | EMPTY |
| `patient_deposits` | table | 200 | 0 | EMPTY |
| `patient_document_versions` | table | 200 | 0 | EMPTY |
| `patient_documents` | table | 200 | 177 | LEAK |
| `patient_edit_locks` | table | 200 | 3514 | LEAK |
| `patient_form_submissions` | table | 200 | 1167 | LEAK |
| `patient_health_background` | table | 200 | 2 | LEAK |
| `patient_insurances` | table | 206 | 12130 | UNEXPECTED_206 |
| `patient_intake_photos` | table | 200 | 0 | EMPTY |
| `patient_intake_preferences` | table | 200 | 0 | EMPTY |
| `patient_intake_submissions` | table | 200 | 379 | LEAK |
| `patient_measurements` | table | 200 | 0 | EMPTY |
| `patient_memberships` | table | 200 | 0 | EMPTY |
| `patient_note_mentions` | table | 200 | 0 | EMPTY |
| `patient_notes` | table | 200 | 167 | LEAK |
| `patient_packages` | table | 200 | 0 | EMPTY |
| `patient_prescriptions` | table | 200 | 1661 | LEAK |
| `patient_property_definitions` | table | 200 | 0 | EMPTY |
| `patient_property_values` | table | 200 | 0 | EMPTY |
| `patient_quotes` | table | 200 | 0 | EMPTY |
| `patient_simulations` | table | 200 | 0 | EMPTY |
| `patient_surgeries` | table | 200 | 0 | EMPTY |
| `patient_tag_assignments` | table | 200 | 0 | EMPTY |
| `patient_tags` | table | 200 | 0 | EMPTY |
| `patient_treatment_areas` | table | 200 | 0 | EMPTY |
| `patient_treatment_preferences` | table | 200 | 0 | EMPTY |
| `patient_treatments` | table | 200 | 0 | EMPTY |
| `patients` | table | 206 | 17163 | UNEXPECTED_206 |
| `patients_master_stage` | table | 200 | 0 | EMPTY |
| `pdf_generation_jobs` | table | 200 | 2751 | LEAK |
| `providers` | table | 200 | 44 | LEAK |
| `sales_pipeline_automation_runs` | table | 200 | 0 | EMPTY |
| `sales_pipeline_automations` | table | 200 | 0 | EMPTY |
| `sales_pipeline_email_templates` | table | 200 | 0 | EMPTY |
| `scheduled_emails` | table | 200 | 3284 | LEAK |
| `service_categories` | table | 200 | 21 | LEAK |
| `service_group_services` | table | 200 | 12 | LEAK |
| `service_groups` | table | 200 | 3 | LEAK |
| `service_machines` | table | 200 | 49 | LEAK |
| `services` | table | 200 | 621 | LEAK |
| `site_settings` | table | 200 | 0 | EMPTY |
| `stripe_transactions` | table | 200 | 599 | LEAK |
| `stripe_webhook_events` | table | 200 | 667 | LEAK |
| `swiss_insurer_laws` | table | 200 | 319 | LEAK |
| `swiss_insurers` | table | 200 | 234 | LEAK |
| `tardoc_group_items` | table | 200 | 177 | LEAK |
| `tardoc_groups` | table | 200 | 38 | LEAK |
| `task_comment_mentions` | table | 200 | 19 | LEAK |
| `task_comments` | table | 200 | 20 | LEAK |
| `tasks` | table | 200 | 33 | LEAK |
| `temp_patient_treatment_2` | table | 206 | 154133 | UNEXPECTED_206 |
| `tmp_accounted_medical_invoices` | table | 206 | 45196 | UNEXPECTED_206 |
| `tmp_appointments` | table | 206 | 111821 | UNEXPECTED_206 |
| `tmp_axenita_invoice_lines` | table | 206 | 41661 | UNEXPECTED_206 |
| `tmp_catalog_codes` | table | 200 | 0 | EMPTY |
| `tmp_contacts` | table | 200 | 0 | EMPTY |
| `tmp_contacts_phone` | table | 206 | 16030 | UNEXPECTED_206 |
| `tmp_deals` | table | 200 | 0 | EMPTY |
| `tmp_invoice_import` | table | 200 | 0 | EMPTY |
| `tmp_invoice_raw` | table | 206 | 45067 | UNEXPECTED_206 |
| `tmp_notes` | table | 200 | 0 | EMPTY |
| `tmp_patient_axenita` | table | 200 | 0 | EMPTY |
| `tmp_patient_with_address_and_ssn` | table | 200 | 0 | EMPTY |
| `tmp_patients` | table | 206 | 16192 | UNEXPECTED_206 |
| `tmp_treatment_flat` | table | 200 | 0 | EMPTY |
| `user_availability` | table | 200 | 0 | EMPTY |
| `users` | table | 200 | 16 | LEAK |
| `whatsapp_conversations` | table | 200 | 0 | EMPTY |
| `whatsapp_messages` | table | 200 | 0 | EMPTY |
| `whatsapp_queue` | table | 200 | 0 | EMPTY |
| `whatsapp_templates` | table | 200 | 0 | EMPTY |
| `workflow_actions` | table | 200 | 0 | EMPTY |
| `workflow_enrollment_steps` | table | 200 | 0 | EMPTY |
| `workflow_enrollments` | table | 200 | 0 | EMPTY |
| `workflow_events` | table | 200 | 0 | EMPTY |
| `workflow_jobs` | table | 200 | 0 | EMPTY |
| `workflow_runs_v2` | table | 200 | 0 | EMPTY |
| `workflow_staff_notifications` | table | 200 | 0 | EMPTY |
| `workflow_step_runs_v2` | table | 200 | 0 | EMPTY |
| `workflow_versions` | table | 200 | 0 | EMPTY |
| `workflows` | table | 200 | 4 | LEAK |
