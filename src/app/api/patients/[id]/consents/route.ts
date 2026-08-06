import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

async function user(request: Request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, ""); if (!token) return null;
  const { data } = await supabaseAdmin.auth.getUser(token); return data.user || null;
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await user(request))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const { data, error } = await supabaseAdmin.from("patient_consents").select("channel, granted, source, changed_at").eq("patient_id", id).order("changed_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const latest = new Map<string, { channel: string; granted: boolean; source: string | null; changed_at: string }>();
  for (const entry of data || []) if (!latest.has(entry.channel)) latest.set(entry.channel, entry);
  return NextResponse.json([...latest.values()]);
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const actor = await user(request); if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await params; const body = await request.json();
  if (!["email_marketing", "social_media"].includes(body.channel) || typeof body.granted !== "boolean") return NextResponse.json({ error: "Invalid consent" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("patient_consents").insert({ patient_id: id, channel: body.channel, granted: body.granted, source: "staff_crm", changed_by_user_id: actor.id }).select("channel, granted, changed_at").single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json(data, { status: 201 });
}
