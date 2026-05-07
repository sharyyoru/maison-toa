import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

export async function POST(req: NextRequest) {
  try {
    const { patientId, serviceId, doctorId } = await req.json();
    if (!patientId || !serviceId) return NextResponse.json({ error: "Missing patientId or serviceId" }, { status: 400 });

    // Fetch service price
    const { data: service } = await supabaseAdmin
      .from("services")
      .select("id, name, base_price")
      .eq("id", serviceId)
      .single();

    if (!service?.base_price) return NextResponse.json({ error: "Service has no price" }, { status: 400 });

    const fullPrice = Number(service.base_price);
    const depositAmount = Math.round(fullPrice * 0.5 * 100) / 100;

    // Fetch patient
    const { data: patient } = await supabaseAdmin
      .from("patients")
      .select("first_name, last_name, email")
      .eq("id", patientId)
      .single();

    // Fetch doctor (medical staff)
    let doctor: any = null;
    if (doctorId) {
      const { data } = await supabaseAdmin.from("providers").select("id, name, gln, zsr").eq("id", doctorId).single();
      doctor = data;
    }

    // Auto-select billing entity: prefer aesthetic type linked to this doctor
    let billingEntity: any = null;
    if (doctorId) {
      const { data: entities } = await supabaseAdmin
        .from("providers")
        .select("id, name, iban, gln, zsr, billing_type")
        .eq("role", "billing_entity")
        .eq("doctor_id", doctorId);
      if (entities && entities.length > 0) {
        billingEntity = entities.find((e: any) => e.billing_type === "aesthetic") ?? entities[0];
      }
    }
    // Fallback: first billing entity
    if (!billingEntity) {
      const { data: fallback } = await supabaseAdmin
        .from("providers")
        .select("id, name, iban, gln, zsr")
        .eq("role", "billing_entity")
        .eq("billing_type", "aesthetic")
        .limit(1)
        .single();
      billingEntity = fallback;
    }

    // Generate invoice number
    const { data: maxRow } = await supabaseAdmin
      .from("invoices")
      .select("invoice_number")
      .order("invoice_number", { ascending: false })
      .limit(1)
      .single();
    const invoiceNumber = String((parseInt(maxRow?.invoice_number || "1000000") + 1));
    const paymentLinkToken = randomBytes(24).toString("hex");

    const nowIso = new Date().toISOString();

    // Create invoice (OPEN — not paid yet, Stripe will confirm)
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .insert({
        patient_id: patientId,
        invoice_number: invoiceNumber,
        title: `Acompte 50% – ${service.name}`,
        invoice_date: nowIso.split("T")[0],
        doctor_name: doctor?.name ?? null,
        doctor_gln: doctor?.gln ?? null,
        doctor_zsr: doctor?.zsr ?? null,
        provider_id: billingEntity?.id ?? null,
        provider_name: billingEntity?.name ?? null,
        provider_iban: billingEntity?.iban ?? null,
        provider_gln: billingEntity?.gln ?? null,
        provider_zsr: billingEntity?.zsr ?? null,
        subtotal: fullPrice,
        total_amount: depositAmount,  // pay page charges this amount (50% deposit)
        paid_amount: 0,
        status: "OPEN",
        payment_method: "online",
        payment_link_token: paymentLinkToken,
        is_archived: false,
        is_demo: false,
      })
      .select("id")
      .single();

    if (invErr || !invoice) return NextResponse.json({ error: invErr?.message || "Failed to create invoice" }, { status: 500 });

    // Create line item
    await supabaseAdmin.from("invoice_line_items").insert({
      invoice_id: invoice.id,
      name: service.name,
      quantity: 1,
      unit_price: fullPrice,
      total_price: fullPrice,
    });

    // The pay page URL generates a fresh Stripe session on demand — no expiry issue
    const payUrl = `${APP_URL}/invoice/pay/${paymentLinkToken}`;

    return NextResponse.json({
      invoiceId: invoice.id,
      invoiceNumber,
      stripeUrl: payUrl,
    });
  } catch (err: any) {
    console.error("[create-prepayment-invoice]", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
