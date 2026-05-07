# Maison Toa — Payment Flow Reference

> Generated: 2026-04-29  
> Stack: Next.js 15 (App Router) · Supabase · Payrexx · Swiss QR-bill · camt.054 XML

---

## 1. Project Overview

**Maison Toa** is a medical CRM for an aesthetic surgery clinic in Geneva. It manages patients, appointments, invoices, insurance billing, and online payments.

- **Frontend/Backend**: Next.js 15 App Router (TypeScript)
- **Database**: Supabase (PostgreSQL + RLS)
- **Payment Gateway**: Payrexx (`aesthetics-ge` instance)
- **Insurance Billing**: Swiss Medidata / Sumex (KVG, UVG, IVG, MVG, VVG)
- **Bank Reconciliation**: camt.054 XML import (PostFinance)
- **PDF Generation**: pdf-lib + jsPDF + Swiss QR-bill
- **Currency**: CHF only

---

## 2. Key Environment Variables (Payment-Related)

| Variable | Purpose |
|---|---|
| `PAYREXX_INSTANCE` | Payrexx account name (`aesthetics-ge`) |
| `PAYREXX_API_SECRET` | Payrexx API key (used as `X-API-KEY` header) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Admin Supabase client (bypasses RLS) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public Supabase client |
| `NEXT_PUBLIC_APP_URL` | Base URL for redirect URLs sent to Payrexx |
| `MEDIDATA_PROXY_URL` | Railway-hosted Medidata proxy for insurance billing |
| `MEDIDATA_PROXY_API_KEY` | Auth key for Medidata proxy |
| `MEDIDATA_SENDER_GLN` | Clinic's GLN for Medidata submissions |

---

## 3. Database Schema (Payment Tables)

### `invoices`
Core invoice table. Key payment fields:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `patient_id` | uuid | FK → patients |
| `invoice_number` | text | Human-readable (e.g. `INV-2026-001`) |
| `total_amount` | numeric | CHF |
| `paid_amount` | numeric | Actual amount received |
| `status` | text | `OPEN`, `PAID`, `PARTIAL_PAID`, `PARTIAL_LOSS`, `OVERPAID`, `CANCELLED` |
| `payment_method` | text | `Cash`, `Online Payment`, `Bank Transfer`, `Card`, etc. |
| `payment_link_token` | text | Unique token for magic-link payment page |
| `payment_link_expires_at` | timestamptz | Token expiry |
| `payrexx_gateway_id` | int | Payrexx gateway ID |
| `payrexx_gateway_hash` | text | Payrexx gateway hash |
| `payrexx_payment_link` | text | Full Payrexx checkout URL |
| `payrexx_transaction_id` | text | Transaction ID from webhook |
| `payrexx_transaction_uuid` | text | Transaction UUID from webhook |
| `payrexx_payment_status` | text | Payrexx status string (e.g. `waiting`, `confirmed`) |
| `payrexx_paid_at` | timestamptz | When Payrexx confirmed payment |
| `paid_at` | timestamptz | When invoice was marked paid |
| `paid_by_user_id` | uuid | Staff who marked it paid (manual) |
| `pdf_path` | text | Path in `invoice-pdfs` Supabase storage bucket |
| `health_insurance_law` | text | `KVG`, `UVG`, `IVG`, `MVG`, `VVG`, `PRIVATE` |
| `insurer_id` | uuid | FK → insurers |
| `insurance_payment_status` | text | Insurance-side payment status |
| `insurance_paid_amount` | numeric | Amount paid by insurer |
| `provider_id` | uuid | FK → providers (billing entity) |
| `doctor_user_id` | uuid | FK → providers (treating doctor) |

### `invoice_line_items`
Line items per invoice. Key fields: `code`, `name`, `quantity`, `unit_price`, `total_price`, `vat_rate`, `tardoc_code`, `tp_al`, `tp_tl` (Swiss tariff points).

### `invoice_payments`
Individual payment records (supports partial payments):

| Column | Notes |
|---|---|
| `invoice_id` | FK → invoices |
| `amount` | Payment amount |
| `payment_method` | Method used |
| `payment_date` | Date of payment |
| `payrexx_transaction_id` | If paid via Payrexx |
| `insurance_response_code` | If paid by insurer |

### `invoice_installments`
Installment plan table. Key fields: `invoice_id`, `installment_number`, `amount`, `status`, `payrexx_gateway_id`, `payrexx_payment_link`, `payrexx_payment_status`, `paid_at`.

### `bank_payment_imports` / `bank_payment_import_items`
Records of camt.054 XML bank statement imports and their per-transaction match results.

### `providers`
Billing entities (doctors, clinics). Key payment fields: `gln`, `zsr`, `iban`, `vat_enabled`, `vat_rate`, `billing_type` (`medical`/`aesthetic`), `invoice_method` (`tardoc_insurer`/`direct_patient`).

