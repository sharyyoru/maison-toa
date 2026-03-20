import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Increase body size limit to 25MB for image uploads
export const config = {
  api: {
    bodyParser: {
      sizeLimit: '25mb',
    },
  },
};

// For App Router, also export runtime config
export const maxDuration = 60; // 60 seconds timeout for large uploads

const CRISALIX_API_BASE_URL =
  process.env.CRISALIX_API_BASE_URL ?? "https://api3d-staging.crisalix.com";

async function refreshAccessToken(
  refreshToken: string,
): Promise<{ access_token: string; player_token?: string; expires_in?: number } | null> {
  const CRISALIX_TOKEN_URL = process.env.CRISALIX_TOKEN_URL;
  const CRISALIX_CLIENT_ID = process.env.CRISALIX_CLIENT_ID;
  const CRISALIX_CLIENT_SECRET = process.env.CRISALIX_CLIENT_SECRET;

  if (!CRISALIX_TOKEN_URL || !CRISALIX_CLIENT_ID || !CRISALIX_CLIENT_SECRET) {
    console.error("[Crisalix] Missing refresh token environment variables");
    return null;
  }

  try {
    console.log("[Crisalix Patients] Attempting token refresh...");
    const response = await fetch(CRISALIX_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: CRISALIX_CLIENT_ID,
        client_secret: CRISALIX_CLIENT_SECRET,
      }),
    });

    if (!response.ok) {
      console.error("[Crisalix Patients] Token refresh failed:", response.status);
      return null;
    }

    const data = await response.json();
    console.log("[Crisalix Patients] Token refresh successful");
    return {
      access_token: data.access_token,
      player_token: data.player_token,
      expires_in: data.expires_in,
    };
  } catch (error) {
    console.error("[Crisalix Patients] Token refresh error:", error);
    return null;
  }
}

