import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { printInvoiceRequest } from "@/lib/sumexInvoice";

/**
 * POST /api/medidata/request-pdf
 * Generate PDF from stored invoice request XML via Sumex request manager.
 *
 * Body: { submissionId: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { submissionId } = (await request.json().catch(() => ({}))) as { submissionId?: string };

    if (!submissionId) {
      return NextResponse.json({ error: "submissionId is required" }, { status: 400 });
    }

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("medidata_submissions")
      .select("id, xml_content, invoice_number")
      .eq("id", submissionId)
      .single();

    if (subErr || !sub) {
      return NextResponse.json({ error: "Submission not found" }, { status: 404 });
    }

    if (!sub.xml_content) {
      return NextResponse.json({ error: "No XML content in submission" }, { status: 400 });
    }

    const result = await printInvoiceRequest(
      sub.xml_content,
      `invoice_${sub.invoice_number || submissionId}.xml`,
    );

    if (!result.success || !result.pdfContent) {
      return NextResponse.json({ error: result.error || "PDF generation failed" }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(result.pdfContent), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="invoice_${sub.invoice_number || submissionId}.pdf"`,
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