### `clinics` / `bank_accounts`
Clinic entities and their bank accounts (IBAN). `bank_accounts.iban` is used in Swiss QR-bill generation.

---

## 4. Payment Flow — End-to-End

### 4.1 Invoice Creation (Internal Staff)

1. Staff creates invoice in **Financials page** (`src/app/financials/page.tsx`) or from a patient's consultation record.
2. Invoice is saved to `invoices` table with `status = OPEN`.
3. Staff selects `payment_method`: Cash, Online Payment, Bank Transfer, Card, etc.

### 4.2 PDF Generation

**Route**: `POST /api/invoices/generate-pdf`  
**File**: `src/app/api/invoices/generate-pdf/route.ts`

Steps:
1. Fetches invoice + line items + patient + provider from Supabase.
2. Detects invoice type:
   - **Insurance (Tiers Payant/Garant)**: generates Sumex XML via `src/lib/sumexInvoice.ts` and a specialized PDF via `src/lib/generateTiersPayantPdf.ts`.
   - **Private/Direct**: generates a standard PDF with Swiss QR-bill embedded.
3. Swiss QR-bill is generated via `src/lib/swissQrBill.ts` using the provider's IBAN.
4. PDF is uploaded to Supabase Storage bucket `invoice-pdfs`.
5. `invoices.pdf_path` is updated.
6. If `payment_method` is `Online Payment` or `Cash`/`Card`, a Payrexx gateway is automatically created (calls `createPayrexxGateway`).

### 4.3 Payrexx Gateway Creation

**Route**: `POST /api/payments/create-payrexx-gateway`  
**File**: `src/app/api/payments/create-payrexx-gateway/route.ts`  
**Library**: `src/lib/payrexx.ts`

Steps:
1. Validates invoice exists and payment method is eligible (cash/online/card).
2. Fetches patient contact info.
3. Calls Payrexx REST API `POST /Gateway/` with:
   - `amount` in cents (CHF × 100)
   - `currency: "CHF"`
   - `referenceId`: invoice number (used to match webhook)
   - Redirect URLs: `/invoice/payment-success`, `/invoice/payment-failed`, `/invoice/payment-cancelled`
   - Pre-filled contact fields (name, email, phone, address)
4. Stores `payrexx_gateway_id`, `payrexx_gateway_hash`, `payrexx_payment_link` on the invoice.
5. Sets `payrexx_payment_status = "waiting"`.
6. Generates a QR code of the payment link (returned to caller).

**Payrexx API Auth**: `X-API-KEY: <PAYREXX_API_SECRET>` header + `?instance=aesthetics-ge` query param.

### 4.4 Installment Gateway Creation

**Route**: `POST /api/payments/create-installment-gateway`  
**File**: `src/app/api/payments/create-installment-gateway/route.ts`

Same as above but for `invoice_installments`. Uses `referenceId = "{invoice_number}-INST{n}"` to distinguish from full-invoice payments in the webhook.

### 4.5 Patient-Facing Payment Page (Magic Link)

**URL**: `/invoice/pay/[token]`  
**File**: `src/app/invoice/pay/[token]/page.tsx`

Flow:
1. Patient receives a link with a unique `payment_link_token`.
2. Page calls `GET /api/invoices/get-by-token?token=...` (public, no auth).
3. API validates token and expiry, returns invoice + patient data.
4. Page shows invoice details and payment options:
   - **Pay Online with Card** → redirects to `payrexx_payment_link` (Payrexx hosted checkout).
   - **Pay by Bank Transfer** → shows bank details (PostFinance IBAN: `CH09 3078 8000 0502 4928 9`).
5. If invoice is already `PAID`/`OVERPAID`, shows a "Already Paid" screen.

**Alternative public endpoint**: `GET /api/invoices/public/[token]` — same logic, also returns a signed PDF URL.

### 4.6 Payrexx Webhook (Payment Confirmation)

**Route**: `POST /api/payments/payrexx-webhook`  
**File**: `src/app/api/payments/payrexx-webhook/route.ts`

This is the critical path that marks invoices as paid.

Steps:
1. Accepts `application/json` or `application/x-www-form-urlencoded` (Payrexx sends both).
2. Extracts `transaction` object from payload.
3. Reads `referenceId` from `transaction.referenceId` or `transaction.invoice.referenceId`.
4. **Installment check**: if `referenceId` matches `{invoice_number}-INST{n}`:
   - Updates `invoice_installments` row with transaction ID and status.
   - Recalculates invoice-level `paid_amount` and `status` from all installments.
