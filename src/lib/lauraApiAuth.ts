import { createHash, randomBytes } from "crypto";
import { supabaseAdmin } from "./supabaseAdmin";

const HASH_ALGO = "sha256";

export function hashApiKey(key: string): string {
  return createHash(HASH_ALGO).update(key).digest("hex");
}

export function generateApiKey(): string {
  const random = randomBytes(32).toString("hex");
  return `laura_${random}`;
}

export async function validateApiKey(key: string): Promise<boolean> {
  if (!key || typeof key !== "string") return false;

  const keyHash = hashApiKey(key);

  const { data, error } = await supabaseAdmin
    .from("organization_api_keys")
    .select("id, is_active")
    .eq("key_hash", keyHash)
    .maybeSingle();

  if (error || !data || !data.is_active) return false;

  // Track last usage without blocking the request.
  supabaseAdmin
    .from("organization_api_keys")
    .update({ last_used_at: new Date().toISOString() })
    .eq("id", data.id)
    .then(() => {}, () => {});

  return true;
}

export function unauthorizedResponse(): Response {
  return Response.json({ error: "Unauthorized" }, { status: 401 });
}
