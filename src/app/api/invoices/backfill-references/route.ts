import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function generateSwissReference(invoiceId: string): string {
  let numericPart = invoiceId.replace(/\D/g, "");
  if (numericPart.length === 0) {
    let hash = "";
    for (let i = 0; i < invoiceId.length; i++) {
      hash += invoiceId.charCodeAt(i).toString().padStart(3, "0");
    }
    numericPart = hash;
  }
  const padded = numericPart.length > 26 ? numericPart.slice(-26) : numericPart.padStart(26, "0");
  const table = [0, 9, 4, 6, 8, 2, 7, 1, 3, 5];
  let carry = 0;
  for (const ch of padded) carry = table[(carry + parseInt(ch, 10)) % 10];
  return padded + ((10 - carry) % 10).toString();
}

export async function POST() {
  try {
    // Fetch all invoices without a reference_number
    const { data: invoices, error } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number")
      .is("reference_number", null);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (!invoices || invoices.length === 0) {
      return NextResponse.json({ success: true, message: "No invoices to backfill", count: 0 });
    }

    let updated = 0;
    for (const inv of invoices) {
      if (!inv.invoice_number) continue;
      const ref = generateSwissReference(inv.invoice_number);
      const { error: updateError } = await supabaseAdmin
        .from("invoices")
        .update({ reference_number: ref })
        .eq("id", inv.id);
      if (!updateError) updated++;
    }

    return NextResponse.json({
      success: true,
      message: `Backfilled ${updated} of ${invoices.length} invoices`,
      count: updated,
      total: invoices.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
