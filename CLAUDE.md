# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Project Is

Maison TOA is a medical CRM and billing system for aesthetic clinics in Switzerland. It handles patient management, appointment scheduling, Swiss insurance billing (TARDOC/ACF/SUMEX), document generation, WhatsApp/email communication, and a CRM sales pipeline.

## Commands

```bash
# Development
npm run dev          # Start Next.js dev server
npm run build        # Production build
npm run start        # Start production server
npm run lint         # Run ESLint
npm run whatsapp     # Start WhatsApp bot server (separate Node.js process)
```

There is no test suite in this project.

## Architecture

### Framework & Stack
- **Next.js 15** (App Router) with **React 19** and **TypeScript**
- **Supabase** (PostgreSQL + Auth + Storage) — no ORM, uses `@supabase/supabase-js` client directly
- **Tailwind CSS 4** for styling
- Deployed on **Vercel**; WhatsApp server on **Railway**

### Path Alias
`@/*` maps to `./src/*`

### Supabase Clients
- `src/lib/supabaseClient.ts` — browser client (anon key, auto-refresh sessions)
- `src/lib/supabaseAdmin.ts` — server-only client (service role key, no session management)
- Always use the admin client in API routes (`/src/app/api/`) and the regular client in components

### Authentication & Roles
- Supabase Auth with JWT; roles stored in the `users` table
- Roles: `admin`, `doctor`, `nurse`, `technician`, `staff`
- `src/components/AuthContext.tsx` — auth context provider
- `src/components/RequireAuth.tsx` — route protection wrapper

### Key Domain Concepts

**Providers vs Doctors**: The `providers` table holds two types of records:
1. **Billing entities** (clinics) — have IBAN, used on invoices as the billing party
2. **Medical staff** (doctors/nurses) — have RCC/ZSR numbers for Swiss insurance billing
See `DOCTOR_VS_PROVIDER_ARCHITECTURE.md` for the full explanation.

**Invoice/Billing Flow**: `invoices` links a provider (clinic), a doctor, and a patient, with services using TARDOC AA.XX.XXXX codes. Supports Tiers Payant (insurance), cash, and semi-private billing. TARDOC XML generation handled in API routes.

**Patient Edit Locks**: The `patient_edit_locks` table prevents concurrent editing of patient records.

### Directory Structure
```
src/
  app/              # Next.js App Router pages + API routes
    api/            # Server-side API endpoints
  components/       # React components (feature-organized)
  contexts/         # React context providers
  lib/              # Supabase clients, external API wrappers
  types/            # TypeScript type definitions
  utils/            # Shared utility functions (incl. swissTimezone.ts)
server/             # Standalone WhatsApp bot (whatsapp-web.js)
supabase/           # schema.sql, seed.sql, migrations/
scripts/            # One-off migration and setup scripts
```

### External Integrations
- **Mailgun** — transactional email; scheduled emails via Vercel cron (`/api/cron/send-scheduled-emails`, runs hourly)
- **WhatsApp Web** — `server/whatsapp-server.js` runs separately; **Twilio** as backup
- **Medidata / TARDOC / ACF/SUMEX** — Swiss medical data and insurance billing
- **Crisalix** — 3D surgical planning (OAuth flow)
- **Payrexx** — payment processing + Swiss QR bills
- **Google APIs** — Drive, Gmail integration
- **Compendium** — Swiss drug database search

### Document Handling
Multiple document types supported: DOCX (via `docx` library), PDF (via `jspdf`/`pdf-lib`), HEIC images (converted server-side via `heic-convert`). Rich text editing via Slate.js; email template building via `react-email-editor`.

### Environment Variables
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY   # safe for client
SUPABASE_SERVICE_ROLE_KEY       # server-only, never expose to client
```
Additional vars for Mailgun, Twilio, Payrexx, Google APIs, Crisalix, Medidata — see `.env.local`.