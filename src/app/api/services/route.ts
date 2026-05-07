import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const categoryId = req.nextUrl.searchParams.get("category_id");

  let query = supabaseAdmin
    .from("services")
    .select("id, name, base_price, service_categories(name)")
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (categoryId) query = (query as any).eq("category_id", categoryId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const services = (data || []).map((s: any) => ({
    id: s.id,
    name: s.name,
    base_price: s.base_price,
    category_name: s.service_categories?.name ?? null,
  }));

  return NextResponse.json({ services });
}
