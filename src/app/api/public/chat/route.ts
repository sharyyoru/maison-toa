import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { GoogleGenerativeAI } from "@google/generative-ai";

export const runtime = "nodejs";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type SessionData = {
  sessionId?: string;
  visitorId?: string;
  visitorName?: string;
  visitorEmail?: string;
  visitorPhone?: string;
  sourceUrl?: string;
  referrer?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
};

const SYSTEM_PROMPT = `You are Aliice, a friendly and professional AI assistant for Maison Toa, a premium aesthetic and plastic surgery clinic in Switzerland. You help website visitors with:

1. Answering questions about services (plastic surgery, dermatology, aesthetic treatments)
2. Providing general information about the clinic and doctors
3. Helping visitors understand treatment options
4. Collecting contact information when they want to book a consultation

IMPORTANT GUIDELINES:
- Be warm, professional, and helpful
- Never provide medical advice or diagnoses
- For specific medical questions, recommend booking a consultation
- If the visitor provides their name, email, or phone, acknowledge it warmly
- When appropriate, ask for contact details so the clinic can follow up
- Mention that the clinic has locations in Geneva, Gstaad, and Montreux when relevant
- Always encourage booking a free consultation for personalized advice

SERVICES OFFERED:
- Plastic Surgery: Breast augmentation, liposuction, rhinoplasty, facelift, tummy tuck
- Dermatology: Skin treatments, laser therapy, acne treatment
- Aesthetic Medicine: Botox, fillers, PRP therapy, mesotherapy
- Body Contouring: CoolSculpting, laser lipolysis

When someone shares contact info or asks about booking:
- Thank them for their interest
- Let them know the clinic team will contact them soon
- Offer to answer any other questions they have

Keep responses concise but helpful (2-3 sentences when possible).`;

async function extractDataFromConversation(messages: ChatMessage[]): Promise<{
  name?: string;
  email?: string;
  phone?: string;
  interestedService?: string;
  interestedLocation?: string;
  summary?: string;
}> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || messages.length < 2) return {};

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const conversationText = messages
      .filter((m) => m.role !== "system")
      .map((m) => `${m.role}: ${m.content}`)
      .join("\n");

    const extractPrompt = `Analyze this chat conversation and extract any information provided by the user. Return ONLY a JSON object with these fields (use null if not found):
{
  "name": "visitor's name if mentioned",
  "email": "visitor's email if mentioned", 
  "phone": "visitor's phone if mentioned",
  "interestedService": "service they asked about (e.g., rhinoplasty, botox, consultation)",
  "interestedLocation": "location preference if mentioned (Geneva, Gstaad, Montreux)",
  "summary": "one sentence summary of what the visitor wanted"
}

Conversation:
${conversationText}

JSON:`;

    const result = await model.generateContent(extractPrompt);
    const text = result.response.text();
    
    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        name: parsed.name || undefined,
        email: parsed.email || undefined,
        phone: parsed.phone || undefined,
        interestedService: parsed.interestedService || undefined,
        interestedLocation: parsed.interestedLocation || undefined,
        summary: parsed.summary || undefined,
      };
    }
  } catch (error) {
    console.error("Error extracting data from conversation:", error);
  }
  
  return {};
}

