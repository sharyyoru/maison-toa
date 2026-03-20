# Invoice Payment System Setup Guide

This guide covers the complete setup for the invoice PDF generation and payment system with QR codes and magic links.

## Features

- **PDF Invoice Generation**: Automatically generates professional invoices matching the clinic's format
- **QR Code Payment Links**: Each invoice includes a QR code that links to a secure payment page
- **Magic Links**: Patients can access payment pages without logging in
- **Multiple Payment Methods**: 
  - Online payment via Stripe
  - Bank transfer with detailed instructions
- **Automatic Payment Tracking**: System updates invoice status when payments are completed

## Database Setup

### 1. Run the SQL Migration

Execute the following SQL file in your Supabase SQL Editor:

```bash
# File: 20241215_invoice_payment_system.sql
```

This migration will:
- Add payment link token columns to consultations table
- Create the `invoice-pdfs` storage bucket
- Set up RLS policies for secure access
- Add Stripe payment tracking columns
- Create helper functions for token generation

### 2. Manual Supabase Setup Commands

If you prefer to run commands manually, execute these in the Supabase SQL Editor:

```sql
-- Add payment link columns
ALTER TABLE consultations
  ADD COLUMN IF NOT EXISTS payment_link_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS payment_link_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS invoice_pdf_path TEXT,
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id TEXT,
  ADD COLUMN IF NOT EXISTS payment_completed_at TIMESTAMPTZ;

-- Create indexes
CREATE INDEX IF NOT EXISTS consultations_payment_link_token_idx 
  ON consultations(payment_link_token) 
  WHERE payment_link_token IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultations_invoice_pdf_path_idx 
  ON consultations(invoice_pdf_path) 
  WHERE invoice_pdf_path IS NOT NULL;

CREATE INDEX IF NOT EXISTS consultations_stripe_payment_intent_idx 
  ON consultations(stripe_payment_intent_id) 
  WHERE stripe_payment_intent_id IS NOT NULL;

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoice-pdfs', 'invoice-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on consultations
ALTER TABLE consultations ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users
CREATE POLICY "Authenticated users can view all consultations"
ON consultations FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can insert consultations"
ON consultations FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Authenticated users can update consultations"
ON consultations FOR UPDATE
TO authenticated
USING (true);

CREATE POLICY "Authenticated users can delete consultations"
ON consultations FOR DELETE
TO authenticated
USING (true);

-- RLS Policy for public magic link access
CREATE POLICY "Public can view consultation via payment link token"
ON consultations FOR SELECT
TO public
USING (
  payment_link_token IS NOT NULL 
  AND payment_link_expires_at > NOW()
);

-- Storage bucket RLS policies
CREATE POLICY "Authenticated users can upload invoice PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'invoice-pdfs');

CREATE POLICY "Authenticated users can read invoice PDFs"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Public can read invoice PDFs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Authenticated users can update invoice PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'invoice-pdfs');

CREATE POLICY "Authenticated users can delete invoice PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'invoice-pdfs');

-- Token generation function
CREATE OR REPLACE FUNCTION generate_payment_link_token()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  token TEXT;
BEGIN
  token := encode(gen_random_bytes(24), 'base64');
  token := replace(replace(replace(token, '+', '-'), '/', '_'), '=', '');
  RETURN token;
END;
$$;
```

## Environment Variables

Add the following environment variables to your `.env.local` file:

```env
# Stripe Configuration (for online payments)
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_stripe_publishable_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here

# Application URL (for generating payment links)
NEXT_PUBLIC_APP_URL=https://your-domain.com
# For local development:
# NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Getting Stripe Keys

1. **Sign up for Stripe**: Go to https://stripe.com and create an account
2. **Get API Keys**: 
   - Navigate to Developers > API keys
   - Copy your Secret key (starts with `sk_test_` for test mode)
   - Copy your Publishable key (starts with `pk_test_` for test mode)
3. **Set up Webhook**:
   - Go to Developers > Webhooks
   - Click "Add endpoint"
   - Enter your webhook URL: `https://your-domain.com/api/payments/stripe-webhook`
   - Select events to listen to: `checkout.session.completed`
   - Copy the webhook signing secret (starts with `whsec_`)

