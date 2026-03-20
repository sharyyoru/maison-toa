# Invoice Payment System - Setup Checklist

Use this checklist to ensure complete setup of the invoice payment system.

## ☐ Prerequisites

- [ ] Node.js and npm installed
- [ ] Supabase project created and configured
- [ ] Stripe account created (for online payments)
- [ ] Access to Supabase SQL Editor
- [ ] Access to project `.env.local` file

## ☐ Step 1: Install Dependencies

```bash
npm install qrcode jspdf @types/qrcode
```

**Verification**: Check that these packages appear in `package.json`

## ☐ Step 2: Database Setup

### Option A: Run Complete SQL Script (Recommended)
1. [ ] Open Supabase SQL Editor
2. [ ] Copy contents of `SUPABASE_INVOICE_SETUP_COMPLETE.sql`
3. [ ] Paste and execute in SQL Editor
4. [ ] Verify no errors in output

### Option B: Run Individual SQL File
1. [ ] Open Supabase SQL Editor
2. [ ] Copy contents of `20241215_invoice_payment_system.sql`
3. [ ] Paste and execute in SQL Editor
4. [ ] Verify no errors in output

**Verification Queries** (run these to confirm):
```sql
-- Should return 5 rows
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'consultations' 
AND column_name IN ('payment_link_token', 'payment_link_expires_at', 
                    'invoice_pdf_path', 'stripe_payment_intent_id', 
                    'payment_completed_at');

-- Should return 1 row
SELECT * FROM storage.buckets WHERE id = 'invoice-pdfs';

-- Should return a random token
SELECT generate_payment_link_token();
```

## ☐ Step 3: Configure Stripe

### Get API Keys
1. [ ] Go to https://dashboard.stripe.com/apikeys
2. [ ] Copy "Secret key" (starts with `sk_test_`)
3. [ ] Copy "Publishable key" (starts with `pk_test_`)

### Set Up Webhook
1. [ ] Go to https://dashboard.stripe.com/webhooks
2. [ ] Click "Add endpoint"
3. [ ] Enter URL: `https://your-domain.com/api/payments/stripe-webhook`
   - For local testing: Use ngrok or similar to expose localhost
4. [ ] Select event: `checkout.session.completed`
5. [ ] Click "Add endpoint"
6. [ ] Copy "Signing secret" (starts with `whsec_`)

## ☐ Step 4: Environment Variables

