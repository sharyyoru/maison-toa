/**
 * Payrexx Payment Gateway Integration
 * https://developers.payrexx.com/reference/rest-api
 */

import * as crypto from "crypto";

// Payrexx configuration
const PAYREXX_INSTANCE = process.env.PAYREXX_INSTANCE || "aesthetics-ge";
const PAYREXX_API_SECRET = process.env.PAYREXX_API_SECRET || "";
const PAYREXX_BASE_URL = `https://api.payrexx.com/v1.14/`;

export type PayrexxGatewayResponse = {
  status: string;
  data: {
    id: number;
    hash: string;
    link: string;
    status: string;
    createdAt: number;
    invoices: Array<{
      paymentRequestId: number;
      referenceId: string;
      amount: number;
      currency: string;
    }>;
  }[];
};

export type PayrexxTransactionStatus = 
  | "waiting"
  | "confirmed"
  | "authorized"
  | "reserved"
  | "refunded"
  | "partially-refunded"
  | "cancelled"
  | "declined"
  | "error"
  | "uncaptured";

export type PayrexxWebhookPayload = {
  transaction: {
    id: number;
    uuid: string;
    status: PayrexxTransactionStatus;
    time: string;
    lang: string;
    pageUuid: string;
    payment: {
      brand: string;
      wallet: string | null;
      cardType: string;
    };
    psp: string;
    pspId: number;
    mode: string;
    referenceId: string;
    invoice: {
      number: string;
      products: Array<{
        name: string;
        description: string;
        quantity: number;
        amount: number;
        sku: string;
      }>;
      amount: number;
      currency: string;
      discount: {
        code: string;
        amount: number;
        percentage: number;
      };
      customFields: Record<string, string>;
      test: boolean;
      referenceId: string;
      paymentLink: {
        hash: string;
        referenceId: string;
        email: string | null;
        name: string;
        differentBillingAddress: boolean;
        expirationDate: string | null;
      };
      paymentRequestId: number;
      originalAmount: number;
    };
    contact: {
      id: number;
      uuid: string;
      title: string;
      firstname: string;
      lastname: string;
      company: string;
      street: string;
      zip: string;
      place: string;
      country: string;
      countryISO: string;
      phone: string;
      email: string;
      dateOfBirth: string | null;
      deliveryGender: string;
      deliveryTitle: string;
      deliveryFirstname: string;
      deliveryLastname: string;
      deliveryCompany: string;
      deliveryStreet: string;
      deliveryZip: string;
      deliveryPlace: string;
      deliveryCountry: string;
      deliveryCountryISO: string;
      deliveryPhone: string;
    };
    subscription: unknown;
    refundable: boolean;
    partiallyRefundable: boolean;
    metadata: Record<string, unknown>;
  };
};

export type CreateGatewayParams = {
  amount: number; // Amount in cents (e.g., 100.00 CHF = 10000)
  currency?: string;
  referenceId: string; // Invoice/consultation ID
  purpose?: string;
  successRedirectUrl?: string;
  failedRedirectUrl?: string;
  cancelRedirectUrl?: string;
  // Contact information
  forename?: string;
  surname?: string;
  email?: string;
  phone?: string;
  street?: string;
  postcode?: string;
  place?: string;
  country?: string;
};

/**
 * Create a Payrexx Gateway (payment link)
 * Uses X-API-KEY header authentication with JSON body
 */
export async function createPayrexxGateway(
  params: CreateGatewayParams
): Promise<PayrexxGatewayResponse> {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://aestheticclinic.vercel.app";
  
  // Build JSON body with correct structure
  const requestBody: Record<string, unknown> = {
    amount: params.amount,
    currency: params.currency || "CHF",
    vatRate: null,
    preAuthorization: false,
    reservation: false,
    skipResultPage: false,
    chargeOnAuthorization: false,
    subscriptionState: false,
  };
  
  // Add optional params
  if (params.referenceId) {
    requestBody.referenceId = params.referenceId;
  }
  if (params.purpose) {
    requestBody.purpose = params.purpose;
  }
  
  // Add redirect URLs
  requestBody.successRedirectUrl = params.successRedirectUrl || `${baseUrl}/invoice/payment-success`;
  requestBody.failedRedirectUrl = params.failedRedirectUrl || `${baseUrl}/invoice/payment-failed`;
  requestBody.cancelRedirectUrl = params.cancelRedirectUrl || `${baseUrl}/invoice/payment-cancelled`;
  
  // Add contact fields using correct nested object format
  const fields: Record<string, { value: string }> = {};
  
  if (params.forename) {
    fields.forename = { value: params.forename };
  }
  if (params.surname) {
    fields.surname = { value: params.surname };
  }
  if (params.email) {
    fields.email = { value: params.email };
  }
  if (params.phone) {
    fields.phone = { value: params.phone };
  }
  if (params.street) {
    fields.street = { value: params.street };
  }
  if (params.postcode) {
    fields.postcode = { value: params.postcode };
  }
  if (params.place) {
    fields.place = { value: params.place };
  }
  if (params.country) {
    fields.country = { value: params.country };
  }
  
  if (Object.keys(fields).length > 0) {
    requestBody.fields = fields;
  }
  
  const url = new URL("Gateway/", PAYREXX_BASE_URL);
  url.searchParams.set("instance", PAYREXX_INSTANCE);
  
  console.log("Payrexx request URL:", url.toString());
  console.log("Payrexx request body:", JSON.stringify(requestBody, null, 2));
  
  const response = await fetch(url.toString(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Accept": "application/json",
      "X-API-KEY": PAYREXX_API_SECRET,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Payrexx API error:", errorText);
    throw new Error(`Payrexx API error: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<PayrexxGatewayResponse>;
}

/**
 * Retrieve a Payrexx Gateway by ID
 */
export async function getPayrexxGateway(gatewayId: number): Promise<PayrexxGatewayResponse> {
  const url = new URL(`Gateway/${gatewayId}/`, PAYREXX_BASE_URL);
  url.searchParams.set("instance", PAYREXX_INSTANCE);

  const response = await fetch(url.toString(), {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "X-API-KEY": PAYREXX_API_SECRET,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Payrexx API error: ${response.status} ${errorText}`);
  }

  return response.json() as Promise<PayrexxGatewayResponse>;
}

/**
 * Delete a Payrexx Gateway
 */
export async function deletePayrexxGateway(gatewayId: number): Promise<void> {
  const url = new URL(`Gateway/${gatewayId}/`, PAYREXX_BASE_URL);
  url.searchParams.set("instance", PAYREXX_INSTANCE);

  const response = await fetch(url.toString(), {
    method: "DELETE",
    headers: {
      "Accept": "application/json",
      "X-API-KEY": PAYREXX_API_SECRET,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Payrexx API error: ${response.status} ${errorText}`);
  }
}

/**
 * Verify webhook signature from Payrexx
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const hmac = crypto.createHmac("sha256", PAYREXX_API_SECRET);
  hmac.update(payload);
  const expectedSignature = hmac.digest("base64");
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  );
}

/**
 * Map Payrexx transaction status to our invoice paid status
 */
export function isTransactionPaid(status: PayrexxTransactionStatus): boolean {
  return status === "confirmed";
}

/**
 * Generate QR code data URL for a payment link
 */
export async function generatePaymentQRCode(paymentLink: string): Promise<string> {
  // We'll use the qrcode library which is already installed
  const QRCode = await import("qrcode");
  return QRCode.toDataURL(paymentLink, {
    width: 200,
    margin: 1,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}