5. **Full invoice**: looks up `invoices` by `invoice_number = referenceId`.
6. If `transaction.status === "confirmed"` (`isTransactionPaid()`):
   - Compares `transaction.invoice.amount / 100` vs `invoice.total_amount`.
   - If transaction amount < invoice total (fees deducted): sets `status = "PARTIAL_LOSS"`.
   - Otherwise: sets `status = "PAID"`, `paid_amount = total_amount`.
   - Sets `paid_at`, `payrexx_paid_at`, `payrexx_transaction_id`, `payrexx_transaction_uuid`.
7. Always returns HTTP 200 (to prevent Payrexx retries).

### 4.7 Payment Status Check (Polling)

**Route**: `POST /api/payments/check-payrexx-status`  
**File**: `src/app/api/payments/check-payrexx-status/route.ts`

Used when the webhook may have been missed. Calls `GET /Gateway/{id}/` on Payrexx API and updates invoice if `status === "confirmed"`. Also detects partial loss.

### 4.8 Manual Payment Sync

**Route**: `POST /api/payments/sync-payment-status`  
**File**: `src/app/api/payments/sync-payment-status/route.ts`

Admin utility to manually mark an invoice as paid by `consultationCode` (invoice number). Sets `status = "PAID"`, `paid_amount`, `paid_at`.

### 4.9 Bank Transfer Reconciliation (camt.054)

**Route**: `POST /api/bank-payments/process-xml`  
**File**: `src/app/api/bank-payments/process-xml/route.ts`

For reconciling PostFinance bank statements:
1. Accepts camt.054 XML content.
2. Parses all `<Ntry>` (entry) blocks, extracts: booking date, amount, currency, reference number, debtor name/IBAN.
3. Filters to CREDIT transactions only.
4. For each transaction, calls `matchTransaction()`:
   - Matches by Swiss QR reference number → looks up invoice.
   - Determines match status: `matched`, `unmatched`, `overpaid`, `underpaid`, `already_paid`, `duplicate`, `error`.
   - Updates invoice `paid_amount` and `status` accordingly.
5. Saves import record to `bank_payment_imports` and per-transaction results to `bank_payment_import_items`.

### 4.10 Payment Result Pages

| Page | File | Trigger |
|---|---|---|
| `/invoice/payment-success` | `src/app/invoice/payment-success/page.tsx` | Payrexx `successRedirectUrl` |
| `/invoice/payment-cancelled` | `src/app/invoice/payment-cancelled/page.tsx` | Payrexx `cancelRedirectUrl` |
| `/invoice/payment-failed` | `src/app/invoice/payment-failed/page.tsx` | Payrexx `failedRedirectUrl` |

All pages show the `referenceId` query param (invoice number) passed back by Payrexx.

---

## 5. Insurance Billing Flow (Medidata / Sumex)

Separate from direct patient payments. Used for KVG/UVG/IVG/MVG/VVG invoices.

**Key files**:
- `src/lib/sumexInvoice.ts` — builds Sumex XML invoice request (GeneralInvoiceRequest 4.5)
- `src/lib/sumexAcf.ts` — ACF (Ambulatory Care Facility) XML generation
- `src/lib/sumexTardoc.ts` — TARDOC tariff code handling
- `src/lib/medidata.ts` — Medidata API client
- `src/lib/medidataClient.ts` — HTTP client for Medidata proxy
- `src/lib/medidataProxy.ts` — Proxy layer
- `src/app/api/medidata/` — API routes for Medidata operations
- `src/app/api/sumex/` — API routes for Sumex XML generation
- `src/components/InsuranceBillingModal.tsx` — UI for submitting insurance invoices

**Flow**:
1. Invoice created with `health_insurance_law` set (e.g. `KVG`).
2. Staff opens InsuranceBillingModal, selects insurer.
3. Sumex XML is generated and submitted to Medidata.
4. `medidata_submission_id` stored on invoice.
5. Insurance response tracked via `insurance_payment_status`, `insurance_paid_amount`, `insurance_paid_date`.

---

## 6. Swiss QR-Bill

**File**: `src/lib/swissQrBill.ts`

Implements Swiss Payment Standards (SPS) QR-bill v2.2. Used in PDF invoices for bank transfer payments.

Key functions:
- `encodeSwissQrBill(data)` — encodes QR content string per SPS spec
- `generateSwissQrBillDataUrl(data)` — returns base64 PNG data URL
- `generateSwissReference(invoiceId)` — converts invoice ID to 27-digit QR reference
- `formatSwissReferenceWithSpaces(ref)` — formats reference for display

Bank details hardcoded in payment page:
- **IBAN**: `CH09 3078 8000 0502 4928 9` (PostFinance)
- **Reference**: `00 00000 00000 00000 05870 40016`

---

## 7. Payrexx Library Reference

**File**: `src/lib/payrexx.ts`

