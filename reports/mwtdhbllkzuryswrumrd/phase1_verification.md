# Phase 1 verification — maisontoa-clinic (`mwtdhbllkzuryswrumrd`)

Run: 2026-10-09T04:48:51.743Z
Key used: `publishable` (value never stored)
Method: `HEAD /rest/v1/<relation>?select=*` with `Prefer: count=exact` — counts only, no rows transferred.

## Result: **PASS** — anon can read nothing

Relations probed: **155**

| Verdict | Count | Meaning |
|---|---|---|
| BLOCKED | 155 | 401/403 — anon rejected outright |
| EMPTY | 0 | 200 but zero rows — RLS denying every row |
| NOT_EXPOSED | 0 | 404 — not in the PostgREST schema cache |
| **LEAK** | **0** | **200 with rows — still readable** |
| unexpected/error | 0 | needs manual review |



## Storage buckets

| Bucket | public flag | anon list | verdict |
|---|---|---|---|
| `avatars` | false | 0 | EMPTY |
| `booking-images` | false | 0 | EMPTY |
| `cash-receipts` | false | 0 | EMPTY |
| `doctor-images` | false | 0 | EMPTY |
| `document-templates` | false | 0 | EMPTY |
| `email-assets` | false | 0 | EMPTY |
| `email-attachments` | false | 0 | EMPTY |
| `emailgallery` | false | 0 | EMPTY |
| `finance-documents` | false | 0 | EMPTY |
| `invoice-pdfs` | false | 0 | EMPTY |
| `page-builder-images` | false | 0 | EMPTY |
| `patient-avatars` | false | 0 | EMPTY |
| `patient-docs` | false | 0 | EMPTY |
| `patient-documents` | false | 0 | EMPTY |
| `patient-intake-photos` | false | 0 | EMPTY |
| `patient-photos` | false | 0 | EMPTY |

## Full detail