1. [ ] Open `.env.local` file (create if doesn't exist)
2. [ ] Add the following variables:

```env
STRIPE_SECRET_KEY=sk_test_your_actual_key_here
STRIPE_PUBLISHABLE_KEY=pk_test_your_actual_key_here
STRIPE_WEBHOOK_SECRET=whsec_your_actual_secret_here
NEXT_PUBLIC_APP_URL=https://your-actual-domain.com
```

3. [ ] Replace placeholder values with actual keys from Stripe
4. [ ] Set correct domain for `NEXT_PUBLIC_APP_URL`
   - Production: `https://your-domain.com`
   - Local dev: `http://localhost:3000`

**Verification**: Restart development server and check no env errors

## ☐ Step 5: Verify File Structure

Confirm these files exist:

**API Routes:**
- [ ] `src/app/api/invoices/generate-pdf/route.ts`
- [ ] `src/app/api/payments/create-stripe-intent/route.ts`
- [ ] `src/app/api/payments/stripe-webhook/route.ts`

**Payment Page:**
- [ ] `src/app/invoice/pay/[token]/page.tsx`

**Documentation:**
- [ ] `INVOICE_PAYMENT_SETUP.md`
- [ ] `INVOICE_SYSTEM_SUMMARY.md`
- [ ] `SUPABASE_INVOICE_SETUP_COMPLETE.sql`
- [ ] `.env.example.invoice`

**Modified Files:**
- [ ] `src/app/patients/[id]/MedicalConsultationsCard.tsx` (has Generate PDF button)

## ☐ Step 6: Test Invoice Generation

1. [ ] Start development server: `npm run dev`
2. [ ] Navigate to a patient page
3. [ ] Create a new invoice consultation OR find existing invoice
4. [ ] Click "Generate PDF" button
5. [ ] Verify:
   - [ ] PDF opens in new tab
   - [ ] Payment link copied to clipboard
   - [ ] No errors in browser console
   - [ ] PDF contains QR code in red box area

## ☐ Step 7: Test Magic Link Access

1. [ ] Copy payment link from previous step
2. [ ] Open incognito/private browser window
3. [ ] Paste payment link and navigate
4. [ ] Verify:
   - [ ] Page loads without login
   - [ ] Patient details are pre-filled
   - [ ] Invoice details display correctly
   - [ ] Both payment options are visible
   - [ ] Download PDF button works

## ☐ Step 8: Test Stripe Payment (Test Mode)

1. [ ] On payment page, click "Pay Online with Card (Stripe)"
2. [ ] Should redirect to Stripe checkout
3. [ ] Use test card: `4242 4242 4242 4242`
   - Expiry: Any future date
   - CVC: Any 3 digits
   - ZIP: Any 5 digits
4. [ ] Complete payment
5. [ ] Verify:
   - [ ] Redirected back to payment page
   - [ ] Success message displayed
   - [ ] Invoice marked as paid in database

**Database Check:**
```sql
SELECT id, consultation_id, invoice_is_paid, payment_completed_at 
FROM consultations 
WHERE record_type = 'invoice' 
ORDER BY created_at DESC 
LIMIT 5;
```

## ☐ Step 9: Test Bank Transfer Display

1. [ ] On payment page, click "Pay by Bank Transfer"
2. [ ] Verify displayed information:
   - [ ] Account Holder: Aesthetics Clinic XT SA
   - [ ] IBAN: CH09 3078 8000 0502 4628 9
   - [ ] Reference Number: 00 00000 00000 00000 05870 40016
   - [ ] Amount in CHF
3. [ ] Verify "Choose Different Payment Method" button works

## ☐ Step 10: Test QR Code

1. [ ] Open generated PDF invoice
2. [ ] Locate QR code in red box area (payment section)
3. [ ] Scan with mobile device
4. [ ] Verify:
   - [ ] Redirects to payment page
   - [ ] Page loads correctly on mobile
   - [ ] All information displays properly

## ☐ Step 11: Verify Security

1. [ ] Test expired link:
   - Manually set `payment_link_expires_at` to past date in database
   - Try accessing payment link
   - Should show "link has expired" error

2. [ ] Test invalid token:
   - Try accessing `/invoice/pay/invalid-token-123`
   - Should show error message

3. [ ] Verify RLS policies:
   ```sql
   -- Should return multiple policies
   SELECT policyname FROM pg_policies WHERE tablename = 'consultations';
   ```

## ☐ Step 12: Production Deployment

Before going live:

1. [ ] Switch Stripe to live mode keys
   - Get live keys from Stripe dashboard
   - Update `.env.local` with live keys
   - Update webhook URL to production domain

2. [ ] Update `NEXT_PUBLIC_APP_URL` to production domain

3. [ ] Verify bank details are correct in payment page:
   - [ ] IBAN
   - [ ] Reference number
   - [ ] Account holder name

4. [ ] Test complete flow in production environment

5. [ ] Monitor Stripe dashboard for real payments

## 🎉 Setup Complete!

Once all items are checked, your invoice payment system is ready to use.

## 📞 Need Help?

Refer to these documents:
- **Detailed Setup**: `INVOICE_PAYMENT_SETUP.md`
- **System Overview**: `INVOICE_SYSTEM_SUMMARY.md`
- **SQL Commands**: `SUPABASE_INVOICE_SETUP_COMPLETE.sql`

## 🔧 Common Issues

### "Bucket not found" error
- Run: `INSERT INTO storage.buckets (id, name, public) VALUES ('invoice-pdfs', 'invoice-pdfs', true);`

### "Function does not exist" error
- Run the token generation function from SQL script

### Stripe webhook not working
- Verify webhook secret matches in `.env.local`
- Check webhook URL is correct
- Ensure endpoint is listening to `checkout.session.completed`

### Payment link shows "expired"
- Check `payment_link_expires_at` in database
- Regenerate PDF to create new link

### PDF generation fails
- Check browser console for errors
- Verify all dependencies installed
- Check Supabase storage permissions
