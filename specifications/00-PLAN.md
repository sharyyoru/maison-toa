# Reverse Engineering Plan — Maison Toa

## What this is

A full reverse-engineering of the existing codebase into structured specification documents.
Each spec will describe what a page/module **does**, what data it reads/writes, and what the
business rules are — written clearly enough to rebuild from scratch.

---

## Execution Order

Run these one at a time. Check off each before starting the next.

| # | Spec File | Scope | Status |
|---|---|---|---|
| 01 | `01-project-overview.md` | Stack, architecture, auth, i18n, layout shell | ⬜ |
| 02 | `02-database-schema.md` | All Supabase tables, columns, relationships, RLS | ⬜ |
| 03 | `03-auth-and-users.md` | Login, register, roles, middleware, profile | ⬜ |
| 04 | `04-patients.md` | Patient list, patient detail page (all tabs) | ⬜ |
| 05 | `05-appointments.md` | Calendar, appointment modal, manage page, cancelled | ⬜ |
| 06 | `06-book-appointment-public.md` | Public booking funnel (location → doctor → category → treatment → slot) | ⬜ |
| 07 | `07-online-bookings-admin.md` | Admin view of online bookings, CMS booking page | ⬜ |
| 08 | `08-deals-crm.md` | Deals/pipeline page, stages, lead management | ⬜ |
| 09 | `09-leads.md` | Lead import, CSV import, Meta leads, embed forms, Retell calls | ⬜ |
| 10 | `10-financials-invoices.md` | Financials dashboard, invoice CRUD, PDF generation | ⬜ |
| 11 | `11-payment-flow.md` | Payrexx gateway, magic link, webhook, bank XML reconciliation | ⬜ |
| 12 | `12-insurance-billing.md` | Medidata/Sumex, KVG/UVG billing, TARDOC, ACF | ⬜ |
| 13 | `13-workflows-automation.md` | Workflow builder, templates, triggers, email/WhatsApp actions | ⬜ |
| 14 | `14-whatsapp.md` | WhatsApp panel, conversations, queue, web client | ⬜ |
| 15 | `15-tasks-comments-notifications.md` | Tasks, comments, notifications, email replies | ⬜ |
| 16 | `16-settings.md` | All settings tabs (clinic, doctors, booking, medidata, etc.) | ⬜ |
| 17 | `17-services.md` | Services/treatments catalog page | ⬜ |
| 18 | `18-documents.md` | Patient documents tab, templates, DOCX editor, PDF annotation | ⬜ |
| 19 | `19-intake-forms.md` | Patient intake flow, consultation steps, form builder | ⬜ |
| 20 | `20-onboarding.md` | Client onboarding wizard, magic link onboarding | ⬜ |
| 21 | `21-medidata-page.md` | Medidata admin page, insurer search, submission tracking | ⬜ |
| 22 | `22-insurers.md` | Insurers management page | ⬜ |
| 23 | `23-email-reports.md` | Email reports page, email tracking | ⬜ |
| 24 | `24-controllers.md` | Controllers/providers management page | ⬜ |
| 25 | `25-crisalix-3d.md` | Crisalix 3D simulation integration | ⬜ |
| 26 | `26-tardoc.md` | TARDOC tariff browser page | ⬜ |
| 27 | `27-embed-widgets.md` | Embeddable contact form, embeddable booking widget | ⬜ |
| 28 | `28-qr-codes.md` | QR code generator page | ⬜ |
| 29 | `29-chat.md` | Internal AI chat page | ⬜ |
| 30 | `30-api-reference.md` | All API routes summary with inputs/outputs | ⬜ |

---

## Inventory of All Pages

### Internal CRM (requires auth)

