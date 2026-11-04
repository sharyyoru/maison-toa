import { NextResponse } from "next/server";

const SUMEX_HOST =
  process.env.SUMEX_INVOICE_REQUEST_URL?.replace(/\/[^/]+$/, "") ||
  "http://34.100.230.253:8080";

/** Lightweight Sumex connectivity probe. Returns `{ online, latencyMs }`. */
export async function GET() {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    // A GET to the server root is the cheapest possible probe — Sumex returns
    // an HTML landing page or a 404 on the root, either of which proves TCP
    // connectivity and that the JVM is accepting requests.
    const res = await fetch(SUMEX_HOST, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return NextResponse.json({ online: res.ok || res.status < 500, latencyMs });
  } catch {
    return NextResponse.json({ online: false, latencyMs: Date.now() - start });
  }
}
