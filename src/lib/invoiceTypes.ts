// ============================================================================
// TypeScript types matching the new invoices / invoice_line_items / invoice_payments tables
// See: migrations/001_create_new_invoice_tables.sql
// ============================================================================

export type InvoiceStatus =
  | "OPEN"
  | "PAID"
  | "CANCELLED"
  | "PARTIAL_PAID"
  | "PARTIAL_LOSS"
  | "OVERPAID";

export type HealthInsuranceLaw =
  | "KVG"
  | "UVG"
  | "IVG"
  | "MVG"
  | "VVG"
  | "PRIVATE";

export type BillingType = "TG" | "TP";

export type VatRate = "FREE" | "COMMON" | "REDUCED" | "NORMAL";

export type CatalogNature = "TARIFF_CATALOG" | "CUSTOM";

// ----- invoices table -----

export interface Invoice {
  id: string;

  // Relationships
  patient_id: string | null;
  consultation_id: string | null;

  // Invoice identity
  invoice_number: string;
  invoice_date: string; // date as ISO string
  due_date: string | null;
  treatment_date: string | null; // timestamptz

  // Doctor / Provider
  doctor_user_id: string | null;
  doctor_name: string | null;
  provider_id: string | null;
  provider_name: string | null;
  provider_gln: string | null;
  provider_zsr: string | null;
  
  // New billing fields
  provider_iban: string | null;
  doctor_gln: string | null;
  doctor_zsr: string | null;
  doctor_canton: string | null;

  // Amounts
  subtotal: number;
  vat_amount: number;
  total_amount: number;
  paid_amount: number | null;

  // Status
  status: InvoiceStatus;
  is_complimentary: boolean;

  // Payment method
  payment_method: string | null;

  // Online payment link
  payment_link_token: string | null;
  payment_link_expires_at: string | null;

  // Payrexx payment gateway
  payrexx_gateway_id: number | null;
  payrexx_gateway_hash: string | null;
  payrexx_payment_link: string | null;
  payrexx_transaction_id: string | null;
  payrexx_transaction_uuid: string | null;
  payrexx_payment_status: string | null;
  payrexx_paid_at: string | null;

  // Manual payment tracking
  paid_at: string | null;
  paid_by_user_id: string | null;

  // PDF
  pdf_path: string | null;
  pdf_generated_at: string | null;
  cash_receipt_path: string | null;

  // Swiss insurance billing
  health_insurance_law: HealthInsuranceLaw | null;
  billing_type: BillingType | null;
  insurer_id: string | null;
  medical_case_number: string | null;
  medidata_submission_id: string | null;

  // Treatment context (for XML)
  treatment_canton: string | null;
  treatment_reason: string | null; // 'disease' | 'accident' | 'maternity' | 'prevention'
  treatment_date_end: string | null;
  diagnosis_codes: { code: string; type: string }[] | null;

  // Insurance details
  insurance_gln: string | null;
  insurance_name: string | null;
  patient_ssn: string | null;
  patient_card_number: string | null;
  copy_to_guarantor: boolean;

  // Insurance payment tracking
  insurance_payment_status: string | null;
  insurance_paid_amount: number | null;
  insurance_paid_date: string | null;

  // Audit
  created_by_user_id: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  archived_at: string | null;
  is_demo: boolean;
}

// ----- invoice_line_items table -----

export interface InvoiceLineItem {
  id: string;
  invoice_id: string;

  // Ordering
  sort_order: number;

  // Service identification
  code: string | null;
  service_id: string | null;
  name: string;

  // Pricing
  quantity: number;
  unit_price: number;
  discount_percent: number;
  total_price: number;

  // VAT
  vat_rate: VatRate;
  vat_rate_value: number;
  vat_amount: number;

  // Swiss tariff system
  tariff_code: number | null;
  tardoc_code: string | null;
  tardoc_time: number;

  // Tax points
  tp_al: number;
  tp_tl: number;
  tp_al_value: number;
  tp_tl_value: number;
  tp_al_scale_factor: number;
  tp_tl_scale_factor: number;
  external_factor_mt: number;
  external_factor_tt: number;
  price_al: number;
  price_tl: number;

  // Service_ex XML fields
  date_begin: string | null;
  provider_gln: string | null;
  responsible_gln: string | null;
  billing_role: string | null; // 'both' | 'mt' | 'tt'
  record_id: number | null;
  ref_code: string | null;
  section_code: string | null;
  session_number: number;
  service_attributes: number;
  side_type: number; // ACF laterality: 0=none, 1=left, 2=right, 3=bilateral

  // Catalog metadata
  catalog_name: string | null;
  catalog_nature: CatalogNature | null;
  catalog_version: string | null;

  // Insurance
  uncovered_benefit: boolean;

  // Notes
  comment: string | null;

  // Audit
  created_at: string;
}

// ----- invoice_payments table -----

export interface InvoicePayment {
  id: string;
  invoice_id: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  payrexx_transaction_id: string | null;
  insurance_response_code: string | null;
  insurance_response_message: string | null;
  notes: string | null;
  created_by_user_id: string | null;
  created_at: string;
}

// ----- Convenience: Invoice with nested line items -----

export interface InvoiceWithLineItems extends Invoice {
  invoice_line_items: InvoiceLineItem[];
}