| Route | File | Description |
|---|---|---|
| `/` | `src/app/page.tsx` | Dashboard / home |
| `/login` | `src/app/login/page.tsx` | Login page |
| `/register` | `src/app/register/page.tsx` | Staff registration |
| `/profile` | `src/app/profile/page.tsx` | User profile settings |
| `/users` | `src/app/users/page.tsx` | User management |
| `/patients` | `src/app/patients/page.tsx` | Patient list |
| `/patients/[id]` | `src/app/patients/[id]/page.tsx` | Patient detail (multi-tab) |
| `/patients/[id]/details` | `src/app/patients/[id]/details/page.tsx` | Patient details wizard |
| `/patients/[id]/3d` | `src/app/patients/[id]/3d/page.tsx` | Crisalix 3D setup |
| `/add-patients` | `src/app/add-patients/page.tsx` | Quick add patient |
| `/appointments` | `src/app/appointments/page.tsx` | Appointments calendar |
| `/appointments/manage` | `src/app/appointments/manage/page.tsx` | Appointment management table |
| `/appointments/cancelled` | `src/app/appointments/cancelled/page.tsx` | Cancelled appointments |
| `/deals` | `src/app/deals/page.tsx` | CRM pipeline / deals |
| `/leads` | `src/app/leads/page.tsx` | Leads (redirect) |
| `/lead-import` | `src/app/lead-import/page.tsx` | Lead CSV import |
| `/lead-import/meta-leads` | `src/app/lead-import/meta-leads/page.tsx` | Meta/Facebook leads |
| `/lead-import/embed-forms` | `src/app/lead-import/embed-forms/page.tsx` | Embed form leads |
| `/lead-import/history` | `src/app/lead-import/history/page.tsx` | Import history |
| `/lead-import/resend-whatsapp` | `src/app/lead-import/resend-whatsapp/page.tsx` | Resend WhatsApp to leads |
| `/lead-import/retell-calls` | `src/app/lead-import/retell-calls/page.tsx` | Retell AI call logs |
| `/financials` | `src/app/financials/page.tsx` | Invoices & financials dashboard |
| `/tasks` | `src/app/tasks/page.tsx` | Task management |
| `/comments` | `src/app/comments/page.tsx` | Comments feed |
| `/notifications` | `src/app/notifications/page.tsx` | Notifications center |
| `/notifications/email-replies` | `src/app/notifications/email-replies/page.tsx` | Email reply notifications |
| `/chat` | `src/app/chat/page.tsx` | AI chat assistant |
| `/workflows` | `src/app/workflows/page.tsx` | Workflow list |
| `/workflows/builder` | `src/app/workflows/builder/page.tsx` | Workflow builder |
| `/workflows/templates` | `src/app/workflows/templates/page.tsx` | Workflow templates |
| `/workflows/all` | `src/app/workflows/all/page.tsx` | All workflows view |
| `/workflows/appointment` | `src/app/workflows/appointment/page.tsx` | Appointment workflows |
| `/settings` | `src/app/settings/page.tsx` | Settings (multi-tab) |
| `/services` | `src/app/services/page.tsx` | Services/treatments catalog |
| `/insurers` | `src/app/insurers/page.tsx` | Insurers management |
| `/medidata` | `src/app/medidata/page.tsx` | Medidata admin |
| `/tardoc` | `src/app/tardoc/page.tsx` | TARDOC tariff browser |
| `/email-reports` | `src/app/email-reports/page.tsx` | Email reports |
| `/controllers` | `src/app/controllers/page.tsx` | Controllers/providers |
| `/bookings` | `src/app/bookings/page.tsx` | Online bookings admin |
| `/online-bookings` | `src/app/online-bookings/page.tsx` | Online bookings (alt view) |
| `/internal-docs` | `src/app/internal-docs/page.tsx` | Internal documentation |
| `/qr-codes` | `src/app/qr-codes/page.tsx` | QR code generator |
| `/crisalix` | `src/app/crisalix/` | Crisalix integration |
| `/pre-consultation` | `src/app/pre-consultation/page.tsx` | Pre-consultation page |
| `/client-onboarding` | `src/app/client-onboarding/page.tsx` | Client onboarding |

### Admin Pages

| Route | File | Description |
|---|---|---|
| `/admin/booking-categories` | `src/app/admin/booking-categories/page.tsx` | Manage booking categories |
| `/admin/add-doctor` | `src/app/admin/add-doctor/page.tsx` | Add doctor/provider |

### Public Booking Funnel (no auth)

