import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function requireWorkflowAdmin(request: Request): Promise<{ userId: string } | NextResponse> {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { data: profile } = await supabaseAdmin.from("users").select("role").eq("id", data.user.id).maybeSingle();
  if (profile?.role !== "admin") return NextResponse.json({ error: "Administrator access required" }, { status: 403 });
  return { userId: data.user.id };
}

