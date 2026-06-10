import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const requestUrl = process.env.SUMEX_INVOICE_REQUEST_URL;
  const responseUrl = process.env.SUMEX_INVOICE_RESPONSE_URL;
  const acfUrl = process.env.SUMEX_ACF_URL;
  const acfBaseUrl = process.env.SUMEX_ACF_BASE_URL;
  const tardocUrl = process.env.SUMEX_TARDOC_URL;

  // Test reachability of the request URL
  const effectiveUrl = requestUrl || "http://34.100.230.253:8080/generalInvoiceRequestManagerServer500";
  let reachable = false;
  let reachableError = "";
  try {
    const r = await fetch(`${effectiveUrl}/IGeneralInvoiceRequestManager/GetCreateGeneralInvoiceRequestManager`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    reachable = r.ok;
    reachableError = r.ok ? "" : `HTTP ${r.status}`;
  } catch (e: any) {
    reachableError = e.message;
  }

  return NextResponse.json({
    env: {
      SUMEX_INVOICE_REQUEST_URL: requestUrl ?? "(not set — using hardcoded fallback)",
      SUMEX_INVOICE_RESPONSE_URL: responseUrl ?? "(not set)",
      SUMEX_ACF_URL: acfUrl ?? "(not set)",
      SUMEX_ACF_BASE_URL: acfBaseUrl ?? "(not set)",
      SUMEX_TARDOC_URL: tardocUrl ?? "(not set)",
    },
    effectiveRequestUrl: effectiveUrl,
    reachable,
    reachableError,
  });
}
