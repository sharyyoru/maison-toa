import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

type TargetType = "user" | "billing_entity";
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

async function loadOptions() {
  const [{ data: users, error: usersError }, { data: entities, error: entitiesError }] = await Promise.all([
    supabaseAdmin.from("users").select("id, full_name, email").order("full_name"),
    supabaseAdmin.from("providers").select("id, name").eq("role", "billing_entity").order("name"),
  ]);
  if (usersError) throw new Error(usersError.message);
  if (entitiesError) throw new Error(entitiesError.message);
  return [
    ...(users || []).map((user) => ({ type: "user" as const, id: user.id, label: user.full_name || user.email || "Unnamed user" })),
    ...(entities || []).map((entity) => ({ type: "billing_entity" as const, id: entity.id, label: entity.name || "Unnamed billing entity" })),
  ];
}

export async function GET() {
  try {
    const [{ data: configurations, error }, options] = await Promise.all([
      supabaseAdmin.from("colored_line_configurations").select("id, target_type, target_id, hex_color, created_at, updated_at").order("created_at"),
      loadOptions(),
    ]);
    if (error) throw new Error(error.message);
    const labels = new Map(options.map((option) => [`${option.type}:${option.id}`, option.label]));
    return NextResponse.json({
      configurations: (configurations || []).map((item) => ({
        ...item,
        target_label: labels.get(`${item.target_type}:${item.target_id}`) || "Unavailable target",
      })),
      options,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load colored lines" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const targetType = body.target_type as TargetType;
    const targetId = typeof body.target_id === "string" ? body.target_id : "";
    const hexColor = typeof body.hex_color === "string" ? body.hex_color.trim().toUpperCase() : "";
    if (!(["user", "billing_entity"] as string[]).includes(targetType) || !targetId) {
      return NextResponse.json({ error: "A doctor or billing entity is required" }, { status: 400 });
    }
    if (!HEX_COLOR.test(hexColor)) {
      return NextResponse.json({ error: "Color must use the #RRGGBB format" }, { status: 400 });
    }

    const targetQuery = targetType === "user"
      ? supabaseAdmin.from("users").select("id").eq("id", targetId).maybeSingle()
      : supabaseAdmin.from("providers").select("id").eq("id", targetId).eq("role", "billing_entity").maybeSingle();
    const { data: target, error: targetError } = await targetQuery;
    if (targetError) throw new Error(targetError.message);
    if (!target) return NextResponse.json({ error: "Selected target does not exist" }, { status: 400 });

    const payload = { target_type: targetType, target_id: targetId, hex_color: hexColor, updated_at: new Date().toISOString() };
    const operation = body.id
      ? supabaseAdmin.from("colored_line_configurations").update(payload).eq("id", body.id)
      : supabaseAdmin.from("colored_line_configurations").insert(payload);
    const { data, error } = await operation.select("id, target_type, target_id, hex_color, created_at, updated_at").single();
    if (error) {
      const duplicate = error.code === "23505";
      return NextResponse.json({ error: duplicate ? "That doctor or billing entity already has a color" : error.message }, { status: duplicate ? 409 : 500 });
    }
    return NextResponse.json({ configuration: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save colored line" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
  const { error } = await supabaseAdmin.from("colored_line_configurations").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
