import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      treatmentId,
      categorySlug,
      firstName,
      lastName,
      email,
      phone,
      appointmentDate,
      doctorSlug,
      doctorName,
      service,
      treatmentName,
      notes,
      location,
      language,
      trackingParams,
    } = body;

    if (!treatmentId || !email || !appointmentDate || !categorySlug) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    let linkedService: any = null;
    let depositPercentage = 50;
    let displayTreatmentName = treatmentName || service;

    if (treatmentId === "none") {
      // Consultation-only booking: resolve price/deposit from the category's consultation service.
      const { data: category, error: catErr } = await supabaseAdmin
        .from("booking_categories")
        .select("id, name, consultation_service_id, consultation_deposit_percentage, services:consultation_service_id(id, name, base_price)")
        .eq("slug", categorySlug)
        .single();

      if (catErr || !category) {
        console.error("[Stripe] Consultation category not found:", { categorySlug, error: catErr?.message, email });
        return NextResponse.json({ error: "Consultation category not found" }, { status: 404 });
      }

      if (!category.consultation_service_id) {
        return NextResponse.json({ error: "No consultation service configured for this category" }, { status: 400 });
      }

      linkedService = category.services as any;
      depositPercentage = Number(category.consultation_deposit_percentage ?? 100);
      displayTreatmentName = treatmentName || service || category.name;
    } else {
      // Treatment booking: resolve price/deposit from the treatment's linked service.
      const { data: treatment, error: tErr } = await supabaseAdmin
        .from("booking_treatments")
        .select("id, name, prepayment_required, deposit_percentage, linked_service_id, services:linked_service_id(id, name, base_price)")
        .eq("id", treatmentId)
        .single();

      if (tErr || !treatment) {
        console.error("[Stripe] Treatment not found:", { treatmentId, error: tErr?.message, email });
        return NextResponse.json({ error: "Treatment not found" }, { status: 404 });
      }

      if (!treatment.prepayment_required) {
        return NextResponse.json({ error: "This treatment does not require prepayment" }, { status: 400 });
      }

      linkedService = treatment.services as any;
      depositPercentage = Number(treatment.deposit_percentage ?? 100);
      displayTreatmentName = treatmentName || treatment.name;
    }

    if (!linkedService?.base_price) {
      return NextResponse.json({ error: "No price configured for this booking" }, { status: 400 });
    }

    const fullPrice = Number(linkedService.base_price);
    const depositAmount = Math.round(fullPrice * (depositPercentage / 100) * 100); // in cents

    const depositLabelFr = depositPercentage === 100 ? "Acompte" : `Acompte ${depositPercentage}%`;
    const depositLabelEn = depositPercentage === 100 ? "Deposit" : `${depositPercentage}% deposit`;

    // Encode booking data in metadata (Stripe metadata values max 500 chars each)
    const metadata: Record<string, string> = {
      type: "booking_deposit",
      treatment_id: treatmentId,
      category_slug: categorySlug,
      treatment_name: displayTreatmentName,
      service_id: linkedService.id,
      service_name: linkedService.name,
      full_price: String(fullPrice),
      deposit_percentage: String(depositPercentage),
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
      tracking_params: JSON.stringify(trackingParams || {}),
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
              name: `${language === "en" ? depositLabelEn : depositLabelFr} - ${displayTreatmentName}`,
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
