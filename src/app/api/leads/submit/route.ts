import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      language: "en" | "fr";
      email: string;
      firstName: string;
      lastName: string;
      phoneCountryCode: string;
      phoneNumber: string;
      personal: {
        dob: string | null;
        maritalStatus: string | null;
        nationality: string;
        streetAddress: string;
        postalCode: string;
        town: string;
        profession: string;
        currentEmployer: string;
      };
      insurance: {
        providerName: string;
        cardNumber: string;
        type: "private" | "semi_private" | "basic" | null;
      } | null;
      health: {
        weight: string | null;
        height: string | null;
        bmi: string | null;
        illnesses: string | null;
        surgeries: string | null;
        allergies: string | null;
        cigarettes: string | null;
        alcohol: string | null;
        sports: string | null;
        medications: string | null;
        generalPractitioner: string | null;
        gynecologist: string | null;
        children: string | null;
      };
      contactPreference: "email" | "phone" | "sms" | "";
      consentAccepted: boolean;
    };

    const {
      language,
      email,
      firstName,
      lastName,
      phoneCountryCode,
      phoneNumber,
      personal,
      insurance,
      health,
      contactPreference,
      consentAccepted,
    } = body;

    if (!consentAccepted) {
      return NextResponse.json(
        { error: "Consent is required" },
        { status: 400 },
      );
    }

    if (!email || !firstName || !lastName || !phoneNumber) {
      return NextResponse.json(
        { error: "Missing required contact information" },
        { status: 400 },
      );
    }

    const normalizedEmail = email.toLowerCase();
    const fullPhone = `${phoneCountryCode} ${phoneNumber}`.trim();

    const {
      dob,
      maritalStatus,
      nationality,
      streetAddress,
      postalCode,
      town,
      profession,
      currentEmployer,
    } = personal;

    let existingNotes: string | null = null;

    let patientRow: any | null = null;

    // First try to find an existing patient by email
    const { data: existingByEmail, error: existingByEmailError } =
      await supabaseAdmin
        .from("patients")
        .select("id, notes")
        .ilike("email", normalizedEmail)
        .limit(1)
        .maybeSingle();

    if (existingByEmailError) {
      return NextResponse.json(
        { error: existingByEmailError.message },
        { status: 500 },
      );
    }

    if (existingByEmail) {
      patientRow = existingByEmail;
    } else {
      // If no match by email, try to match by phone
      const { data: existingByPhone, error: existingByPhoneError } =
        await supabaseAdmin
          .from("patients")
          .select("id, notes")
          .eq("phone", fullPhone)
          .limit(1)
          .maybeSingle();

      if (existingByPhoneError) {
        return NextResponse.json(
          { error: existingByPhoneError.message },
          { status: 500 },
        );
      }

      if (existingByPhone) {
        patientRow = existingByPhone;
      }
    }

    let patientId: string;

    const basePayload: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email: normalizedEmail,
      phone: fullPhone,
      nationality,
      street_address: streetAddress,
      postal_code: postalCode,
      town,
      profession,
      current_employer: currentEmployer,
      language_preference: language,
      source: "lead_form",
    };

    if (dob) {
      basePayload.dob = dob;
    }
    if (maritalStatus) {
      basePayload.marital_status = maritalStatus;
    }

    if (patientRow) {
      patientId = (patientRow as any).id as string;
      existingNotes = ((patientRow as any).notes as string | null) ?? null;

      const { error: updateError } = await supabaseAdmin
        .from("patients")
        .update(basePayload)
        .eq("id", patientId);

      if (updateError) {
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }
    } else {
      const { data: inserted, error: insertError } = await supabaseAdmin
        .from("patients")
        .insert(basePayload)
        .select("id, notes")
        .single();

      if (insertError || !inserted) {
        return NextResponse.json(
          { error: insertError?.message ?? "Failed to create patient" },
          { status: 500 },
        );
      }

      patientId = (inserted as any).id as string;
      existingNotes = ((inserted as any).notes as string | null) ?? null;
    }

    if (insurance && insurance.providerName && insurance.cardNumber && insurance.type) {
      const { data: existingIns } = await supabaseAdmin
        .from("patient_insurances")
        .select("id")
        .eq("patient_id", patientId)
        .order("created_at", { ascending: false })
        .limit(1);

      if (existingIns && existingIns.length > 0) {
        const first = existingIns[0] as { id: string };
        await supabaseAdmin
          .from("patient_insurances")
          .update({
            provider_name: insurance.providerName,
            card_number: insurance.cardNumber,
            insurance_type: insurance.type,
          })
          .eq("id", first.id);
      } else {
        await supabaseAdmin.from("patient_insurances").insert({
          patient_id: patientId,
          provider_name: insurance.providerName,
          card_number: insurance.cardNumber,
          insurance_type: insurance.type,
        });
      }
    }

    const leadSnapshot = {
      submitted_at: new Date().toISOString(),
      language,
      contactPreference,
      health,
    };

    const serialized = JSON.stringify(leadSnapshot, null, 2);
    const newNotesEntry = `\n\n[Lead form] ${serialized}`;
    const combinedNotes = ((existingNotes ?? "") + newNotesEntry).trim();

    await supabaseAdmin
      .from("patients")
      .update({ notes: combinedNotes })
      .eq("id", patientId);

    return NextResponse.json({ patientId });
  } catch (error) {
    return NextResponse.json(
      { error: "Unexpected error submitting lead form" },
      { status: 500 },
    );
  }
}