export async function POST(request: NextRequest) {
  console.log("[Crisalix Patients] POST request received");
  
  const cookie = request.cookies.get("crisalix_tokens")?.value;

  if (!cookie) {
    console.error("[Crisalix Patients] No crisalix_tokens cookie found");
    return NextResponse.json(
      { error: "Missing Crisalix authentication. Please connect 3D again." },
      { status: 401 },
    );
  }

  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let playerToken: string | null = null;
  
  try {
    const parsed = JSON.parse(cookie) as {
      access_token?: string | null;
      refresh_token?: string | null;
      player_token?: string | null;
    };
    accessToken = parsed.access_token ?? null;
    refreshToken = parsed.refresh_token ?? null;
    playerToken = parsed.player_token ?? null;
    
    console.log("[Crisalix Patients] Token status:", {
      hasAccessToken: !!accessToken,
      hasRefreshToken: !!refreshToken,
      hasPlayerToken: !!playerToken,
    });
  } catch (error) {
    console.error("[Crisalix Patients] Failed to parse tokens cookie:", error);
    accessToken = null;
  }

  if (!accessToken) {
    console.error("[Crisalix Patients] No access token in cookie");
    return NextResponse.json(
      { error: "Missing Crisalix access token. Please reconnect 3D." },
      { status: 401 },
    );
  }

  const incomingForm = await request.formData();

  const patientId = (incomingForm.get("patient_id") ?? "").toString().trim();
  const reconstructionTypeRaw = (incomingForm.get("reconstruction_type") ?? "")
    .toString()
    .trim()
    .toLowerCase();
  const providerRaw = (incomingForm.get("provider") ?? "4").toString().trim();
  const providerId = providerRaw.replace(/[^0-9]/g, "") || providerRaw;

  // Map our internal reconstruction type to Crisalix values
  let reconstructionType: string;
  if (reconstructionTypeRaw === "breast") {
    reconstructionType = "mammo";
  } else if (reconstructionTypeRaw === "face") {
    reconstructionType = "face";
  } else if (reconstructionTypeRaw === "body") {
    reconstructionType = "body";
  } else {
    return NextResponse.json(
      { error: "Unknown reconstruction type for Crisalix." },
      { status: 400 },
    );
  }

  // Load patient details from Supabase for Crisalix patient[name]/patient[email]
  let patientName = "Patient";
  let patientEmail: string | null = null;

  if (patientId) {
    const { data } = await supabaseAdmin
      .from("patients")
      .select("first_name,last_name,email")
      .eq("id", patientId)
      .single();

    if (data) {
      const fullName = `${data.first_name ?? ""} ${data.last_name ?? ""}`
        .trim()
        .replace(/\s+/g, " ");
      patientName = fullName || data.email || patientName;
      patientEmail = (data.email ?? null) as string | null;
    }
  }

  const outboundForm = new FormData();

  // Patient core fields
  outboundForm.append("patient[name]", patientName);
  if (patientEmail) {
    outboundForm.append("patient[email]", patientEmail);
  }

  // Reconstruction core fields
  outboundForm.append("reconstruction[type]", reconstructionType);
  outboundForm.append("reconstruction[provider]", providerId);

  // Image files
  const leftFile = incomingForm.get("left_profile") as File | null;
  const frontFile = incomingForm.get("front_profile") as File | null;
  const rightFile = incomingForm.get("right_profile") as File | null;
  const backFile = incomingForm.get("back_profile") as File | null;

  if (leftFile) outboundForm.append("reconstruction[left]", leftFile);
  if (frontFile) outboundForm.append("reconstruction[front]", frontFile);
  if (rightFile) outboundForm.append("reconstruction[right]", rightFile);
  if (backFile) outboundForm.append("reconstruction[back]", backFile);

  // Measurements
  if (reconstructionTypeRaw === "breast") {
    const nippleToNipple = (incomingForm.get("nipple_to_nipple_cm") ?? "")
      .toString()
      .trim();
    if (nippleToNipple) {
      outboundForm.append("reconstruction[nipple_to_nipple]", nippleToNipple);
    }
  } else if (reconstructionTypeRaw === "face") {
    const pupilDistance = (incomingForm.get("pupillary_distance_cm") ?? "")
      .toString()
      .trim();
    if (pupilDistance) {
      // Crisalix examples use eye_distance for similar measurements
      outboundForm.append("reconstruction[eye_distance]", pupilDistance);
    }
  } else if (reconstructionTypeRaw === "body") {
    const hipline = (incomingForm.get("hipline_cm") ?? "")
      .toString()
      .trim();
    if (hipline) {
      outboundForm.append("reconstruction[hipline]", hipline);
    }
  }

  const url = `${CRISALIX_API_BASE_URL}/patients`;
  
  console.log("[Crisalix Patients] Sending request to:", url);
  console.log("[Crisalix Patients] Form data fields:", Array.from(outboundForm.keys()));

  let crisalixResponse = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: outboundForm,
  });

  // If we get 401/403, try to refresh the token
  if ((crisalixResponse.status === 401 || crisalixResponse.status === 403) && refreshToken) {
    console.log("[Crisalix Patients] Got", crisalixResponse.status, "- attempting token refresh");
    
    const newTokens = await refreshAccessToken(refreshToken);
    
    if (newTokens) {
      accessToken = newTokens.access_token;
      
      // Update cookies with new tokens
      const response = NextResponse.json({ refreshed: true });
      const maxAge = newTokens.expires_in ?? 86400;
      
      response.cookies.set(
        "crisalix_tokens",
        JSON.stringify({
          access_token: newTokens.access_token,
          refresh_token: refreshToken,
          player_token: newTokens.player_token ?? playerToken,
          expires_in: newTokens.expires_in,
        }),
        {
          httpOnly: true,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge,
        },
      );
      
      if (newTokens.player_token) {
        response.cookies.set("crisalix_player_token", newTokens.player_token, {
          httpOnly: false,
          secure: process.env.NODE_ENV === "production",
          sameSite: "lax",
          path: "/",
          maxAge,
        });
      }
      
      console.log("[Crisalix Patients] Retrying with refreshed token");
      
      // Retry the request with new token
      crisalixResponse = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: outboundForm,
      });
    } else {
      console.error("[Crisalix Patients] Token refresh failed, redirecting to re-auth");
      return NextResponse.json(
        {
          error: "Session expired. Please reconnect to Crisalix.",
          needsReauth: true,
        },
        { status: 401 },
      );
    }
  }

  if (!crisalixResponse.ok) {
    let body: unknown = null;
    try {
      body = await crisalixResponse.json();
    } catch {
      body = await crisalixResponse.text().catch(() => null);
    }

    console.error("[Crisalix Patients] Request failed:", {
      status: crisalixResponse.status,
      body,
    });

    return NextResponse.json(
      {
        error: "Crisalix patient creation failed",
        status: crisalixResponse.status,
        details: body,
      },
      { status: 502 },
    );
  }

  const data = (await crisalixResponse.json()) as {
    patient?: { id?: number | null; player_id?: string | null };
  };
  
  console.log("[Crisalix Patients] Success:", {
    crisalixPatientId: data.patient?.id,
    playerId: data.patient?.player_id,
  });

  if (patientId && data.patient && data.patient.id != null) {
    const typeForDb = reconstructionTypeRaw;
    try {
      await supabaseAdmin.from("crisalix_reconstructions").insert({
        patient_id: patientId,
        crisalix_patient_id: data.patient.id,
        reconstruction_type: typeForDb,
        player_id: data.patient.player_id ?? null,
      });
    } catch {
    }
  }

  return NextResponse.json(data);
}
