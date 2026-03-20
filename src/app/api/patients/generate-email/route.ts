import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

const geminiApiKey = process.env.GEMINI_API_KEY;

let genAI: GoogleGenerativeAI | null = null;
if (geminiApiKey) {
  genAI = new GoogleGenerativeAI(geminiApiKey);
}

type GeneratePatientEmailRequestBody = {
  patientId?: string;
  description?: string;
  tone?: string;
};

export async function POST(request: Request) {
  try {
    if (!genAI) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY environment variable" },
        { status: 500 },
      );
    }

    const body = (await request.json()) as GeneratePatientEmailRequestBody;
    const patientId = body.patientId?.trim();
    const description = (body.description || "").trim();
    const tone = (body.tone || "professional and reassuring").trim();

    if (!patientId || !description) {
      return NextResponse.json(
        { error: "patientId and description are required" },
        { status: 400 },
      );
    }

    const { data: patient, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id, first_name, last_name, email, phone")
      .eq("id", patientId)
      .maybeSingle();

    if (patientError || !patient) {
      return NextResponse.json(
        { error: patientError?.message ?? "Patient not found" },
        { status: 404 },
      );
    }

    const firstName = (patient.first_name as string | null) ?? "";
    const lastName = (patient.last_name as string | null) ?? "";
    const fullName = [firstName, lastName].filter(Boolean).join(" ");
    const email = (patient.email as string | null) ?? null;
    const phone = (patient.phone as string | null) ?? null;

    const patientSummaryLines: string[] = [];
    if (fullName) patientSummaryLines.push(`Name: ${fullName}`);
    if (email) patientSummaryLines.push(`Email: ${email}`);
    if (phone) patientSummaryLines.push(`Phone: ${phone}`);

    const patientSummary =
      patientSummaryLines.length > 0
        ? patientSummaryLines.join("\n")
        : "Basic identity and contact details are not available.";

    const systemPrompt =
      "You are an email assistant for Aesthetics Clinic. You write concise, empathetic, medically appropriate emails to a single patient. Always output strict JSON with keys 'subject' and 'body' (plain text, no HTML).";

    const userPrompt = `
We are composing a one-off email to this specific patient.

Patient details:
${patientSummary}

Goal / context for the email:
${description}

Tone: ${tone}.

Requirements:
- Output STRICT JSON only, no markdown, with shape: {"subject": string, "body": string}.
- 'body' must be plain text suitable for pasting into an email textarea; use paragraphs separated by blank lines.
- Start with a natural greeting to the patient (for example, "Dear ${firstName || "patient"},").
- Do NOT include an email signature or clinic contact information; that will be appended separately.
`;

    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.0-flash",
      systemInstruction: systemPrompt,
    });

    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.7 },
    });

    const rawContent = result.response.text() || "";

    let subject = "Clinic update";
    let bodyText = "Dear patient,\n\nThank you for your message.";

    try {
      // Remove markdown code blocks if present
      const cleanedContent = rawContent.replace(/```json\n?|\n?```/g, "").trim();
      const parsed = JSON.parse(cleanedContent) as {
        subject?: string;
        body?: string;
      };

      if (parsed.subject && parsed.subject.trim().length > 0) {
        subject = parsed.subject.trim();
      }

      if (parsed.body && parsed.body.trim().length > 0) {
        bodyText = parsed.body.trim();
      }
    } catch {
      if (rawContent.trim().length > 0) {
        bodyText = rawContent.trim();
      }
    }

    return NextResponse.json({ subject, body: bodyText });
  } catch (error) {
    console.error("Error generating patient email via Gemini", error);
    return NextResponse.json(
      { error: "Failed to generate email" },
      { status: 500 },
    );
  }
}
