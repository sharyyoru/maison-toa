import crypto from "crypto";
import { cookies } from "next/headers";

const SESSION_MAX_AGE_MS = 60 * 60 * 24 * 7 * 1000; // 7 days

function getSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    "insecure-dev-secret"
  );
}

function sign(payload: string): string {
  return crypto
    .createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

// Creates an HMAC-signed admin session token: base64url(payload).base64url(sig)
export function createAdminToken(email: string): string {
  const payload = Buffer.from(
    JSON.stringify({ email, exp: Date.now() + SESSION_MAX_AGE_MS })
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

// Returns the admin email when the token is valid and unexpired, else null.
export function verifyAdminToken(token: string | undefined): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof decoded.exp !== "number" || decoded.exp < Date.now()) return null;
    return typeof decoded.email === "string" ? decoded.email : null;
  } catch {
    return null;
  }
}

// Server-side check for the admin_session cookie. Returns admin email or null.
export async function verifyAdminSession(): Promise<string | null> {
  const cookieStore = await cookies();
  return verifyAdminToken(cookieStore.get("admin_session")?.value);
}

export async function getAdminSession(): Promise<{ email: string } | null> {
  const email = await verifyAdminSession();
  return email ? { email } : null;
}

export async function verifyAdmin(): Promise<boolean> {
  return (await getAdminSession()) !== null;
}
