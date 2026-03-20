import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { createPayrexxGateway } from "@/lib/payrexx";

export async function POST(request: NextRequest) {
  try {
    const { installmentId } = await request.json();

    if (!installmentId) {
      return NextResponse.json(
        { error: "installmentId is required" },
        { status: 400 }
      );
    }

    // Get the installment
    const { data: installment, error: instError } = await supabaseAdmin
      .from("invoice_installments")
      .select("*")
      .eq("id", installmentId)
      .single();

    if (instError || !installment) {
      return NextResponse.json(
        { error: "Installment not found" },
        { status: 404 }
      );
    }

    // Check if payment link already exists
    if (installment.payrexx_payment_link) {
      return NextResponse.json({
        success: true,
        paymentLink: installment.payrexx_payment_link,
        gatewayId: installment.payrexx_gateway_id,
        alreadyExists: true,
      });
    }

    // Verify payment method is online-compatible
    const pm = (installment.payment_method || "").toLowerCase();
    if (!pm.includes("cash") && !pm.includes("online")) {
      return NextResponse.json(
        { error: "Installment payment method must be Cash or Online to generate a payment link" },
        { status: 400 }
      );
    }

    // Get the parent invoice
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, patient_id")
      .eq("id", installment.invoice_id)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Parent invoice not found" },
        { status: 404 }
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

    const amount = Math.round((installment.amount || 0) * 100);
    if (amount <= 0) {
      return NextResponse.json(
        { error: "Installment amount must be greater than 0" },
        { status: 400 }
      );
    }

    // Use a unique reference: invoice_number + installment number
    const referenceId = `${invoice.invoice_number}-INST${installment.installment_number}`;

    const gatewayResponse = await createPayrexxGateway({
      amount,
      currency: "CHF",
      referenceId,
      purpose: `Invoice ${invoice.invoice_number} - Installment ${installment.installment_number} of CHF ${installment.amount}`,
      forename: patient.first_name,
      surname: patient.last_name,
      email: patient.email || undefined,
      phone: patient.phone || undefined,
      street: patient.street_address || undefined,
      postcode: patient.postal_code || undefined,
      place: patient.town || undefined,
      country: "CH",
    });

    if (gatewayResponse.status !== "success") {
      console.error("Payrexx Gateway creation failed for installment:", gatewayResponse);
      return NextResponse.json(
        { error: "Failed to create payment gateway" },
        { status: 500 }
      );
    }

    const gatewayData = Array.isArray(gatewayResponse.data)
      ? gatewayResponse.data[0]
      : gatewayResponse.data;

    if (!gatewayData) {
      return NextResponse.json(
        { error: "No gateway data returned from Payrexx" },
        { status: 500 }
      );
    }

    const gateway = gatewayData as { id: number; hash: string; link: string };
    const gatewayId = gateway.id;
    const gatewayHash = gateway.hash;
    const paymentLink = gateway.link || `https://aesthetics-ge.payrexx.com/?payment=${gatewayHash}`;

    // Update the installment with Payrexx info
    const { error: updateError } = await supabaseAdmin
      .from("invoice_installments")
      .update({
        payrexx_gateway_id: gatewayId,
        payrexx_gateway_hash: gatewayHash,
        payrexx_payment_link: paymentLink,
        payrexx_payment_status: "waiting",
      })
      .eq("id", installmentId);

    if (updateError) {
      console.error("Failed to update installment with Payrexx data:", updateError);
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
    });
  } catch (error) {
    console.error("Error creating installment Payrexx gateway:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
