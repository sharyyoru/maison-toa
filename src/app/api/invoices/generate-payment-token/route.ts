import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { randomBytes } from "crypto";

export async function POST(req: NextRequest) {
  const { invoiceId } = await req.json();
  if (!invoiceId) return NextResponse.json({ error: "Missing invoiceId" }, { status: 400 });

  // Return existing token if already set
  const { data: invoice } = await supabaseAdmin
    .from("invoices")
    .select("id, payment_link_token")
    .eq("id", invoiceId)
    .single();

  if (!invoice) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  if (invoice.payment_link_token) {
    return NextResponse.json({ token: invoice.payment_link_token });
  }

  // Generate and save new token
  const token = randomBytes(24).toString("hex");
  await supabaseAdmin.from("invoices").update({ payment_link_token: token }).eq("id", invoiceId);

  return NextResponse.json({ token });
}