| Route | File | Description |
|---|---|---|
| `/book-appointment` | `src/app/book-appointment/page.tsx` | Booking entry (new vs existing) |
| `/book-appointment/first-visit` | `src/app/book-appointment/first-visit/page.tsx` | First visit info |
| `/book-appointment/location` | `src/app/book-appointment/location/page.tsx` | Location selection |
| `/book-appointment/doctors` | `src/app/book-appointment/doctors/page.tsx` | Doctor listing |
| `/book-appointment/doctors/[slug]` | `src/app/book-appointment/doctors/[slug]/page.tsx` | Doctor profile + booking |
| `/book-appointment/new-patient` | `src/app/book-appointment/new-patient/page.tsx` | New patient category select |
| `/book-appointment/new-patient/[category]` | `src/app/book-appointment/new-patient/[category]/page.tsx` | New patient treatment select |
| `/book-appointment/new-patient/[category]/[treatment]` | dynamic | New patient slot picker |
| `/book-appointment/existing-patient` | `src/app/book-appointment/existing-patient/page.tsx` | Existing patient category select |
| `/book-appointment/existing-patient/[category]` | `src/app/book-appointment/existing-patient/[category]/page.tsx` | Existing patient treatment select |
| `/book-appointment/existing-patient/[category]/[treatment]` | dynamic | Existing patient slot picker |
| `/cms/book-appointment` | `src/app/cms/book-appointment/page.tsx` | CMS booking page builder |

### Embeddable Widgets (no auth, iframe)

| Route | File | Description |
|---|---|---|
| `/embed/book` | `src/app/embed/book/page.tsx` | Embeddable booking widget |
| `/embed/contact` | `src/app/embed/contact/page.tsx` | Embeddable contact form |

### Patient-Facing Public Pages (no auth)

| Route | File | Description |
|---|---|---|
| `/invoice/pay/[token]` | `src/app/invoice/pay/[token]/page.tsx` | Invoice payment page (magic link) |
| `/invoice/payment-success` | `src/app/invoice/payment-success/page.tsx` | Payment success |
| `/invoice/payment-cancelled` | `src/app/invoice/payment-cancelled/page.tsx` | Payment cancelled |
| `/invoice/payment-failed` | `src/app/invoice/payment-failed/page.tsx` | Payment failed |
| `/intake` | `src/app/intake/page.tsx` | Patient intake form entry |
| `/intake/steps` | `src/app/intake/steps/page.tsx` | Intake multi-step form |
| `/intake/consultation/[category]` | `src/app/intake/consultation/[category]/page.tsx` | Intake by category |
| `/consultations` | `src/app/consultations/page.tsx` | Consultation entry |
| `/consultations/steps` | `src/app/consultations/steps/page.tsx` | Consultation steps |
| `/form/[formId]` | `src/app/form/[formId]/page.tsx` | Dynamic form renderer |
| `/onboarding` | `src/app/onboarding/page.tsx` | Patient onboarding wizard |

---

## Key Shared Components

| Component | File | Used For |
|---|---|---|
| `AppointmentModal` | `src/components/AppointmentModal.tsx` | Create/edit appointments |
| `InsuranceBillingModal` | `src/components/InsuranceBillingModal.tsx` | Submit insurance invoices |
| `GlobalPatientSearch` | `src/components/GlobalPatientSearch.tsx` | Header search |
| `GlobalWhatsAppPanel` | `src/components/GlobalWhatsAppPanel.tsx` | WhatsApp slide-over panel |
| `PatientTabBar` | `src/components/PatientTabBar.tsx` | Patient detail tab navigation |
| `TaskCreateModal` / `TaskEditModal` | `src/components/Task*.tsx` | Task management |
| `PatientMergeModal` | `src/components/PatientMergeModal.tsx` | Merge duplicate patients |
| `TardocGroupsTab` | `src/components/TardocGroupsTab.tsx` | TARDOC groups in billing |
| `SignatureEditor` | `src/components/SignatureEditor.tsx` | Email signature editor |
| `EmailTemplateBuilder` | `src/components/EmailTemplateBuilder.tsx` | Workflow email builder |
| `DocxPreviewEditor` | `src/components/DocxEditor/DocxPreviewEditor.tsx` | DOCX editing |
| `PdfAnnotationEditor` | `src/components/PdfAnnotationEditor.tsx` | PDF annotation |
| `PageBuilder` | `src/components/PageBuilder/PageBuilder.tsx` | CMS page builder |
| `InvoiceStatusBadge` | `src/components/InvoiceStatusBadge.tsx` | Invoice status display |
| `AuthContext` | `src/components/AuthContext.tsx` | Auth state |
| `RequireAuth` | `src/components/RequireAuth.tsx` | Auth guard wrapper |

---

## Notes for Spec Writers

- Each spec should cover: **Purpose**, **URL/Route**, **Who can access**, **UI layout**, **Data sources** (which Supabase tables), **Key actions** (what the user can do), **Business rules**, **API calls made**, **Edge cases**.
- Keep specs implementation-agnostic where possible — describe *what* not *how*.
- Flag anything that looks like a bug or incomplete feature with `⚠️`.
