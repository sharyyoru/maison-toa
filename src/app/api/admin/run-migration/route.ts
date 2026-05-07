import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export async function GET() {
  const sql = `
    ALTER TABLE booking_treatments
      ADD COLUMN IF NOT EXISTS description TEXT,
      ADD COLUMN IF NOT EXISTS prepayment_required BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS linked_service_id UUID REFERENCES services(id) ON DELETE SET NULL;
  `;
  const { error } = await supabaseAdmin.rpc("exec_sql", { sql }).single().catch(() => ({ error: null }));
  // Try raw query via pg extension
  const { data, error: e2 } = await supabaseAdmin.from("booking_treatments").select("id").limit(1);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ ok: true, note: "Run migration manually in Supabase SQL editor", sql });
}
