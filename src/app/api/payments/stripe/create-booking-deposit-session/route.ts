import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      treatmentId,
      firstName,
      lastName,
      email,
      phone,
      appointmentDate,
      doctorSlug,
      doctorName,
      service,
      notes,
      location,
      language,
    } = body;

    if (!treatmentId || !email || !appointmentDate) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Fetch treatment with linked service price
    const { data: treatment, error: tErr } = await supabaseAdmin
      .from("booking_treatments")
      .select("id, name, prepayment_required, linked_service_id, services:linked_service_id(id, name, base_price)")
      .eq("id", treatmentId)
      .single();

    if (tErr || !treatment) {
      return NextResponse.json({ error: "Treatment not found" }, { status: 404 });
    }

    if (!treatment.prepayment_required) {
      return NextResponse.json({ error: "This treatment does not require prepayment" }, { status: 400 });
    }

    const svc = treatment.services as any;
    if (!svc?.base_price) {
      return NextResponse.json({ error: "No price configured for this treatment" }, { status: 400 });
    }

    const depositAmount = Math.round(svc.base_price * 0.5 * 100); // 50% in cents

    // Encode booking data in metadata (Stripe metadata values max 500 chars each)
    const metadata: Record<string, string> = {
      type: "booking_deposit",
      treatment_id: treatmentId,
      treatment_name: treatment.name,
      service_id: svc.id,
      service_name: svc.name,
      full_price: String(svc.base_price),
      first_name: firstName,
      last_name: lastName,
      email,
      phone: phone || "",
      appointment_date: appointmentDate,
      doctor_slug: doctorSlug,
      doctor_name: doctorName,
      service_label: service,
      notes: (notes || "").slice(0, 490),
      location: location || "",
      language: language || "fr",
    };

    const expiresAt = Math.floor(Date.now() / 1000) + 23 * 60 * 60;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      currency: "chf",
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "chf",
            unit_amount: depositAmount,
            product_data: {
              name: `Acompte 50% – ${treatment.name}`,
              description: language === "fr"
                ? "Acompte déductible de tout traitement réalisé dans les 3 mois suivants."
                : "Deposit deductible from any treatment within the following 3 months.",
            },
          },
        },
      ],
      customer_email: email,
      expires_at: expiresAt,
      metadata,
      success_url: `${APP_URL}/book-appointment/payment-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${APP_URL}/book-appointment/payment-cancelled`,
    });

    return NextResponse.json({ url: session.url });
  } catch (err: any) {
    console.error("[Stripe] create-booking-deposit-session error:", err);
    return NextResponse.json({ error: err.message || "Failed to create session" }, { status: 500 });
  }
}
