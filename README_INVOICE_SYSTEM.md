# 🧾 Invoice Payment System - Complete Implementation

## 📋 Quick Start

Your invoice payment system is now fully implemented! Here's what you need to do:

### 1️⃣ Run the SQL Setup (5 minutes)
Open Supabase SQL Editor and run:
```
SUPABASE_INVOICE_SETUP_COMPLETE.sql
```

### 2️⃣ Add Environment Variables (2 minutes)
Add to `.env.local`:
```env
STRIPE_SECRET_KEY=sk_test_your_key
STRIPE_PUBLISHABLE_KEY=pk_test_your_key  
STRIPE_WEBHOOK_SECRET=whsec_your_secret
NEXT_PUBLIC_APP_URL=https://your-domain.com
```

### 3️⃣ Test It Out (5 minutes)
1. Go to any patient page
2. Find or create an invoice
3. Click "Generate PDF" button
4. PDF opens with QR code - payment link copied!

## ✨ What You Get

### For Staff
- **One-Click PDF Generation**: Generate professional invoices with QR codes
- **Automatic Payment Links**: Secure magic links created automatically
- **Payment Tracking**: See payment status in real-time
- **Multiple Payment Methods**: Stripe and bank transfer options

### For Patients
- **No Login Required**: Access invoices via QR code or link
- **Pre-filled Information**: All patient data automatically populated
- **Easy Payment**: Choose online card payment or bank transfer
- **Download Invoice**: PDF available anytime

## 📁 Key Files

### SQL Setup
- **`SUPABASE_INVOICE_SETUP_COMPLETE.sql`** ⭐ Run this first!
  - Creates all database columns
  - Sets up storage bucket
  - Configures security policies

### Documentation
- **`INVOICE_SETUP_CHECKLIST.md`** - Step-by-step setup guide
- **`INVOICE_PAYMENT_SETUP.md`** - Detailed documentation
- **`INVOICE_SYSTEM_SUMMARY.md`** - Technical overview
- **`.env.example.invoice`** - Environment variable template

### Code Files (Already Created)
- `src/app/api/invoices/generate-pdf/route.ts` - PDF generation
- `src/app/api/payments/create-stripe-intent/route.ts` - Stripe payments
- `src/app/api/payments/stripe-webhook/route.ts` - Payment confirmations
- `src/app/invoice/pay/[token]/page.tsx` - Payment page
- `src/app/patients/[id]/MedicalConsultationsCard.tsx` - Updated with button

## 🎯 How It Works

```
1. Staff clicks "Generate PDF" on invoice
   ↓
2. System creates:
   - Professional PDF invoice
   - Unique payment link (expires in 90 days)
   - QR code linking to payment page
   ↓
3. Patient scans QR code or clicks link
   ↓
4. Payment page loads (no login needed)
   - Shows invoice details
   - Pre-filled patient information
   - Two payment options
   ↓
5. Patient chooses payment method:
   
   Option A: Online Payment (Stripe)
   - Redirects to secure Stripe checkout
   - Pays with credit/debit card
   - Automatically marked as paid
   
   Option B: Bank Transfer
   - Shows bank details and reference
   - Patient makes manual transfer
   - Staff marks as paid when confirmed
```

## 🔐 Security Features

✅ **Magic Links**: Expire after 90 days  
✅ **Row Level Security**: Database-level protection  
✅ **Secure Tokens**: Cryptographically random  
✅ **Stripe Verification**: Webhook signature checking  
✅ **Public PDFs**: Unguessable paths only  

## 💳 Bank Details Displayed

The system shows these bank details for transfers:
- **Account**: Aesthetics Clinic XT SA
- **IBAN**: CH09 3078 8000 0502 4628 9
- **Bank**: PostFinance
- **Reference**: 00 00000 00000 00000 05870 40016

⚠️ **Important**: Update these in `src/app/invoice/pay/[token]/page.tsx` if different!

## 🧪 Testing Checklist

### Test PDF Generation
- [ ] Click "Generate PDF" on invoice
- [ ] PDF opens with clinic header
- [ ] QR code visible in red box area
- [ ] Payment link copied to clipboard

### Test Magic Link
- [ ] Open payment link in incognito browser
- [ ] Page loads without login
- [ ] Patient details pre-filled
- [ ] Invoice details correct

### Test Stripe Payment
- [ ] Click "Pay Online with Card"
- [ ] Use test card: 4242 4242 4242 4242
- [ ] Payment completes successfully
- [ ] Invoice marked as paid

### Test Bank Transfer
- [ ] Click "Pay by Bank Transfer"
- [ ] Bank details display correctly
- [ ] Reference number shown
- [ ] Can switch back to card payment

## 🚀 Deployment Steps

### For Production

1. **Get Stripe Live Keys**
   - Switch to live mode in Stripe dashboard
   - Copy live API keys
   - Update `.env.local`

2. **Update Webhook**
   - Create webhook for production domain
   - Use URL: `https://your-domain.com/api/payments/stripe-webhook`
   - Copy new webhook secret

3. **Set Production URL**
   ```env
   NEXT_PUBLIC_APP_URL=https://your-actual-domain.com
   ```

4. **Verify Bank Details**
   - Confirm IBAN is correct
   - Verify reference number
   - Test bank transfer instructions

## 📊 Database Schema

New columns added to `consultations` table:

| Column | Type | Purpose |
|--------|------|---------|
| `payment_link_token` | TEXT | Unique secure token for magic link |
| `payment_link_expires_at` | TIMESTAMPTZ | Link expiration date |
| `invoice_pdf_path` | TEXT | Storage path for PDF |
| `stripe_payment_intent_id` | TEXT | Stripe payment tracking |
| `payment_completed_at` | TIMESTAMPTZ | Payment timestamp |

New storage bucket: `invoice-pdfs` (public access)

## 🛠️ Customization

### Change Link Expiration
Edit `src/app/api/invoices/generate-pdf/route.ts`:
```typescript
expiresAt.setDate(expiresAt.getDate() + 90); // Change 90 to desired days
```

### Update Bank Details
Edit `src/app/invoice/pay/[token]/page.tsx`:
```typescript
IBAN: CH09 3078 8000 0502 4628 9
Reference: 00 00000 00000 00000 05870 40016
```

### Modify PDF Layout
Edit `src/app/api/invoices/generate-pdf/route.ts`:
- Adjust header information
- Change QR code size/position
- Update invoice format

## 🐛 Troubleshooting

### PDF Generation Fails
```sql
-- Check bucket exists
SELECT * FROM storage.buckets WHERE id = 'invoice-pdfs';

-- If missing, create it
INSERT INTO storage.buckets (id, name, public) 
VALUES ('invoice-pdfs', 'invoice-pdfs', true);
```

### Payment Link Invalid
- Check token hasn't expired in database
- Verify `NEXT_PUBLIC_APP_URL` is correct
- Ensure RLS policies are active

### Stripe Not Working
- Verify API keys in `.env.local`
- Check webhook secret matches
- Review Stripe dashboard logs

## 📞 Support Documents

- **Setup Guide**: `INVOICE_PAYMENT_SETUP.md`
- **Checklist**: `INVOICE_SETUP_CHECKLIST.md`
- **Technical Details**: `INVOICE_SYSTEM_SUMMARY.md`
- **SQL Script**: `SUPABASE_INVOICE_SETUP_COMPLETE.sql`

## 🎉 You're All Set!

The invoice payment system is fully implemented and ready to use. Just:
1. Run the SQL setup
2. Add environment variables
3. Start generating invoices!

For detailed setup instructions, see `INVOICE_SETUP_CHECKLIST.md`.
