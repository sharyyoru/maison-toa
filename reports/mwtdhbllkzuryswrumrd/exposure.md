# Exposure window — `mwtdhbllkzuryswrumrd`

Determined 2026-10-09T04:22:31.868Z.

## Migration history bounds

- Earliest applied migration: `20260817143842`
- Latest applied migration: `20260817143842`
- Total applied: 1

Postgres does not record *when* RLS was disabled on a table, and
`pg_class.relrowsecurity` carries no history. The window below is therefore
bounded by the migration that created each table — i.e. the table has been
readable for at most that long, and the true start is the creation date unless a
later migration explicitly enabled then removed RLS.

## Tables currently without RLS

| Table | Approx rows | Creating migration (grep) |
|---|---|---|
| `admin_gmail_accounts` | 0 | _see `git log -S "admin_gmail_accounts" -- supabase/migrations`_ |
| `admin_task_comments` | 0 | _see `git log -S "admin_task_comments" -- supabase/migrations`_ |
| `admin_task_mentions` | 0 | _see `git log -S "admin_task_mentions" -- supabase/migrations`_ |
| `admin_task_notifications` | 0 | _see `git log -S "admin_task_notifications" -- supabase/migrations`_ |
| `admin_tasks` | 0 | _see `git log -S "admin_tasks" -- supabase/migrations`_ |
| `admin_users` | 2 | _see `git log -S "admin_users" -- supabase/migrations`_ |
| `bank_accounts` | 3 | _see `git log -S "bank_accounts" -- supabase/migrations`_ |
| `bank_payment_import_items` | 596 | _see `git log -S "bank_payment_import_items" -- supabase/migrations`_ |
| `bank_payment_imports` | 247 | _see `git log -S "bank_payment_imports" -- supabase/migrations`_ |
| `booking_categories` | 12 | _see `git log -S "booking_categories" -- supabase/migrations`_ |
| `booking_category_doctors` | 2 | _see `git log -S "booking_category_doctors" -- supabase/migrations`_ |
| `booking_doctors` | 10 | _see `git log -S "booking_doctors" -- supabase/migrations`_ |
| `booking_links` | 7 | _see `git log -S "booking_links" -- supabase/migrations`_ |
| `booking_treatment_doctors` | 332 | _see `git log -S "booking_treatment_doctors" -- supabase/migrations`_ |
| `booking_treatments` | 106 | _see `git log -S "booking_treatments" -- supabase/migrations`_ |
| `calendar_defaults` | 19 | _see `git log -S "calendar_defaults" -- supabase/migrations`_ |
| `chat_folders` | 0 | _see `git log -S "chat_folders" -- supabase/migrations`_ |
| `client_invoices` | 0 | _see `git log -S "client_invoices" -- supabase/migrations`_ |
| `clinics` | 1 | _see `git log -S "clinics" -- supabase/migrations`_ |
| `consultation_note_events` | 92835 | _see `git log -S "consultation_note_events" -- supabase/migrations`_ |
| `crisalix_reconstructions` | 0 | _see `git log -S "crisalix_reconstructions" -- supabase/migrations`_ |
| `demo_bookings` | 0 | _see `git log -S "demo_bookings" -- supabase/migrations`_ |
| `doctor_scheduling_settings` | 11 | _see `git log -S "doctor_scheduling_settings" -- supabase/migrations`_ |
| `document_templates` | 0 | _see `git log -S "document_templates" -- supabase/migrations`_ |
| `email_reply_notifications` | 0 | _see `git log -S "email_reply_notifications" -- supabase/migrations`_ |
| `external_labs` | 0 | _see `git log -S "external_labs" -- supabase/migrations`_ |
| `invoice_installments` | 365 | _see `git log -S "invoice_installments" -- supabase/migrations`_ |
| `machines` | 9 | _see `git log -S "machines" -- supabase/migrations`_ |
| `medication_template_items` | 2 | _see `git log -S "medication_template_items" -- supabase/migrations`_ |
| `medication_templates` | 2 | _see `git log -S "medication_templates" -- supabase/migrations`_ |
| `medidata_config` | 1 | _see `git log -S "medidata_config" -- supabase/migrations`_ |
| `medidata_notifications_log` | 96 | _see `git log -S "medidata_notifications_log" -- supabase/migrations`_ |
| `medidata_responses` | 324 | _see `git log -S "medidata_responses" -- supabase/migrations`_ |
| `medidata_submission_history` | 1054 | _see `git log -S "medidata_submission_history" -- supabase/migrations`_ |
| `medidata_submission_jobs` | 383 | _see `git log -S "medidata_submission_jobs" -- supabase/migrations`_ |
| `medidata_submissions` | 360 | _see `git log -S "medidata_submissions" -- supabase/migrations`_ |
| `organization_api_keys` | 1 | _see `git log -S "organization_api_keys" -- supabase/migrations`_ |
| `organization_audit_log` | 0 | _see `git log -S "organization_audit_log" -- supabase/migrations`_ |
| `organization_invitations` | 0 | _see `git log -S "organization_invitations" -- supabase/migrations`_ |
| `organization_members` | 0 | _see `git log -S "organization_members" -- supabase/migrations`_ |
| `organization_settings` | 0 | _see `git log -S "organization_settings" -- supabase/migrations`_ |
| `organizations` | 0 | _see `git log -S "organizations" -- supabase/migrations`_ |
| `patient_document_versions` | 0 | _see `git log -S "patient_document_versions" -- supabase/migrations`_ |
| `patient_documents` | 177 | _see `git log -S "patient_documents" -- supabase/migrations`_ |
| `patient_edit_locks` | 3514 | _see `git log -S "patient_edit_locks" -- supabase/migrations`_ |
| `patient_insurances` | 12130 | _see `git log -S "patient_insurances" -- supabase/migrations`_ |
| `patient_note_mentions` | 0 | _see `git log -S "patient_note_mentions" -- supabase/migrations`_ |
| `patient_prescriptions` | 1661 | _see `git log -S "patient_prescriptions" -- supabase/migrations`_ |
| `patients_master_stage` | 0 | _see `git log -S "patients_master_stage" -- supabase/migrations`_ |
| `pdf_generation_jobs` | 2751 | _see `git log -S "pdf_generation_jobs" -- supabase/migrations`_ |
| `scheduled_emails` | 3284 | _see `git log -S "scheduled_emails" -- supabase/migrations`_ |
| `service_categories` | 21 | _see `git log -S "service_categories" -- supabase/migrations`_ |
| `service_group_services` | 12 | _see `git log -S "service_group_services" -- supabase/migrations`_ |
| `service_groups` | 3 | _see `git log -S "service_groups" -- supabase/migrations`_ |
| `service_machines` | 49 | _see `git log -S "service_machines" -- supabase/migrations`_ |
| `services` | 621 | _see `git log -S "services" -- supabase/migrations`_ |
| `stripe_transactions` | 599 | _see `git log -S "stripe_transactions" -- supabase/migrations`_ |
| `stripe_webhook_events` | 667 | _see `git log -S "stripe_webhook_events" -- supabase/migrations`_ |
| `swiss_insurer_laws` | 319 | _see `git log -S "swiss_insurer_laws" -- supabase/migrations`_ |
| `swiss_insurers` | 234 | _see `git log -S "swiss_insurers" -- supabase/migrations`_ |
| `task_comment_mentions` | 19 | _see `git log -S "task_comment_mentions" -- supabase/migrations`_ |
| `task_comments` | 20 | _see `git log -S "task_comments" -- supabase/migrations`_ |
| `temp_patient_treatment_2` | 154133 | _see `git log -S "temp_patient_treatment_2" -- supabase/migrations`_ |
| `tmp_accounted_medical_invoices` | 45196 | _see `git log -S "tmp_accounted_medical_invoices" -- supabase/migrations`_ |
| `tmp_appointments` | 111821 | _see `git log -S "tmp_appointments" -- supabase/migrations`_ |
| `tmp_axenita_invoice_lines` | 41661 | _see `git log -S "tmp_axenita_invoice_lines" -- supabase/migrations`_ |
| `tmp_catalog_codes` | 0 | _see `git log -S "tmp_catalog_codes" -- supabase/migrations`_ |
| `tmp_contacts` | 0 | _see `git log -S "tmp_contacts" -- supabase/migrations`_ |
| `tmp_contacts_phone` | 16030 | _see `git log -S "tmp_contacts_phone" -- supabase/migrations`_ |
| `tmp_deals` | 0 | _see `git log -S "tmp_deals" -- supabase/migrations`_ |
| `tmp_invoice_import` | 0 | _see `git log -S "tmp_invoice_import" -- supabase/migrations`_ |
| `tmp_invoice_raw` | 45067 | _see `git log -S "tmp_invoice_raw" -- supabase/migrations`_ |
| `tmp_notes` | 0 | _see `git log -S "tmp_notes" -- supabase/migrations`_ |
| `tmp_patient_axenita` | 0 | _see `git log -S "tmp_patient_axenita" -- supabase/migrations`_ |
| `tmp_patient_with_address_and_ssn` | 0 | _see `git log -S "tmp_patient_with_address_and_ssn" -- supabase/migrations`_ |
| `tmp_patients` | 16192 | _see `git log -S "tmp_patients" -- supabase/migrations`_ |
| `tmp_treatment_flat` | 0 | _see `git log -S "tmp_treatment_flat" -- supabase/migrations`_ |
| `users` | 16 | _see `git log -S "users" -- supabase/migrations`_ |
| `workflow_actions` | 0 | _see `git log -S "workflow_actions" -- supabase/migrations`_ |

## Log-derived bounds

- Oldest log row available: _no logs retrieved_
- Newest log row available: _no logs retrieved_

Log retention is shorter than the exposure window (see
`access_logs_summary.md`), so logs bound only the recent tail.

## Credential exposure (separate and more severe)

See `reports/CRITICAL-leaked-service-role-keys.md`: `service_role` keys were
public in a GitHub repository for ~203 days. `service_role` bypasses RLS, so for
any table listed above, the effective exposure window is the **longer** of the
RLS gap and the credential leak.
