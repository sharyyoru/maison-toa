import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * Sync payment status - can be used to manually mark invoices as paid
 * or to sync status based on invoice_number (formerly consultation_id code)
 */
export async function POST(request: NextRequest) {
  try {
    const { consultationCode, markAsPaid } = await request.json();

    if (!consultationCode) {
      return NextResponse.json(
        { error: "consultationCode is required (e.g., CONS-MKNWEKTP)" },
        { status: 400 }
      );
    }

    // Find the invoice by invoice_number (which matches the old consultation_id code)
    const { data: invoice, error: invoiceError } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, status, total_amount, payrexx_payment_status, payrexx_gateway_id")
      .eq("invoice_number", consultationCode)
      .single();

    if (invoiceError || !invoice) {
      return NextResponse.json(
        { error: `Invoice not found for code: ${consultationCode}` },
        { status: 404 }
      );
    }

    // If markAsPaid is true, update the invoice
    if (markAsPaid) {
      const paidAt = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({
          status: "PAID",
          paid_amount: invoice.total_amount,
          paid_at: paidAt,
          payrexx_payment_status: "confirmed",
          payrexx_paid_at: paidAt,
        })
        .eq("id", invoice.id);

      if (updateError) {
        console.error("Failed to update invoice:", updateError);
        return NextResponse.json(
          { error: "Failed to update invoice status" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Invoice marked as paid",
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
      });
    }

    // Return current status
    return NextResponse.json({
      success: true,
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      isPaid: invoice.status === "PAID" || invoice.status === "OVERPAID",
      payrexxStatus: invoice.payrexx_payment_status,
      payrexxGatewayId: invoice.payrexx_gateway_id,
    });
  } catch (error) {
    console.error("Error syncing payment status:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
