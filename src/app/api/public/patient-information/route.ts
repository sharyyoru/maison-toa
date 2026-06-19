import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sanitizeCountry, sanitizePhone, sanitizeTown, stripHtml } from "@/lib/patientSanitize";

type PatientInformationPayload = {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  gender?: string;
  dob?: string;
  street_address?: string;
  street_number?: string;
  postal_code?: string;
  town?: string;
  country?: string;
  language_preference?: string;
  email_communications?: string;
  photo_consent?: string;
  specialty_interest?: string;
  referral_source?: string;
  consent_understood?: boolean;
  signature?: string;
  form_language?: "en" | "fr";
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VALID_GENDERS = new Set(["male", "female", "other"]);
const VALID_LANGUAGES = new Set(["en", "fr", "de", "it"]);
const YES_NO = new Set(["yes", "no"]);
const VALID_SPECIALTY_INTERESTS = new Set([
  "aesthetic_medicine",
  "dermatology",
  "plastic_surgery",
  "laser_treatments",
  "other",
]);
const VALID_REFERRAL_SOURCES = new Set([
  "google",
  "social_media",
  "friend_family",
  "medical_referral",
  "advertising",
  "other",
]);

function cleanText(value: string | undefined) {
  return stripHtml(value)?.trim() || null;
}

function formName(language: "en" | "fr") {
  return language === "fr" ? "Informations personnelles" : "Patient Information";
}

async function findPatientIdByEmail(email: string) {
  const { data, error } = await supabaseAdmin
    .from("patients")
    .select("id")
    .ilike("email", email)
    .order("created_at", { ascending: true })
    .limit(1);

  if (error) throw error;
  return data?.[0]?.id as string | undefined;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as PatientInformationPayload;
    const email = cleanText(body.email)?.toLowerCase();
    const firstName = cleanText(body.first_name);
    const lastName = cleanText(body.last_name);
    const phone = cleanText(body.phone);
    const dob = cleanText(body.dob);
    const streetAddressLine = cleanText(body.street_address);
    const streetNumber = cleanText(body.street_number);
    const postalCode = cleanText(body.postal_code);
    const town = cleanText(body.town);
    const country = cleanText(body.country);
    const sanitizedCountry = sanitizeCountry(country);
    const formLanguage = body.form_language === "fr" ? "fr" : "en";

    if (
      !firstName ||
      !lastName ||
      !email ||
      !phone ||
      !body.gender ||
      !dob ||
      !streetAddressLine ||
      !streetNumber ||
      !postalCode ||
      !town ||
      !country ||
      !sanitizedCountry ||
      !body.language_preference ||
      !body.specialty_interest ||
      !body.referral_source
    ) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    if (!EMAIL_PATTERN.test(email)) {
      return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
    }

    if (!VALID_GENDERS.has(body.gender)) {
      return NextResponse.json({ error: "Invalid gender" }, { status: 400 });
    }

    if (!VALID_LANGUAGES.has(body.language_preference)) {
      return NextResponse.json({ error: "Invalid preferred language" }, { status: 400 });
    }

    if (!YES_NO.has(body.email_communications || "") || !YES_NO.has(body.photo_consent || "")) {
      return NextResponse.json({ error: "Missing required communication preferences" }, { status: 400 });
    }

    if (!VALID_SPECIALTY_INTERESTS.has(body.specialty_interest)) {
      return NextResponse.json({ error: "Invalid specialty interest" }, { status: 400 });
    }

    if (!VALID_REFERRAL_SOURCES.has(body.referral_source)) {
      return NextResponse.json({ error: "Invalid referral source" }, { status: 400 });
    }

    if (body.consent_understood !== true || !body.signature?.startsWith("data:image/png;base64,")) {
      return NextResponse.json({ error: "Missing required consent and signature" }, { status: 400 });
    }

    const streetAddress = [streetAddressLine, streetNumber]
      .filter(Boolean)
      .join(" ") || null;

    const patientFields: Record<string, unknown> = {
      first_name: firstName,
      last_name: lastName,
      email,
      phone: sanitizePhone(phone),
      gender: body.gender,
      dob,
      street_address: streetAddress,
      postal_code: postalCode,
      town: sanitizeTown(town),
      country: sanitizedCountry,
      language_preference: body.language_preference,
      updated_at: new Date().toISOString(),
    };

    let patientId = await findPatientIdByEmail(email);
    let action: "created" | "updated" = "updated";

    if (patientId) {
      const { error: updateError } = await supabaseAdmin
        .from("patients")
        .update(patientFields)
        .eq("id", patientId);

      if (updateError) throw updateError;
    } else {
      const { data: insertedPatient, error: insertError } = await supabaseAdmin
        .from("patients")
        .insert({
          ...patientFields,
          source: "manual",
        })
        .select("id")
        .single();

      if (insertError) {
        const duplicateEmail = insertError.code === "23505";
        if (!duplicateEmail) throw insertError;

        patientId = await findPatientIdByEmail(email);
        if (!patientId) throw insertError;

        const { error: updateAfterConflictError } = await supabaseAdmin
          .from("patients")
          .update(patientFields)
          .eq("id", patientId);

        if (updateAfterConflictError) throw updateAfterConflictError;
      } else {
        patientId = insertedPatient.id;
        action = "created";
      }
    }

    const submissionData = {
      ...body,
      first_name: firstName,
      last_name: lastName,
      email,
      phone: sanitizePhone(phone),
      street_address: streetAddressLine,
      street_number: streetNumber,
      postal_code: postalCode,
      town: sanitizeTown(town),
      country: sanitizedCountry,
    };

    const { error: submissionError } = await supabaseAdmin
      .from("patient_form_submissions")
      .insert({
        patient_id: patientId,
        form_id: `patient-information-${formLanguage}`,
        form_name: formName(formLanguage),
        status: "submitted",
        submission_data: submissionData,
        submitted_at: new Date().toISOString(),
      });

    if (submissionError) {
      console.error("Patient information saved, but form submission audit failed:", submissionError);
    }

    return NextResponse.json({ ok: true, patient_id: patientId, action });
  } catch (error) {
    console.error("Error submitting public patient information:", error);
    return NextResponse.json({ error: "Failed to submit patient information" }, { status: 500 });
  }
}
