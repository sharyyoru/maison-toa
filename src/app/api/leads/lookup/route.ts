import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      email?: string | null;
      phoneCountryCode?: string | null;
      phoneNumber?: string | null;
    };

    const emailRaw = body.email?.trim() || "";
    const phoneCountryCode = body.phoneCountryCode?.trim() || "";
    const phoneNumber = body.phoneNumber?.trim() || "";

    if (!emailRaw && (!phoneCountryCode || !phoneNumber)) {
      return NextResponse.json(
        { error: "Email or phone is required" },
        { status: 400 },
      );
    }

    const normalizedEmail = emailRaw ? emailRaw.toLowerCase() : null;
    const fullPhone =
      phoneCountryCode && phoneNumber
        ? `${phoneCountryCode} ${phoneNumber}`.trim()
        : null;

    let patientRow: any | null = null;

    if (normalizedEmail) {
      const { data, error } = await supabaseAdmin
        .from("patients")
        .select(
          "id, first_name, last_name, email, phone, dob, marital_status, nationality, street_address, postal_code, town, profession, current_employer, language_preference",
        )
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data) {
        patientRow = data;
      }
    }

    if (!patientRow && fullPhone) {
      const { data, error } = await supabaseAdmin
        .from("patients")
        .select(
          "id, first_name, last_name, email, phone, dob, marital_status, nationality, street_address, postal_code, town, profession, current_employer, language_preference",
        )
        .eq("phone", fullPhone)
        .limit(1)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data) {
        patientRow = data;
      }
    }

    if (!patientRow) {
      return NextResponse.json({ patient: null, insurance: null });
    }

    const patientId = (patientRow as any).id as string;

    const { data: insuranceRows, error: insuranceError } = await supabaseAdmin
      .from("patient_insurances")
      .select("provider_name, card_number, insurance_type")
      .eq("patient_id", patientId)
      .order("created_at", { ascending: false })
      .limit(1);

    if (insuranceError) {
      return NextResponse.json(
        { error: insuranceError.message },
        { status: 500 },
      );
    }

    const insurance =
      insuranceRows && insuranceRows.length > 0
        ? insuranceRows[0]
        : null;

    return NextResponse.json({ patient: patientRow, insurance });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected error looking up lead" },
      { status: 500 },
    );
  }
}
