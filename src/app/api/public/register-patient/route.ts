import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

type RegisterPayload = {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  country_code: string;
  gender?: string;
  dob?: string;
  street_address?: string;
  street_number?: string; // merged into street_address, not a real column
  postal_code?: string;
  town?: string;
  country?: string;
  language_preference?: string;
};

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RegisterPayload;

    const {
      first_name,
      last_name,
      email,
      phone,
      country_code,
      gender,
      dob,
      street_address,
      street_number,
      postal_code,
      town,
      country,
      language_preference,
    } = body;

    if (!first_name?.trim() || !last_name?.trim() || !email?.trim() || !phone?.trim()) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json({ error: "Invalid email format" }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for duplicate email
    const { data: existing } = await supabase
      .from("patients")
      .select("id")
      .ilike("email", email.trim())
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { error: "A patient with this email already exists." },
        { status: 409 }
      );
    }

    const { data: patient, error: patientError } = await supabase
      .from("patients")
      .insert({
        first_name: first_name.trim(),
        last_name: last_name.trim(),
        email: email.trim().toLowerCase(),
        phone: `${country_code}${phone.trim().replace(/^0+/, "")}`,
        country_code,
        gender: gender || null,
        dob: dob || null,
        street_address: [street_address?.trim(), street_number?.trim()].filter(Boolean).join(" ") || null,
        postal_code: postal_code?.trim() || null,
        town: town?.trim() || null,
        country: country?.trim() || null,
        language_preference: language_preference || null,
        source: "manual",
      })
      .select("id")
      .single();

    if (patientError || !patient) {
      console.error("Error creating patient:", JSON.stringify(patientError));
      return NextResponse.json({ error: "Failed to create patient record" }, { status: 500 });
    }

    // Trigger patient-created workflow (non-blocking)
    try {
      const url = new URL(request.url);
      const baseUrl = `${url.protocol}//${url.host}`;
      await fetch(`${baseUrl}/api/workflows/patient-created`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patient_id: patient.id }),
      });
    } catch {
      console.error("Failed to trigger patient-created workflow");
    }

    return NextResponse.json({ ok: true, patient_id: patient.id });
  } catch (error) {
    console.error("Error registering patient:", error);
    return NextResponse.json(
      { error: "Failed to register patient", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
