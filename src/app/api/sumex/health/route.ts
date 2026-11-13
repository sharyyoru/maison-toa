import { NextResponse } from "next/server";
import { getParticipants } from "@/lib/medidataProxy";

const SUMEX_HOST =
  process.env.SUMEX_INVOICE_REQUEST_URL?.replace(/\/[^/]+$/, "") ||
  "http://34.100.230.253:8080";

const PROBE_TIMEOUT_MS = 8_000;

/**
 * Connectivity probe for the services insurance billing depends on.
 * Invoice XML is generated natively unless SUMEX_USE_SERVER=1, so by default
 * only the MediData proxy (transmission to insurers) is checked.
 * Returns `{ online, latencyMs, service }`.
 */
export async function GET() {
  const start = Date.now();

  if (process.env.SUMEX_USE_SERVER !== "1") {
    const participants = await Promise.race([
      getParticipants({ lawtype: 1, limit: 1 }).catch(() => []),
      new Promise<never[]>((resolve) => setTimeout(() => resolve([]), PROBE_TIMEOUT_MS)),
    ]);
    return NextResponse.json({
      online: participants.length > 0,
      latencyMs: Date.now() - start,
      service: "medidata",
    });
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    // A GET to the server root is the cheapest possible probe — Sumex returns
    // an HTML landing page or a 404 on the root, either of which proves TCP
    // connectivity and that the JVM is accepting requests.
    const res = await fetch(SUMEX_HOST, { signal: controller.signal });
    clearTimeout(timer);
    const latencyMs = Date.now() - start;
    return NextResponse.json({ online: res.ok || res.status < 500, latencyMs, service: "sumex" });
  } catch {
    return NextResponse.json({ online: false, latencyMs: Date.now() - start, service: "sumex" });
  }
}
