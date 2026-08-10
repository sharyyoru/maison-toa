import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireWorkflowAdmin } from "@/lib/workflows/auth";

export async function GET(request: Request) {
  const auth = await requireWorkflowAdmin(request); if (auth instanceof NextResponse) return auth;
  const { data, error } = await supabaseAdmin.from("patient_property_definitions").select("*").order("label");
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json(data);
}
export async function POST(request: Request) {
  const auth = await requireWorkflowAdmin(request); if (auth instanceof NextResponse) return auth;
  const body = await request.json();
  const key = String(body.key || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "_");
  if (!key || !body.label || !["text", "number", "boolean", "date", "single_select"].includes(body.value_type)) return NextResponse.json({ error: "Valid key, label, and type are required" }, { status: 400 });
  const { data, error } = await supabaseAdmin.from("patient_property_definitions").insert({ key, label: String(body.label).trim(), value_type: body.value_type, options: body.value_type === "single_select" ? body.options || [] : [], created_by_user_id: auth.userId }).select("*").single();
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json(data, { status: 201 });
}
export async function DELETE(request: Request) {
  const auth = await requireWorkflowAdmin(request); if (auth instanceof NextResponse) return auth;
  const { id } = await request.json();
  const { error } = await supabaseAdmin.from("patient_property_definitions").update({ active: false }).eq("id", id);
  return error ? NextResponse.json({ error: error.message }, { status: 500 }) : NextResponse.json({ ok: true });
}

