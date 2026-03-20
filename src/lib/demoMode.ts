import { supabaseClient } from "./supabaseClient";

let cachedDemoStatus: boolean | null = null;
let cacheTimestamp: number = 0;
const CACHE_DURATION = 5 * 60 * 1000;

export async function isDemoUser(): Promise<boolean> {
  const now = Date.now();
  
  if (cachedDemoStatus !== null && (now - cacheTimestamp) < CACHE_DURATION) {
    return cachedDemoStatus;
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  
  if (!user) {
    cachedDemoStatus = false;
    cacheTimestamp = now;
    return false;
  }

  const { data: userData } = await supabaseClient
    .from("users")
    .select("is_demo")
    .eq("id", user.id)
    .single();

  const demoStatus = userData?.is_demo ?? false;
  cachedDemoStatus = demoStatus;
  cacheTimestamp = now;
  
  return demoStatus;
}

export function clearDemoCache() {
  cachedDemoStatus = null;
  cacheTimestamp = 0;
}

export async function getDemoFilter() {
  const isDemo = await isDemoUser();
  return { is_demo: isDemo };
}
