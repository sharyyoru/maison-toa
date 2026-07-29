import { NextResponse } from "next/server";
import { generateContentWithFallback } from "@/lib/geminiWithFallback";

const ROUTE_MAP = `
System pages and routes:
- Dashboard: /
- Patients: /patients
- Agenda / Appointments: /appointments
- Online Bookings: /online-bookings
- Book Appointment CMS: /cms/book-appointment
- Deals & Pipeline: /deals
- Lead Import: /lead-import (sub-pages: CSV Import at /lead-import, Import History at /lead-import/history, Meta & Zapier Leads at /lead-import/meta-leads, Retell AI Calls at /lead-import/retell-calls, Embed Forms at /lead-import/embed-forms)
- Financials: /financials
- Invoices: /invoices
- Acomptes 50% / Deposits: /deposits
- MediData: /medidata
- Services: /services
- Tasks: /tasks
- User Management: /users
- Workflows: /workflows (sub: Templates at /workflows/templates)
- Controllers: /controllers
- Email Reports: /email-reports
- Chat with Aliice: /chat
- Client Onboarding: /client-onboarding
- Settings: /settings
- AI Knowledge Base: /prompt
`;

const SYSTEM_INSTRUCTION = `You are a knowledgeable assistant for an aesthetic clinic CRM called Aliice. You answer TWO types of questions:

1. System navigation — how to use features, where to find things in the application. Provide step-by-step instructions and direct page links from the route map provided.

2. Medical/clinical questions — aesthetic medicine, dermatology, cosmetic procedures, treatments (botox, fillers, laser, PRP, mesotherapy, HIFU, etc.), dosages, contraindications, pre/post-care instructions, etc. Provide accurate, professional medical information suitable for clinic staff.

When a question is about navigation, include relevant page links. When it is medical, provide the clinical information. If mixed, include both.

Always respond with STRICT JSON (no markdown, no code fences) with this shape:
{ "answer": "string with your full answer using plain text", "links": [{ "label": "string", "href": "string" }], "type": "navigation" | "medical" | "mixed" }

Route map for navigation:
${ROUTE_MAP}`;

function shouldTriggerAssist(query: string): boolean {
  const lower = query.toLowerCase().trim();
  const prefixes = [
    "how",
    "where",
    "can i",
    "what is",
    "what are",
    "why",
    "should i",
    "tell me about",
    "explain",
    "help",
  ];
  if (lower.endsWith("?")) return true;
  for (const prefix of prefixes) {
    if (lower.startsWith(prefix)) return true;
  }
  return false;
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query } = body as { query: string };

    if (!query || !shouldTriggerAssist(query)) {
      return NextResponse.json({ triggered: false });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY environment variable" },
        { status: 500 }
      );
    }

    const result = await generateContentWithFallback({
      apiKey,
      systemInstruction: SYSTEM_INSTRUCTION,
      contents: [{ role: "user", parts: [{ text: query }] }],
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1024,
      },
      verbose: true,
    });

    const text = result.response.text();

    let parsed: { answer: string; links: { label: string; href: string }[]; type: string };
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : text);
    } catch {
      parsed = { answer: text, links: [], type: "mixed" };
    }

    return NextResponse.json({
      triggered: true,
      answer: parsed.answer,
      links: parsed.links || [],
      type: parsed.type || "mixed",
    });
  } catch (err: any) {
    const rawMessage = err?.message || "AI assist failed";
    const isQuota =
      rawMessage.includes("429") ||
      rawMessage.toLowerCase().includes("quota") ||
      rawMessage.toLowerCase().includes("resource exhausted");
    if (isQuota) {
      return NextResponse.json(
        {
          triggered: true,
          answer:
            "I'm temporarily unavailable because the AI quota is exhausted. Please try again in a few minutes.",
          links: [],
          type: "navigation",
        },
        { status: 200 }
      );
    }
    return NextResponse.json(
      { error: rawMessage },
      { status: 500 }
    );
  }
}
