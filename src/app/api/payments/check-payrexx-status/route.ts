import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPayrexxGateway } from "@/lib/payrexx";

export async function POST(request: NextRequest) {
  try {
    const { invoiceId } = await request.json();

    if (!invoiceId) {
      return NextResponse.json(
        { error: "Invoice ID is required" },
        { status: 400 }
      );
    }

    // Get the invoice with Payrexx gateway info
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, payrexx_gateway_id, status, total_amount, payrexx_payment_status")
      .eq("id", invoiceId)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: "Invoice not found" },
        { status: 404 }
      );
    }

    if (!invoice.payrexx_gateway_id) {
      return NextResponse.json(
        { error: "No Payrexx gateway associated with this invoice" },
        { status: 400 }
      );
    }

    // Fetch gateway status from Payrexx
    const gatewayResponse = await getPayrexxGateway(invoice.payrexx_gateway_id);

    console.log("Payrexx gateway status:", JSON.stringify(gatewayResponse, null, 2));

    if (gatewayResponse.status !== "success") {
      return NextResponse.json(
        { error: "Failed to fetch Payrexx gateway status" },
        { status: 500 }
      );
    }

    const gatewayData = Array.isArray(gatewayResponse.data) 
      ? gatewayResponse.data[0] 
      : gatewayResponse.data;

    if (!gatewayData) {
      return NextResponse.json(
        { error: "No gateway data returned" },
        { status: 500 }
      );
    }

    // Check gateway status - "confirmed" means payment was completed
    const gatewayStatus = (gatewayData as { status?: string }).status;
    const isPaid = gatewayStatus === "confirmed";

    // Update invoice if payment is confirmed
    if (isPaid && invoice.status !== "PAID" && invoice.status !== "PARTIAL_LOSS") {
      const invoiceTotal = Number(invoice.total_amount) || 0;
      const now = new Date().toISOString();

      // Try to extract the actual transaction amount from the gateway response
      // Payrexx gateway invoices contain the amount in cents
      const gatewayInvoices = (gatewayData as any)?.invoices;
      let transactionAmount = invoiceTotal; // default to full amount
      if (Array.isArray(gatewayInvoices) && gatewayInvoices.length > 0) {
        const txAmountCents = gatewayInvoices[0]?.amount ?? 0;
        if (txAmountCents > 0) {
          transactionAmount = txAmountCents / 100;
        }
      }

      // Detect partial loss (commission/fee deduction)
      const isPartialLoss = transactionAmount > 0 && transactionAmount < invoiceTotal - 0.01;

      const updatePayload: Record<string, unknown> = {
        status: isPartialLoss ? "PARTIAL_LOSS" : "PAID",
        paid_amount: isPartialLoss ? transactionAmount : invoiceTotal,
        payrexx_payment_status: "confirmed",
        payrexx_paid_at: now,
        paid_at: now,
      };

      if (isPartialLoss) {
        console.log("Payrexx partial loss detected (status check):", {
          invoiceId: invoice.id,
          invoiceTotal,
          transactionAmount,
          loss: invoiceTotal - transactionAmount,
        });
      }

      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update(updatePayload)
        .eq("id", invoiceId);

      if (updateError) {
        console.error("Failed to update invoice:", updateError);
        return NextResponse.json(
          { error: "Failed to update invoice status" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: isPartialLoss ? "Invoice marked as partial loss (fees deducted)" : "Invoice marked as paid",
        gatewayStatus,
        isPaid: true,
        isPartialLoss,
        paidAmount: updatePayload.paid_amount,
      });
    }

    const alreadyPaid = invoice.status === "PAID" || invoice.status === "OVERPAID" || invoice.status === "PARTIAL_LOSS";

    return NextResponse.json({
      success: true,
      message: alreadyPaid ? "Invoice already marked as paid" : "Payment not yet confirmed",
      gatewayStatus,
      isPaid: alreadyPaid,
    });
  } catch (error) {
    console.error("Error checking Payrexx status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
