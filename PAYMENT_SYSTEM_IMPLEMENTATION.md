# Payment System Implementation - Swiss QR-bill & Payrex Integration

## Overview
This document describes the implementation of Swiss Payment Standards (SPS) QR-bill for Bank Transfer invoices and Payrex payment gateway for Cash invoices, replacing Stripe.

## Implementation Date
January 17, 2026

## Changes Summary

### 1. Swiss QR-bill Implementation (ISO 20022 Standard)

**New File**: `src/lib/swissQrBill.ts`
- Implements Swiss Payment Standards QR-bill specification version 2.2 (compatible with 2.3)
- Follows ISO 20022 standards for structured payment data
- Generates QR codes with proper Swiss cross symbol format
- Supports QRR (QR Reference), SCOR (Creditor Reference), and NON reference types
- Implements Modulo 10 recursive algorithm for check digit calculation
- Validates Swiss/Liechtenstein IBAN formats

**Key Functions**:
- `generateSwissQrBillDataUrl()`: Generates Swiss-compliant QR code
- `generateSwissReference()`: Creates 27-digit QR reference with check digit
- `formatSwissReferenceWithSpaces()`: Formats reference for readability
- `encodeSwissQrBill()`: Encodes payment data to Swiss QR-bill format

**Swiss QR-bill Specifications**:
- IBAN: CH09 3078 8000 0502 4628 9
- Creditor: Aesthetics Clinic XT SA, Chemin Rieu 18, 1208 Genève
- Reference Type: QRR (QR Reference with check digit)
- Currency: CHF
- Error Correction Level: M (15%)
- QR Code Size: 300x300px

### 2. Payrex Integration for Cash Payments

**Updated Files**:
- `src/app/api/payments/create-payrexx-gateway/route.ts`
  - Now accepts both "Online Payment" and "Cash" payment methods
  - Generates Payrex payment gateway for both types
  - Returns Payrex QR code for payment link

- `src/app/patients/[id]/MedicalConsultationsCard.tsx`
  - Creates Payrex gateway automatically for Cash invoices
  - Triggers gateway creation on invoice save for Cash payments

### 3. PDF Generation Updates

**Updated File**: `src/app/api/invoices/generate-pdf/route.ts`

**Payment Method QR Code Logic**:

1. **Cash Invoices**: Uses Payrex payment link QR code
2. **Online Payment Invoices**: Uses Payrex payment link QR code
3. **Bank Transfer Invoices**: Uses Swiss QR-bill with QR Reference
4. **Insurance Invoices**: Uses internal fallback payment link

**QR Code Features**:
- Dynamic reference number generation based on invoice ID
- Proper Swiss reference formatting with spaces
- Embedded payment amount, creditor, and debtor information for Bank Transfer
- Payrex integration for instant payment processing (Cash & Online)

### 4. EBICS Integration Notes

**EBICS (Electronic Banking International Communication System)** is a protocol for bank communication. For future implementation:

**Resources Provided**:
- https://www.ebics.org/en/technical-information
- https://www.ebics.org/en/technical-information/implementation-guide
- SIX-Group ISO 20022 specifications: https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/iso-20022.html

**Implementation Status**: 
- Swiss QR-bill format (prerequisite) is now implemented
- EBICS protocol implementation deferred for future integration
- Current system supports manual bank reconciliation via QR-bill references

## Testing Checklist

### Test 1: Cash Payment Invoice
- [ ] Create invoice with "Cash" payment method
- [ ] Verify Payrex gateway is created automatically
- [ ] Generate PDF and verify Payrex QR code appears
- [ ] Scan QR code and verify it links to Payrex payment page
- [ ] Verify payment amount, invoice number, and patient details are correct

### Test 2: Bank Transfer Invoice
- [ ] Create invoice with "Bank transfer" payment method
- [ ] Generate PDF and verify Swiss QR-bill appears
- [ ] Verify QR-bill contains Swiss cross symbol
- [ ] Verify reference number is properly formatted (27 digits with spaces)
- [ ] Verify IBAN: CH09 3078 8000 0502 4628 9
- [ ] Verify creditor: Aesthetics Clinic XT SA
- [ ] Scan with banking app and verify all payment details populate correctly

### Test 3: Online Payment Invoice
- [ ] Create invoice with "Online Payment" method
- [ ] Verify Payrex gateway is created automatically
- [ ] Generate PDF and verify Payrex QR code appears
- [ ] Complete payment flow through Payrex
- [ ] Verify webhook updates invoice status

### Test Iterations
As per requirements, each test should be run **3 times** to ensure consistency and reliability.

## Technical Standards Compliance

### Swiss QR-bill Standard v2.2/2.3
✅ Implements SPC QR code format
✅ UTF-8 encoding (Coding Type 1)
✅ Structured address format (Type S)
✅ QRR reference with Modulo 10 check digit
✅ Error correction level M (15%)
✅ Proper field ordering per specification
✅ Max character limits enforced (70/140 chars)

### Payrex API Integration
✅ CHF currency support
✅ Amount in cents (multiply by 100)
✅ Customer information pre-fill
✅ Reference ID tracking
✅ QR code generation for payment links
✅ Webhook support for payment status

## Database Schema

**Existing Fields Used**:
- `payment_method`: "Cash" | "Online Payment" | "Bank transfer" | "Insurance"
- `payrexx_payment_link`: Payrex payment URL (Cash & Online)
- `payrexx_gateway_id`: Payrex gateway identifier
- `payrexx_gateway_hash`: Payrex gateway hash
- `payrexx_payment_status`: "waiting" | "confirmed" | "cancelled"

## Migration Notes

### From Stripe to Payrex
- **Previous**: Stripe used for Online Payment only
- **Current**: Payrex used for Online Payment AND Cash
- **Benefit**: Single payment provider, unified QR code experience

### Bank Transfer Enhancement
- **Previous**: Static reference number, manual reconciliation
- **Current**: Dynamic QR references with check digits, automated matching possible
- **Benefit**: Swiss banking app compatibility, reduced payment errors

## Security Considerations

1. **QR Code Validation**: Swiss QR-bill format prevents tampering
2. **Check Digits**: Modulo 10 algorithm ensures reference integrity
3. **IBAN Validation**: Format validation for Swiss/Liechtenstein IBANs
4. **Amount Embedding**: Payment amount included in QR-bill (optional)
5. **Payrex Security**: HTTPS payment links, encrypted gateway

## Future Enhancements

1. **EBICS Protocol Integration**
   - Automated bank statement retrieval
   - Automatic payment reconciliation
   - Real-time payment confirmation

2. **Multi-Currency Support**
   - EUR support for QR-bills
   - Currency conversion at payment time

3. **Payment Plan Support**
   - Installment QR-bills
   - Recurring payment references

## Contact for Questions

As specified in the requirements, for any questions during implementation:
**Email**: echannels@bcge.ch (EBICS team at BCGE)

## References

1. Swiss QR-bill Specification: https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/qr-bill.html
2. EBICS Specification: https://www.ebics.org/en/technical-information
3. ISO 20022 Standards: https://www.six-group.com/en/products-services/banking-services/payment-standardization/standards/iso-20022.html
4. Payrex API Documentation: (internal)

---

**Implementation Status**: ✅ Complete and ready for testing
**Compliance**: ✅ Swiss Payment Standards v2.2/2.3
**Testing Required**: 3 iterations per payment method (9 total tests)