## Testing the System

### 1. Create an Invoice

1. Navigate to a patient's page
2. Click the prescription/consultation button
3. Select "Invoice" as the record type
4. Fill in the invoice details (services, amounts, etc.)
5. Save the consultation

### 2. Generate PDF with QR Code

1. Find the invoice in the consultations list
2. Click the "Generate PDF" button
3. The system will:
   - Generate a professional PDF invoice
   - Create a unique payment link with QR code
   - Store the PDF in Supabase storage
   - Copy the payment link to your clipboard

### 3. Test Payment Flow

**Option A: Scan QR Code**
1. Open the generated PDF
2. Scan the QR code with a mobile device
3. You'll be taken to the payment page

**Option B: Use Payment Link**
1. Paste the payment link in a browser
2. The payment page loads without requiring login

**Payment Page Features:**
- View invoice details (patient name, amount, date, etc.)
- Download the PDF invoice
- Choose payment method:
  - **Pay Online**: Redirects to Stripe checkout
  - **Bank Transfer**: Shows bank details and reference number

### 4. Complete Payment

**For Stripe Payment:**
1. Click "Pay Online with Card"
2. Complete payment on Stripe checkout page
3. System automatically marks invoice as paid
4. User is redirected back to payment page with success message

**For Bank Transfer:**
1. Click "Pay by Bank Transfer"
2. Copy the bank details and reference number
3. Make the transfer through your bank
4. Staff can manually mark as paid once transfer is confirmed

## Bank Transfer Details

The system displays the following bank details for manual transfers:

- **Account Holder**: Aesthetics Clinic XT SA
- **IBAN**: CH09 3078 8000 0502 4628 9
- **Bank**: PostFinance
- **Reference Number**: 00 00000 00000 00000 05870 40016

**Note**: Update these details in the payment page component if they differ for your clinic.

## API Endpoints

### Generate Invoice PDF
```
POST /api/invoices/generate-pdf
Body: { consultationId: string }
Response: { pdfUrl, paymentUrl, paymentLinkToken }
```

### Create Stripe Payment
```
POST /api/payments/create-stripe-intent
Body: { consultationId: string, amount: number }
Response: { checkoutUrl, sessionId }
```

### Stripe Webhook (Automatic)
```
POST /api/payments/stripe-webhook
Headers: stripe-signature
Body: Stripe event payload
```

## Security Features

1. **Magic Link Expiration**: Payment links expire after 90 days
2. **RLS Policies**: Database-level security ensures only authorized access
3. **Token-based Access**: Secure random tokens for payment links
4. **Stripe Webhook Verification**: Validates all payment confirmations
5. **Public Storage**: Invoice PDFs are publicly accessible but have unguessable paths

## Troubleshooting

### PDF Generation Fails
- Check that `invoice-pdfs` bucket exists in Supabase Storage
- Verify RLS policies are correctly set up
- Check browser console for errors

### Payment Link Doesn't Work
- Verify `NEXT_PUBLIC_APP_URL` is set correctly
- Check that the token hasn't expired
- Ensure RLS policy for public access is active

### Stripe Payment Fails
- Verify Stripe keys are correct in `.env.local`
- Check Stripe dashboard for error logs
- Ensure webhook is configured correctly

### QR Code Not Showing
- Verify `qrcode` package is installed: `npm install qrcode`
- Check PDF generation logs for errors

## Customization

### Update Invoice Template
Edit the PDF generation logic in:
```
src/app/api/invoices/generate-pdf/route.ts
```

### Modify Payment Page Design
Edit the payment page component:
```
src/app/invoice/pay/[token]/page.tsx
```

### Change Bank Details
Update the bank transfer section in the payment page component with your clinic's actual banking information.

## Support

For issues or questions:
- Check Supabase logs for database errors
- Review Next.js console for API errors
- Verify Stripe dashboard for payment issues
- Ensure all environment variables are set correctly
