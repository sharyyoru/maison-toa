import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createPayrexxGateway, generatePaymentQRCode } from "@/lib/payrexx";

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Get the invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("*")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    // Check if payment link already exists
    if (invoice.payrexx_payment_link) {
      return NextResponse.json({
        success: true,
        paymentLink: invoice.payrexx_payment_link,
        gatewayId: invoice.payrexx_gateway_id,
        gatewayHash: invoice.payrexx_gateway_hash,
        alreadyExists: true,
      });
    }

    // Check if payment method is eligible for Payrexx gateway (cash, online, or card)
    const paymentMethod = invoice.payment_method?.toLowerCase() || "";
    if (!paymentMethod.includes("cash") && !paymentMethod.includes("online") && !paymentMethod.includes("card")) {
      return NextResponse.json(
        { error: "Invoice payment method must be cash, online, or card" },
        { status: 400 }
      );
    }

    // Get patient information
    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, email, phone, street_address, postal_code, town")
      .eq("id", invoice.patient_id)
      .single();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: "Patient not found" },
        { status: 404 }
      );
    }

    // Calculate amount in cents (Payrexx requires amount * 100)
    const amount = Math.round((invoice.total_amount || 0) * 100);

    if (amount <= 0) {
      return NextResponse.json(
        { error: "Invoice amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Create Payrexx Gateway
    const gatewayResponse = await createPayrexxGateway({
      amount,
      currency: "CHF",
      referenceId: invoice.invoice_number,
      purpose: `Invoice ${invoice.invoice_number} - Medical Services`,
      forename: patient.first_name,
      surname: patient.last_name,
      email: patient.email || undefined,
      phone: patient.phone || undefined,
      street: patient.street_address || undefined,
      postcode: patient.postal_code || undefined,
      place: patient.town || undefined,
      country: "CH",
    });

    console.log("Payrexx Gateway response:", JSON.stringify(gatewayResponse, null, 2));

    if (gatewayResponse.status !== "success") {
      console.error("Payrexx Gateway creation failed:", gatewayResponse);
      return NextResponse.json(
        { error: "Failed to create payment gateway" },
        { status: 500 }
      );
    }

    // Handle both array and single object response formats
    const gatewayData = Array.isArray(gatewayResponse.data) 
      ? gatewayResponse.data[0] 
      : gatewayResponse.data;

    if (!gatewayData) {
      console.error("No gateway data in response:", gatewayResponse);
      return NextResponse.json(
        { error: "No gateway data returned from Payrexx" },
        { status: 500 }
      );
    }

    const gateway = gatewayData as { id: number; hash: string; link: string };
    const gatewayId = gateway.id;
    const gatewayHash = gateway.hash;
    
    // Build payment link from hash if link is not directly provided
    const paymentLink = gateway.link || `https://aesthetics-ge.payrexx.com/?payment=${gatewayHash}`;
    
    console.log("Payment link:", paymentLink, "Gateway ID:", gatewayId, "Hash:", gatewayHash);

    // Generate QR code for the payment link
    const qrCodeDataUrl = await generatePaymentQRCode(paymentLink);

    // Update the invoice with Payrexx payment info
    const { error: updateError } = await supabaseAdmin
      .from("invoices")
      .update({
        payrexx_gateway_id: gatewayId,
        payrexx_gateway_hash: gatewayHash,
        payrexx_payment_link: paymentLink,
        payrexx_payment_status: "waiting",
      })
      .eq("id", invoiceId);

    if (updateError) {
      console.error("Failed to update consultation with Payrexx data:", updateError);
      return NextResponse.json(
        { error: "Failed to save payment gateway information" },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      paymentLink,
      gatewayId,
      gatewayHash,
      qrCodeDataUrl,
    });
  } catch (error) {
    console.error("Error creating Payrexx gateway:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