async function findOrCreatePatient(email?: string, phone?: string, name?: string): Promise<{
  patientId: string | null;
  matchType: "email" | "phone" | "created" | null;
}> {
  if (!email && !phone) {
    return { patientId: null, matchType: null };
  }

  try {
    // Try to find existing patient by email
    if (email) {
      const { data: byEmail } = await supabaseAdmin
        .from("patients")
        .select("id")
        .ilike("email", email)
        .limit(1)
        .single();
      
      if (byEmail?.id) {
        return { patientId: byEmail.id, matchType: "email" };
      }
    }

    // Try to find by phone
    if (phone) {
      const normalizedPhone = phone.replace(/\D/g, "");
      const { data: byPhone } = await supabaseAdmin
        .from("patients")
        .select("id")
        .or(`phone.ilike.%${normalizedPhone}%,mobile.ilike.%${normalizedPhone}%`)
        .limit(1)
        .single();
      
      if (byPhone?.id) {
        return { patientId: byPhone.id, matchType: "phone" };
      }
    }

    // Create new patient if we have email or phone
    if (email || phone) {
      const nameParts = (name || "").trim().split(/\s+/);
      const firstName = nameParts[0] || "Website";
      const lastName = nameParts.slice(1).join(" ") || "Visitor";

      const { data: newPatient, error } = await supabaseAdmin
        .from("patients")
        .insert({
          first_name: firstName,
          last_name: lastName,
          email: email || null,
          phone: phone || null,
          source: "chat_widget",
          notes: "Created from Aliice chat widget conversation",
        })
        .select("id")
        .single();

      if (newPatient?.id && !error) {
        return { patientId: newPatient.id, matchType: "created" };
      }
    }
  } catch (error) {
    console.error("Error finding/creating patient:", error);
  }

  return { patientId: null, matchType: null };
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: "Chat service unavailable" },
        { status: 500 }
      );
    }

    const body = await request.json();
    const { messages, session } = body as {
      messages?: ChatMessage[];
      session?: SessionData;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json(
        { error: "Missing messages array" },
        { status: 400 }
      );
    }

    // Get or create session
    let sessionId = session?.sessionId;
    
    if (!sessionId) {
      // Create new session
      const { data: newSession, error: sessionError } = await supabaseAdmin
        .from("public_chat_sessions")
        .insert({
          visitor_id: session?.visitorId || null,
          visitor_name: session?.visitorName || null,
          visitor_email: session?.visitorEmail || null,
          visitor_phone: session?.visitorPhone || null,
          source_url: session?.sourceUrl || null,
          referrer: session?.referrer || null,
          utm_source: session?.utmSource || null,
          utm_medium: session?.utmMedium || null,
          utm_campaign: session?.utmCampaign || null,
          utm_term: session?.utmTerm || null,
          utm_content: session?.utmContent || null,
          status: "active",
        })
        .select("id")
        .single();

      if (sessionError || !newSession) {
        console.error("Failed to create session:", sessionError);
        return NextResponse.json(
          { error: "Failed to create chat session" },
          { status: 500 }
        );
      }

      sessionId = newSession.id;
    }

    // Save the user's message
    const lastUserMessage = messages.filter((m) => m.role === "user").slice(-1)[0];
    if (lastUserMessage) {
      await supabaseAdmin.from("public_chat_messages").insert({
        session_id: sessionId,
        role: "user",
        content: lastUserMessage.content,
      });
    }

    // Generate AI response
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    const history = messages
      .filter((msg) => msg.role !== "system")
      .slice(0, -1)
      .map((msg) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      }));

    const chat = model.startChat({
      history,
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 500,
      },
      systemInstruction: {
        role: "user",
        parts: [{ text: SYSTEM_PROMPT }],
      },
    });

    const result = await chat.sendMessage(lastUserMessage?.content || "Hello");
    const responseText = result.response.text();

    if (!responseText) {
      return NextResponse.json(
        { error: "No response generated" },
        { status: 502 }
      );
    }

    // Save assistant response
    await supabaseAdmin.from("public_chat_messages").insert({
      session_id: sessionId,
      role: "assistant",
      content: responseText,
    });

    // Extract data from conversation periodically (every 4 messages)
    const allMessages = [...messages, { role: "assistant" as const, content: responseText }];
    if (allMessages.length >= 4 && allMessages.length % 2 === 0) {
      const extracted = await extractDataFromConversation(allMessages);
      
      if (Object.keys(extracted).some((k) => extracted[k as keyof typeof extracted])) {
        // Update session with extracted data
        const updateData: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };

        if (extracted.name) updateData.visitor_name = extracted.name;
        if (extracted.email) updateData.visitor_email = extracted.email;
        if (extracted.phone) updateData.visitor_phone = extracted.phone;
        if (extracted.interestedService) updateData.interested_service = extracted.interestedService;
        if (extracted.interestedLocation) updateData.interested_location = extracted.interestedLocation;
        if (extracted.summary) updateData.conversation_summary = extracted.summary;
        
        updateData.extracted_data = extracted;

        await supabaseAdmin
          .from("public_chat_sessions")
          .update(updateData)
          .eq("id", sessionId);

        // Try to match or create patient
        if (extracted.email || extracted.phone) {
          const { patientId, matchType } = await findOrCreatePatient(
            extracted.email,
            extracted.phone,
            extracted.name
          );

          if (patientId) {
            await supabaseAdmin
              .from("public_chat_sessions")
              .update({
                patient_id: patientId,
                patient_match_type: matchType,
              })
              .eq("id", sessionId);
          }
        }
      }
    }

    return NextResponse.json({
      sessionId,
      message: {
        role: "assistant",
        content: responseText,
      },
    });
  } catch (error) {
    console.error("Error in public chat:", error);
    return NextResponse.json(
      { error: "Failed to process chat" },
      { status: 500 }
    );
  }
}

// Close a chat session
export async function PATCH(request: Request) {
  try {
    const { sessionId, status, visitorEmail, visitorPhone, visitorName } = await request.json();

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID required" }, { status: 400 });
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (status) {
      updateData.status = status;
      if (status === "closed") {
        updateData.closed_at = new Date().toISOString();
      }
    }

    if (visitorEmail) updateData.visitor_email = visitorEmail;
    if (visitorPhone) updateData.visitor_phone = visitorPhone;
    if (visitorName) updateData.visitor_name = visitorName;

    // If contact info provided, try to match/create patient
    if (visitorEmail || visitorPhone) {
      const { patientId, matchType } = await findOrCreatePatient(
        visitorEmail,
        visitorPhone,
        visitorName
      );

      if (patientId) {
        updateData.patient_id = patientId;
        updateData.patient_match_type = matchType;
      }
    }

    const { error } = await supabaseAdmin
      .from("public_chat_sessions")
      .update(updateData)
      .eq("id", sessionId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error updating session:", error);
    return NextResponse.json({ error: "Failed to update session" }, { status: 500 });
  }
}
