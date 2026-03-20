import { NextRequest, NextResponse } from "next/server";

const CRISALIX_TOKEN_URL =
  process.env.CRISALIX_TOKEN_URL ??
  "https://sso-staging.crisalix.com/auth/token";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const error = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state") ?? "";

  // Log all query parameters for debugging
  console.log("[Crisalix OAuth Callback] Received request:", {
    error,
    code: code ? "present" : "missing",
    state,
    allParams: Object.fromEntries(url.searchParams.entries()),
  });

  if (error || !code) {
    const message = error
      ? `Crisalix authorization failed: ${error}`
      : "Missing authorization code from Crisalix.";

    console.error("[Crisalix OAuth Callback] Authorization error:", { error, code, message });

    return new NextResponse(
      `<html><body><h1>Crisalix 3D Authorization Error</h1><p>${message}</p><p>Please check the browser console and server logs for details.</p></body></html>`,
      {
        status: 400,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

  const safePatientId = state.trim() || null;

  const clientId = process.env.CRISALIX_CLIENT_ID;
  const clientSecret = process.env.CRISALIX_CLIENT_SECRET;
  const redirectUri = process.env.CRISALIX_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    return new NextResponse(
      "Missing CRISALIX_CLIENT_ID or CRISALIX_REDIRECT_URI environment variables.",
      { status: 500 },
    );
  }

  const body = new URLSearchParams();
  body.set("grant_type", "authorization_code");
  body.set("code", code);
  body.set("redirect_uri", redirectUri);
  body.set("client_id", clientId);
  if (clientSecret) {
    body.set("client_secret", clientSecret);
  }

  console.log("[Crisalix OAuth Callback] Exchanging code for token:", {
    tokenUrl: CRISALIX_TOKEN_URL,
    redirectUri,
  });

  const tokenResponse = await fetch(CRISALIX_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body,
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text().catch(() => "");
    console.error("[Crisalix OAuth Callback] Token exchange failed:", {
      status: tokenResponse.status,
      body: text,
    });
    return new NextResponse(
      `Failed to exchange authorization code with Crisalix. Status ${tokenResponse.status}. Body: ${text}`,
      { status: 500 },
    );
  }

  console.log("[Crisalix OAuth Callback] Token exchange successful");

  const tokenJson = (await tokenResponse.json()) as {
    access_token?: string;
    refresh_token?: string;
    player_token?: string;
    expires_in?: number;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };

  if (!tokenJson.access_token) {
    return new NextResponse(
      "Crisalix token response did not include an access_token.",
      { status: 500 },
    );
  }

  const maxAgeSeconds =
    typeof tokenJson.expires_in === "number" && tokenJson.expires_in > 0
      ? tokenJson.expires_in
      : 60 * 60 * 24; // default 1 day

  const redirectTarget = safePatientId
    ? `/patients/${safePatientId}/3d/setup`
    : "/patients";

  console.log("[Crisalix OAuth Callback] Redirecting to:", redirectTarget);

  const response = NextResponse.redirect(new URL(redirectTarget, request.url));

  response.cookies.set(
    "crisalix_tokens",
    JSON.stringify({
      access_token: tokenJson.access_token,
      refresh_token: tokenJson.refresh_token ?? null,
      player_token: tokenJson.player_token ?? null,
      expires_in: tokenJson.expires_in ?? null,
    }),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    },
  );

  if (tokenJson.player_token) {
    console.log("[Crisalix OAuth Callback] Setting player token cookie");
    response.cookies.set("crisalix_player_token", tokenJson.player_token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: maxAgeSeconds,
    });
  } else {
    console.warn("[Crisalix OAuth Callback] No player_token in response");
  }

  console.log("[Crisalix OAuth Callback] Cookies set, redirecting to:", redirectTarget);
  return response;
}
