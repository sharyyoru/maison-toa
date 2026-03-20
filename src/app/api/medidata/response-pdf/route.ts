import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { printInvoiceResponse } from "@/lib/sumexInvoice";

/**
 * POST /api/medidata/response-pdf
 * Render insurer response XML as PDF via Sumex1 response manager.
 *
 * Body: { responseId: string }
 *
 * Flow:
 * 1. Fetch XML content from medidata_responses table
 * 2. Call printInvoiceResponse (POST LoadXML + Print) to generate PDF
 * 3. Return PDF binary, or fall back to structured JSON for HTML rendering
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { responseId, mode } = body as { responseId?: string; mode?: string };

    if (!responseId) {
      return NextResponse.json({ error: "responseId is required" }, { status: 400 });
    }

    const { data: resp, error: respErr } = await supabaseAdmin
      .from("medidata_responses")
      .select("id, content, document_path, correlation_reference, response_type, status_in, status_out, explanation, sender_gln, received_at, created_at")
      .eq("id", responseId)
      .single();

    if (respErr || !resp) {
      return NextResponse.json({ error: "Response not found" }, { status: 404 });
    }

    if (!resp.content) {
      return NextResponse.json({ error: "No XML content in response" }, { status: 400 });
    }

    // Mode "json" returns parsed XML data for HTML rendering fallback
    if (mode === "json") {
      const parsed = parseResponseXml(resp.content);
      return NextResponse.json({
        success: true,
        data: {
          ...parsed,
          responseType: resp.response_type,
          statusIn: resp.status_in,
          statusOut: resp.status_out,
          explanation: resp.explanation,
          senderGln: resp.sender_gln,
          correlationReference: resp.correlation_reference,
          receivedAt: resp.received_at,
          createdAt: resp.created_at,
        },
      });
    }

    // Default: generate PDF via Sumex
    console.log(`[response-pdf] Rendering response ${responseId} via Sumex PrintInvoiceResponse`);
    const result = await printInvoiceResponse(resp.content, `response_${responseId.slice(0, 8)}.xml`);

    if (!result.success || !result.pdfContent) {
      // Return error with hint — client can retry with mode=json for HTML fallback
      return NextResponse.json(
        {
          error: result.error || "PDF generation failed",
          hint: "Try mode=json for HTML fallback rendering.",
        },
        { status: 500 },
      );
    }

    // Return the PDF as binary
    return new NextResponse(new Uint8Array(result.pdfContent), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="response-${resp.correlation_reference || responseId.slice(0, 8)}.pdf"`,
        "Content-Length": String(result.pdfContent.length),
      },
    });
  } catch (error) {
    console.error("[response-pdf] Error:", error);
    return NextResponse.json(
      { error: "Internal server error", details: String(error) },
      { status: 500 },
    );
  }
}

// ---------------------------------------------------------------------------
// XML parser helpers — extract structured data from generalInvoiceResponse_500
// ---------------------------------------------------------------------------

function extractAttr(xml: string, tagPattern: string, attr: string): string | null {
  const tagRegex = new RegExp(`<[^>]*${tagPattern}[^>]*>`, "i");
  const tagMatch = xml.match(tagRegex);
  if (!tagMatch) return null;
  const attrRegex = new RegExp(`${attr}\\s*=\\s*"([^"]*)"`, "i");
  const attrMatch = tagMatch[0].match(attrRegex);
  return attrMatch ? attrMatch[1] : null;
}

function extractTag(xml: string, tagName: string): string | null {
  const regex = new RegExp(`<[^:/]*:?${tagName}[^>]*>([\\s\\S]*?)<\\/[^:]*:?${tagName}>`, "i");
  const match = xml.match(regex);
  return match ? match[0] : null;
}

function extractAllTags(xml: string, tagName: string): string[] {
  const regex = new RegExp(`<[^:/]*:?${tagName}[^>]*>[\\s\\S]*?<\\/[^:]*:?${tagName}>`, "gi");
  return Array.from(xml.matchAll(regex)).map((m) => m[0]);
}

function extractAddress(block: string): Record<string, string> {
  const addr: Record<string, string> = {};
  const personMatch = block.match(/<[^:]*:?person[^>]*>/i);
  if (personMatch) {
    addr.familyName = extractAttr(personMatch[0], "person", "familyname") || "";
    addr.givenName = extractAttr(personMatch[0], "person", "givenname") || "";
    addr.salutation = extractAttr(personMatch[0], "person", "salutation") || "";
    addr.title = extractAttr(personMatch[0], "person", "title") || "";
  }
  const companyMatch = block.match(/<[^:]*:?company[^>]*>/i);
  if (companyMatch) {
    addr.companyName = extractAttr(companyMatch[0], "company", "company_name") || "";
  }
  const postalMatch = block.match(/<[^:]*:?postal[^>]*>/i);
  if (postalMatch) {
    addr.street = extractAttr(postalMatch[0], "postal", "street") || "";
    addr.zip = extractAttr(postalMatch[0], "postal", "zip") || "";
    addr.city = extractAttr(postalMatch[0], "postal", "city") || "";
  }
  return addr;
}

type ParsedResponse = {
  invoiceId: string | null;
  invoiceDate: string | null;
  requestType: string | null;
  requestSubtype: string | null;
  responseTimestamp: string | null;
  // Parties
  biller: { gln: string; address: Record<string, string> } | null;
  provider: { gln: string; address: Record<string, string> } | null;
  insurance: { gln: string; address: Record<string, string> } | null;
  patient: { ssn: string; birthdate: string; gender: string; address: Record<string, string> } | null;
  // Response details
  accepted: { explanation: string; statusIn: string; statusOut: string } | null;
  rejected: { explanation: string; statusIn: string; statusOut: string; errors: Array<{ code: string; text: string; errorValue: string; validValue: string }> } | null;
  pending: { explanation: string; statusIn: string; statusOut: string; messages: Array<{ code: string; text: string }> } | null;
  // Balance
  balance: { amount: string; amountDue: string; amountPaid: string; currency: string } | null;
};

function parseResponseXml(xml: string): ParsedResponse {
  const result: ParsedResponse = {
    invoiceId: null, invoiceDate: null, requestType: null, requestSubtype: null, responseTimestamp: null,
    biller: null, provider: null, insurance: null, patient: null,
    accepted: null, rejected: null, pending: null, balance: null,
  };

  // Payload attributes
  result.requestType = extractAttr(xml, "payload", "request_type");
  result.requestSubtype = extractAttr(xml, "payload", "request_subtype");
  result.responseTimestamp = extractAttr(xml, "payload", "response_timestamp");

  // Invoice reference
  const invoiceBlock = extractTag(xml, "invoice");
  if (invoiceBlock) {
    result.invoiceId = extractAttr(invoiceBlock, "invoice", "request_id") || extractAttr(xml, "invoice", "request_id");
    result.invoiceDate = extractAttr(invoiceBlock, "invoice", "request_date") || extractAttr(xml, "invoice", "request_date");
  }
  // Fallback: search in payload
  if (!result.invoiceId) result.invoiceId = extractAttr(xml, "payload", "request_id");

  // Biller
  const billerBlock = extractTag(xml, "biller");
  if (billerBlock) {
    result.biller = {
      gln: extractAttr(billerBlock, "biller", "ean_party") || "",
      address: extractAddress(billerBlock),
    };
  }

  // Provider
  const providerBlock = extractTag(xml, "provider");
  if (providerBlock) {
    result.provider = {
      gln: extractAttr(providerBlock, "provider", "ean_party") || "",
      address: extractAddress(providerBlock),
    };
  }

  // Insurance
  const insuranceBlock = extractTag(xml, "insurance");
  if (insuranceBlock) {
    result.insurance = {
      gln: extractAttr(insuranceBlock, "insurance", "ean_party") || "",
      address: extractAddress(insuranceBlock),
    };
  }

  // Patient
  const patientBlock = extractTag(xml, "patient");
  if (patientBlock) {
    result.patient = {
      ssn: extractAttr(patientBlock, "patient", "ssn") || "",
      birthdate: extractAttr(patientBlock, "patient", "birthdate") || "",
      gender: extractAttr(patientBlock, "patient", "gender") || "",
      address: extractAddress(patientBlock),
    };
  }

  // Accepted
  const acceptedBlock = extractTag(xml, "accepted");
  if (acceptedBlock) {
    result.accepted = {
      explanation: extractAttr(acceptedBlock, "accepted", "explanation") || extractAttr(acceptedBlock, "explanation", "explanation") || "",
      statusIn: extractAttr(acceptedBlock, "accepted", "status_in") || "",
      statusOut: extractAttr(acceptedBlock, "accepted", "status_out") || "",
    };
  }

  // Rejected
  const rejectedBlock = extractTag(xml, "rejected");
  if (rejectedBlock) {
    const errors = extractAllTags(rejectedBlock, "error").map((e) => ({
      code: extractAttr(e, "error", "code") || "",
      text: extractAttr(e, "error", "text") || "",
      errorValue: extractAttr(e, "error", "error_value") || "",
      validValue: extractAttr(e, "error", "valid_value") || "",
    }));
    result.rejected = {
      explanation: extractAttr(rejectedBlock, "rejected", "explanation") || "",
      statusIn: extractAttr(rejectedBlock, "rejected", "status_in") || "",
      statusOut: extractAttr(rejectedBlock, "rejected", "status_out") || "",
      errors,
    };
  }

  // Pending
  const pendingBlock = extractTag(xml, "pending");
  if (pendingBlock) {
    const messages = extractAllTags(pendingBlock, "message").map((m) => ({
      code: extractAttr(m, "message", "code") || "",
      text: extractAttr(m, "message", "text") || "",
    }));
    result.pending = {
      explanation: extractAttr(pendingBlock, "pending", "explanation") || "",
      statusIn: extractAttr(pendingBlock, "pending", "status_in") || "",
      statusOut: extractAttr(pendingBlock, "pending", "status_out") || "",
      messages,
    };
  }

  // Balance
  const balanceBlock = extractTag(xml, "balance");
  if (balanceBlock) {
    result.balance = {
      amount: extractAttr(balanceBlock, "balance", "amount") || "",
      amountDue: extractAttr(balanceBlock, "balance", "amount_due") || "",
      amountPaid: extractAttr(balanceBlock, "balance", "amount_paid") || "",
      currency: extractAttr(balanceBlock, "balance", "currency") || "CHF",
    };
  }

  return result;
}