| Relation | Kind | HTTP | anon-visible rows | Verdict |
|---|---|---|---|---|
| `admin_gmail_accounts` | table | 401 | - | BLOCKED |
| `admin_task_comments` | table | 401 | - | BLOCKED |
| `admin_task_mentions` | table | 401 | - | BLOCKED |
| `admin_task_notifications` | table | 401 | - | BLOCKED |
| `admin_tasks` | table | 401 | - | BLOCKED |
| `admin_users` | table | 401 | - | BLOCKED |
| `appointment_status_options` | table | 401 | - | BLOCKED |
| `appointments` | table | 401 | - | BLOCKED |
| `bank_accounts` | table | 401 | - | BLOCKED |
| `bank_payment_import_items` | table | 401 | - | BLOCKED |
| `bank_payment_imports` | table | 401 | - | BLOCKED |
| `booking_blocked_dates` | table | 401 | - | BLOCKED |
| `booking_categories` | table | 401 | - | BLOCKED |
| `booking_category_doctors` | table | 401 | - | BLOCKED |
| `booking_doctors` | table | 401 | - | BLOCKED |
| `booking_links` | table | 401 | - | BLOCKED |
| `booking_treatment_doctors` | table | 401 | - | BLOCKED |
| `booking_treatments` | table | 401 | - | BLOCKED |
| `calendar_defaults` | table | 401 | - | BLOCKED |
| `chat_conversations` | table | 401 | - | BLOCKED |
| `chat_folders` | table | 401 | - | BLOCKED |
| `chat_messages` | table | 401 | - | BLOCKED |
| `client_invoices` | table | 401 | - | BLOCKED |
| `clinic_onboarding_submissions` | table | 401 | - | BLOCKED |
| `clinic_onboarding_tokens` | table | 401 | - | BLOCKED |
| `clinics` | table | 401 | - | BLOCKED |
| `colored_line_configurations` | table | 401 | - | BLOCKED |
| `consultation_collab_docs` | table | 401 | - | BLOCKED |
| `consultation_note_events` | table | 401 | - | BLOCKED |
| `consultations` | table | 401 | - | BLOCKED |
| `crisalix_reconstructions` | table | 401 | - | BLOCKED |
| `deal_stages` | table | 401 | - | BLOCKED |
| `deals` | table | 401 | - | BLOCKED |
| `demo_bookings` | table | 401 | - | BLOCKED |
| `doctor_scheduling_settings` | table | 401 | - | BLOCKED |
| `document_template_overrides` | table | 401 | - | BLOCKED |
| `document_templates` | table | 401 | - | BLOCKED |
| `documents` | table | 401 | - | BLOCKED |
| `email_attachments` | table | 401 | - | BLOCKED |
| `email_reply_notifications` | table | 401 | - | BLOCKED |
| `email_template_categories` | table | 401 | - | BLOCKED |
| `email_template_versions` | table | 401 | - | BLOCKED |
| `email_templates` | table | 401 | - | BLOCKED |
| `emails` | table | 401 | - | BLOCKED |
| `embed_form_leads` | table | 401 | - | BLOCKED |
| `exceptional_booking_availability` | table | 401 | - | BLOCKED |
| `external_labs` | table | 401 | - | BLOCKED |
| `favorites` | table | 401 | - | BLOCKED |
| `icd10_code_options` | table | 401 | - | BLOCKED |
| `invoice_installments` | table | 401 | - | BLOCKED |
| `invoice_line_items` | table | 401 | - | BLOCKED |
| `invoice_payments` | table | 401 | - | BLOCKED |
| `invoices` | table | 401 | - | BLOCKED |
| `lead_imports` | table | 401 | - | BLOCKED |
| `machines` | table | 401 | - | BLOCKED |
| `marketing_campaign_recipients` | table | 401 | - | BLOCKED |
| `marketing_campaigns` | table | 401 | - | BLOCKED |
| `marketing_lists` | table | 401 | - | BLOCKED |
| `medical_records` | table | 401 | - | BLOCKED |
| `medication_template_items` | table | 401 | - | BLOCKED |
| `medication_templates` | table | 401 | - | BLOCKED |
| `medidata_config` | table | 401 | - | BLOCKED |
| `medidata_notifications_log` | table | 401 | - | BLOCKED |
| `medidata_responses` | table | 401 | - | BLOCKED |
| `medidata_submission_history` | table | 401 | - | BLOCKED |
| `medidata_submission_jobs` | table | 401 | - | BLOCKED |
| `medidata_submissions` | table | 401 | - | BLOCKED |
| `organization_api_keys` | table | 401 | - | BLOCKED |
| `organization_audit_log` | table | 401 | - | BLOCKED |
| `organization_invitations` | table | 401 | - | BLOCKED |
| `organization_members` | table | 401 | - | BLOCKED |
| `organization_settings` | table | 401 | - | BLOCKED |
| `organizations` | table | 401 | - | BLOCKED |
| `patient_consents` | table | 401 | - | BLOCKED |
| `patient_consultation_data` | table | 401 | - | BLOCKED |
| `patient_deposits` | table | 401 | - | BLOCKED |
| `patient_document_versions` | table | 401 | - | BLOCKED |
| `patient_documents` | table | 401 | - | BLOCKED |
| `patient_edit_locks` | table | 401 | - | BLOCKED |
| `patient_form_submissions` | table | 401 | - | BLOCKED |
| `patient_health_background` | table | 401 | - | BLOCKED |
| `patient_insurances` | table | 401 | - | BLOCKED |
| `patient_intake_photos` | table | 401 | - | BLOCKED |
| `patient_intake_preferences` | table | 401 | - | BLOCKED |
| `patient_intake_submissions` | table | 401 | - | BLOCKED |
| `patient_measurements` | table | 401 | - | BLOCKED |
| `patient_memberships` | table | 401 | - | BLOCKED |
| `patient_note_mentions` | table | 401 | - | BLOCKED |
| `patient_notes` | table | 401 | - | BLOCKED |
| `patient_packages` | table | 401 | - | BLOCKED |
| `patient_prescriptions` | table | 401 | - | BLOCKED |
| `patient_property_definitions` | table | 401 | - | BLOCKED |
| `patient_property_values` | table | 401 | - | BLOCKED |
| `patient_quotes` | table | 401 | - | BLOCKED |
| `patient_simulations` | table | 401 | - | BLOCKED |
| `patient_surgeries` | table | 401 | - | BLOCKED |
| `patient_tag_assignments` | table | 401 | - | BLOCKED |
| `patient_tags` | table | 401 | - | BLOCKED |
| `patient_treatment_areas` | table | 401 | - | BLOCKED |
| `patient_treatment_preferences` | table | 401 | - | BLOCKED |
| `patient_treatments` | table | 401 | - | BLOCKED |
| `patients` | table | 401 | - | BLOCKED |
| `patients_master_stage` | table | 401 | - | BLOCKED |
| `pdf_generation_jobs` | table | 401 | - | BLOCKED |
| `providers` | table | 401 | - | BLOCKED |
| `sales_pipeline_automation_runs` | table | 401 | - | BLOCKED |
| `sales_pipeline_automations` | table | 401 | - | BLOCKED |
| `sales_pipeline_email_templates` | table | 401 | - | BLOCKED |
| `scheduled_emails` | table | 401 | - | BLOCKED |
| `service_categories` | table | 401 | - | BLOCKED |
| `service_group_services` | table | 401 | - | BLOCKED |
| `service_groups` | table | 401 | - | BLOCKED |
| `service_machines` | table | 401 | - | BLOCKED |
| `services` | table | 401 | - | BLOCKED |
| `site_settings` | table | 401 | - | BLOCKED |
| `stripe_transactions` | table | 401 | - | BLOCKED |
| `stripe_webhook_events` | table | 401 | - | BLOCKED |
| `swiss_insurer_laws` | table | 401 | - | BLOCKED |
| `swiss_insurers` | table | 401 | - | BLOCKED |
| `tardoc_group_items` | table | 401 | - | BLOCKED |
| `tardoc_groups` | table | 401 | - | BLOCKED |
| `task_comment_mentions` | table | 401 | - | BLOCKED |
| `task_comments` | table | 401 | - | BLOCKED |
| `tasks` | table | 401 | - | BLOCKED |
| `temp_patient_treatment_2` | table | 401 | - | BLOCKED |
| `tmp_accounted_medical_invoices` | table | 401 | - | BLOCKED |
| `tmp_appointments` | table | 401 | - | BLOCKED |
| `tmp_axenita_invoice_lines` | table | 401 | - | BLOCKED |
| `tmp_catalog_codes` | table | 401 | - | BLOCKED |
| `tmp_contacts` | table | 401 | - | BLOCKED |
| `tmp_contacts_phone` | table | 401 | - | BLOCKED |
| `tmp_deals` | table | 401 | - | BLOCKED |
| `tmp_invoice_import` | table | 401 | - | BLOCKED |
| `tmp_invoice_raw` | table | 401 | - | BLOCKED |
| `tmp_notes` | table | 401 | - | BLOCKED |
| `tmp_patient_axenita` | table | 401 | - | BLOCKED |
| `tmp_patient_with_address_and_ssn` | table | 401 | - | BLOCKED |
| `tmp_patients` | table | 401 | - | BLOCKED |
| `tmp_treatment_flat` | table | 401 | - | BLOCKED |
| `user_availability` | table | 401 | - | BLOCKED |
| `users` | table | 401 | - | BLOCKED |
| `whatsapp_conversations` | table | 401 | - | BLOCKED |
| `whatsapp_messages` | table | 401 | - | BLOCKED |
| `whatsapp_queue` | table | 401 | - | BLOCKED |
| `whatsapp_templates` | table | 401 | - | BLOCKED |
| `workflow_actions` | table | 401 | - | BLOCKED |
| `workflow_enrollment_steps` | table | 401 | - | BLOCKED |
| `workflow_enrollments` | table | 401 | - | BLOCKED |
| `workflow_events` | table | 401 | - | BLOCKED |
| `workflow_jobs` | table | 401 | - | BLOCKED |
| `workflow_runs_v2` | table | 401 | - | BLOCKED |
| `workflow_staff_notifications` | table | 401 | - | BLOCKED |
| `workflow_step_runs_v2` | table | 401 | - | BLOCKED |
| `workflow_versions` | table | 401 | - | BLOCKED |
| `workflows` | table | 401 | - | BLOCKED |
