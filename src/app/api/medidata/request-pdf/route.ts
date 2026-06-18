import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const maxDuration = 300;

/**
 * POST /api/medidata/request-pdf
 * Returns the invoice PDF for a medidata submission.
 *
 * Strategy (in order):
 *   1. If the linked invoice already has a stored pdf_path_tp / pdf_path / pdf_path_tg,
 *      issue a signed URL for it and redirect the browser there directly.
 *      This is instant and avoids any Sumex call.
 *   2. If no stored PDF exists yet, regenerate it by calling /api/invoices/generate-pdf
 *      (same flow used on the invoice page) and redirect to the fresh signed URL.
 *
 * Body: { submissionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { submissionId } = (await request.json().catch(() => ({}))) as { submissionId?: string };

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
    }

    // Fetch submission to get invoice_id + billing type
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("medidata_submissions")
      .select("id, invoice_id, invoice_number, billing_type, law_type")
      .eq("id", submissionId)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (!sub.invoice_id) {
      return NextResponse.json({ error: "Submission has no linked invoice" }, { status: 400 });
    }

    // Fetch invoice to check for an existing stored PDF
    const { data: invoice, error: invErr } = await supabaseAdmin
      .from("invoices")
      .select("id, invoice_number, pdf_path, pdf_path_tp, pdf_path_tg, billing_type, payment_method, patient_id")
      .eq("id", sub.invoice_id)
      .single();

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    // Pick the best stored path: TP > generic > TG
    const billingType = (invoice.billing_type || sub.billing_type || "").toUpperCase();
    const storedPath: string | null =
      (billingType === "TP" ? invoice.pdf_path_tp : invoice.pdf_path_tg) ||
      invoice.pdf_path ||
      invoice.pdf_path_tp ||
      invoice.pdf_path_tg ||
      null;

    if (storedPath) {
      // Fast path: sign the existing stored PDF (valid 1 hour)
      const { data: signed, error: signErr } = await supabaseAdmin.storage
        .from("invoice-pdfs")
        .createSignedUrl(storedPath, 3600);

      if (!signErr && signed?.signedUrl) {
        // Stream the PDF bytes back so the medidata page can open it inline
        const pdfRes = await fetch(signed.signedUrl, { cache: "no-store" });
        if (pdfRes.ok) {
          const arrayBuf = await pdfRes.arrayBuffer();
          return new NextResponse(new Uint8Array(arrayBuf), {
            status: 200,
            headers: {
              "Content-Type": "application/pdf",
              "Content-Disposition": `inline; filename="invoice_${invoice.invoice_number || submissionId}.pdf"`,
            },
          });
        }
      }
      // Signed URL creation failed or PDF missing from storage — fall through to regenerate
      console.warn(`[request-pdf] Stored PDF unavailable for invoice ${invoice.id}, regenerating`);
    }

    // Slow path: regenerate via generate-pdf (Sumex buildInvoiceRequest)
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://maison-toa-dk99.vercel.app";
    const genRes = await fetch(`${baseUrl}/api/invoices/generate-pdf`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        invoiceId: sub.invoice_id,
        invoiceType: billingType === "TP" ? "tp" : "tg",
      }),
    });

    const genJson = await genRes.json().catch(() => ({})) as Record<string, unknown>;

    if (!genRes.ok) {
      return NextResponse.json(
        { error: (genJson.error as string) || `PDF generation failed (${genRes.status})` },
        { status: 500 },
      );
    }

    const pdfUrl = genJson.pdfUrl as string | undefined;
    if (!pdfUrl) {
      return NextResponse.json({ error: "PDF generated but no URL returned" }, { status: 500 });
    }

    const pdfRes2 = await fetch(pdfUrl, { cache: "no-store" });
    if (!pdfRes2.ok) {
      return NextResponse.json({ error: `Failed to download regenerated PDF: ${pdfRes2.status}` }, { status: 500 });
    }

    const arrayBuf2 = await pdfRes2.arrayBuffer();
    return new NextResponse(new Uint8Array(arrayBuf2), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice_${invoice.invoice_number || submissionId}.pdf"`,
      },
    });
  } catch (error) {
    console.error("request-pdf error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 },
    );
  }
}
