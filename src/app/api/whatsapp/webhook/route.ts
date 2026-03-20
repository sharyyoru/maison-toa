import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    
    const messageSid = formData.get("MessageSid") as string | null;
    const from = formData.get("From") as string | null;
    const to = formData.get("To") as string | null;
    const body = formData.get("Body") as string | null;
    const numMedia = parseInt(formData.get("NumMedia") as string || "0", 10);
    const profileName = formData.get("ProfileName") as string | null;
    const accountSid = formData.get("AccountSid") as string | null;

    console.log("Received Twilio WhatsApp webhook:", {
      messageSid,
      from,
      to,
      body,
      numMedia,
      profileName,
    });

    if (!messageSid || !from || !body) {
      console.error("Missing required webhook fields");
      return new NextResponse("Missing required fields", { status: 400 });
    }

    const cleanFrom = from.replace("whatsapp:", "").trim();
    const cleanTo = to?.replace("whatsapp:", "").trim() || null;

    let patientId: string | null = null;
    const { data: patients, error: patientError } = await supabaseAdmin
      .from("patients")
      .select("id")
      .or(`phone.eq.${cleanFrom},whatsapp_number.eq.${cleanFrom}`)
      .limit(1);

    if (!patientError && patients && patients.length > 0) {
      patientId = (patients[0] as any).id;
    } else {
      console.log("No patient found for phone:", cleanFrom);
    }

    const mediaUrls: string[] = [];
    if (numMedia > 0) {
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = formData.get(`MediaUrl${i}`) as string | null;
        if (mediaUrl) {
          mediaUrls.push(mediaUrl);
        }
      }
    }

    const { error: insertError } = await supabaseAdmin
      .from("whatsapp_messages")
      .insert({
        message_sid: messageSid,
        patient_id: patientId,
        from_number: cleanFrom,
        to_number: cleanTo,
        body: body || "",
        direction: "inbound",
        status: "delivered",
        sent_at: new Date().toISOString(),
        delivered_at: new Date().toISOString(),
        media_url: mediaUrls.length > 0 ? mediaUrls[0] : null,
        metadata: {
          profile_name: profileName,
          account_sid: accountSid,
          num_media: numMedia,
          all_media_urls: mediaUrls,
        },
      });

    if (insertError) {
      console.error("Failed to store inbound WhatsApp message:", insertError);
      return new NextResponse("Database error", { status: 500 });
    }

    if (patientId) {
      const { error: convError } = await supabaseAdmin
        .from("whatsapp_conversations")
        .upsert(
          {
            patient_id: patientId,
            phone_number: cleanFrom,
            last_message_at: new Date().toISOString(),
            last_message_preview: body?.substring(0, 100) || "",
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "patient_id,phone_number",
          }
        );

      if (convError) {
        console.error("Failed to update conversation:", convError);
      }
    }

    return new NextResponse('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', {
      status: 200,
      headers: {
        "Content-Type": "text/xml",
      },
    });
  } catch (error) {
    console.error("Unexpected error in WhatsApp webhook:", error);
    return new NextResponse("Internal server error", { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return NextResponse.json({
    message: "WhatsApp webhook endpoint is active",
    timestamp: new Date().toISOString(),
  });
}
