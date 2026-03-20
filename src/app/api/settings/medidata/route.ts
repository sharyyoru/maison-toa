import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

/**
 * GET /api/settings/medidata
 * Returns the current MediData connection configuration.
 * Only clinic_gln (sender GLN) and medidata_client_id are managed here.
 * Clinic name/address/ZSR come from the providers table linked to each invoice.
 */
export async function GET() {
  const { data: configData } = await supabaseAdmin
    .from("medidata_config")
    .select("clinic_gln, medidata_client_id, is_test_mode")
    .limit(1)
    .single();

  const proxyUrl = process.env.MEDIDATA_PROXY_URL || "";
  const hasApiKey = !!process.env.MEDIDATA_PROXY_API_KEY;

  return NextResponse.json({
    senderGln: configData?.clinic_gln || "",
    clientId: configData?.medidata_client_id || "",
    proxyUrl: proxyUrl || "(default)",
    connected: hasApiKey && !!configData?.clinic_gln,
    isTestMode: configData?.is_test_mode ?? false,
  });
}

/**
 * POST /api/settings/medidata
 * Save MediData sender GLN and client ID to medidata_config table.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { senderGln, clientId } = body as { senderGln?: string; clientId?: string };

    if (senderGln && !/^\d{13}$/.test(senderGln)) {
      return NextResponse.json(
        { error: "Sender GLN must be a 13-digit number" },
        { status: 400 },
      );
    }

    const { data: existing } = await supabaseAdmin
      .from("medidata_config")
      .select("id")
      .limit(1)
      .single();

    const updates: Record<string, unknown> = {};
    if (senderGln !== undefined) updates.clinic_gln = senderGln;
    if (clientId !== undefined) updates.medidata_client_id = clientId;

    if (existing) {
      const { error } = await supabaseAdmin
        .from("medidata_config")
        .update(updates)
        .eq("id", existing.id);

      if (error) {
        return NextResponse.json(
          { error: `Failed to update settings: ${error.message}` },
          { status: 500 },
        );
      }
    } else {
      if (!senderGln) {
        return NextResponse.json(
          { error: "Sender GLN is required" },
          { status: 400 },
        );
      }
      const { error } = await supabaseAdmin
        .from("medidata_config")
        .insert({
          clinic_gln: senderGln,
          medidata_client_id: clientId || null,
          is_test_mode: false,
        });

      if (error) {
        return NextResponse.json(
          { error: `Failed to create settings: ${error.message}` },
          { status: 500 },
        );
      }
    }

    return NextResponse.json({
      success: true,
      message: "MediData settings saved successfully.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request" },
      { status: 400 },
    );
  }
}
