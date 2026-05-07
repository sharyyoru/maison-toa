import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET(req: NextRequest) {
  const email = req.nextUrl.searchParams.get("email");
  if (!email) return NextResponse.json({ exists: false });

  const { data } = await supabaseAdmin
    .from("patients")
    .select("id")
    .ilike("email", email.trim())
    .limit(1)
    .single();

  return NextResponse.json({ exists: !!data });
}