| Export | Purpose |
|---|---|
| `createPayrexxGateway(params)` | Creates a hosted payment page, returns `{id, hash, link}` |
| `getPayrexxGateway(id)` | Fetches gateway status from Payrexx |
| `deletePayrexxGateway(id)` | Deletes a gateway |
| `verifyWebhookSignature(payload, sig)` | HMAC-SHA256 signature verification |
| `isTransactionPaid(status)` | Returns `true` only for `"confirmed"` status |
| `generatePaymentQRCode(url)` | Generates QR code PNG data URL for a payment link |

**Payrexx transaction statuses**: `waiting`, `confirmed`, `authorized`, `reserved`, `refunded`, `partially-refunded`, `cancelled`, `declined`, `error`, `uncaptured`

**Amount format**: Payrexx expects amount in **cents** (CHF 100.00 → `10000`). Webhook returns amount in cents too.

---

## 8. Invoice Status State Machine

```
OPEN
 ├─→ PAID          (full payment received: Payrexx webhook, bank XML, or manual)
 ├─→ PARTIAL_PAID  (partial payment received)
 ├─→ PARTIAL_LOSS  (Payrexx deducted fees; amount received < invoice total)
 ├─→ OVERPAID      (amount received > invoice total)
 └─→ CANCELLED     (invoice voided)
```

---

## 9. API Routes Summary

| Route | Method | Auth | Purpose |
|---|---|---|---|
| `/api/payments/create-payrexx-gateway` | POST | Admin | Create Payrexx gateway for invoice |
| `/api/payments/create-installment-gateway` | POST | Admin | Create Payrexx gateway for installment |
| `/api/payments/payrexx-webhook` | POST | None (public) | Receive Payrexx payment notifications |
| `/api/payments/check-payrexx-status` | POST | Admin | Poll Payrexx for payment status |
| `/api/payments/sync-payment-status` | POST | Admin | Manually mark invoice as paid |
| `/api/invoices/generate-pdf` | POST | Admin | Generate invoice PDF + optionally create Payrexx gateway |
| `/api/invoices/get-by-token` | GET | None (public) | Fetch invoice by magic-link token |
| `/api/invoices/public/[token]` | GET | None (public) | Fetch invoice + PDF URL by token |
| `/api/invoices/backfill-references` | POST | Admin | Backfill invoice reference numbers |
| `/api/bank-payments/process-xml` | POST | Admin | Process camt.054 bank statement XML |

---

## 10. Supabase Clients

| Client | File | Usage |
|---|---|---|
| `supabaseAdmin` | `src/lib/supabaseAdmin.ts` | Server-side, service role key, bypasses RLS |
| `supabaseClient` | `src/lib/supabaseClient.ts` | Client-side, anon key, respects RLS |

---

## 11. Key Migrations (Payment-Related)

| File | What it does |
|---|---|
| `20241215_invoice_payment_system.sql` | Adds `payment_link_token`, `payment_link_expires_at`, `invoice_pdf_path` to consultations; creates `invoice-pdfs` storage bucket; adds `generate_payment_link_token()` function |
| `20260210_invoice_partial_payment.sql` | Adds `invoice_status` and `invoice_paid_amount` to consultations for partial payment tracking |
| `scripts/setup-billing-entities-v2.sql` | Creates `clinics` and `bank_accounts` tables; extends `providers` with `billing_type`, `invoice_method`, `vat_enabled`, `vat_rate`, `bank_account_id` |
| `scripts/import-invoices.sql` | Bulk import of historical invoices |

---

## 12. Financials Dashboard

**File**: `src/app/financials/page.tsx`

Displays all invoices with:
- Filters by date, status, doctor, provider
- Summary totals: total amount, paid, unpaid, complimentary
- Per-patient and per-doctor breakdowns
- Actions: generate PDF, create payment link, mark as paid, view details

Uses `supabaseClient` (anon key) with RLS for authenticated staff access.

---

## 13. Notable Design Decisions

1. **Payrexx as sole online payment processor** — no Stripe despite early migration SQL referencing `stripe_payment_intent_id`.
2. **Magic links are stateless** — the `payment_link_token` on the invoice IS the auth; no session needed for the patient payment page.
3. **Webhook is idempotent** — if invoice is already `PAID` or `PARTIAL_LOSS`, the webhook skips re-processing.
4. **Partial loss detection** — when Payrexx deducts platform fees, the received amount is less than the invoice total. The system detects this and sets `PARTIAL_LOSS` instead of `PAID`.
5. **Installment reference format** — `{invoice_number}-INST{n}` allows the single webhook endpoint to handle both full and installment payments.
6. **Bank XML reconciliation** — uses Swiss QR reference numbers embedded in camt.054 XML to auto-match bank transfers to invoices.
7. **Insurance vs. private billing** — completely separate flows. Insurance invoices go through Medidata/Sumex XML; private invoices use Payrexx or bank transfer.
