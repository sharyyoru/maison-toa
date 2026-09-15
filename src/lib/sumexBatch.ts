// ============================================================================
// Batch transport for the Sumex1 REST proxy.
//
// The Windows proxy (v2) exposes POST /batch which executes an ordered list of
// Sumex calls VM-locally (~1 ms per hop) and returns per-call results — vs one
// WAN round-trip per COM call otherwise. This module probes for /batch support
// once per origin and transparently falls back to sequential execution when
// the proxy is v1, so either side can be deployed first.
// ============================================================================

export type SumexCall = {
  method?: "GET" | "POST";
  path: string; // full path incl. server prefix, e.g. "/generalInvoiceRequestManagerServer500/IAddress/SetPostal"
  body?: Record<string, unknown>;
};

export type SumexCallResult = {
  status?: number;
  ms?: number;
  json?: any;
  text?: string;
  error?: string;
  skipped?: boolean;
};

const probeCache = new Map<string, Promise<boolean>>();

/** True when the proxy at `origin` supports POST /batch (cached per origin). */
export function batchSupported(origin: string): Promise<boolean> {
  let cached = probeCache.get(origin);
  if (!cached) {
    cached = (async () => {
      try {
        const res = await fetch(`${origin}/batch`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ calls: [] }),
          cache: "no-store",
          signal: AbortSignal.timeout(4000),
        });
        // v2 answers 400 ("calls must be a non-empty array"); v1 has no route (404).
        const supported = res.status === 400;
        console.log(`[SumexBatch] /batch support at ${origin}: ${supported}`);
        return supported;
      } catch (err) {
        console.warn(`[SumexBatch] /batch probe failed at ${origin}, using sequential:`, err);
        return false;
      }
    })();
    probeCache.set(origin, cached);
    // Don't cache a transient network failure forever.
    cached.then((ok) => {
      if (!ok) setTimeout(() => probeCache.delete(origin), 5 * 60_000);
    });
  }
  return cached;
}

/**
 * Execute an ordered list of Sumex calls.
 * Uses POST /batch when available; otherwise runs them sequentially with the
 * same result shape and stop-on-error semantics.
 *
 * A call counts as failed when: transport error, HTTP >= 400, or the JSON body
 * has `pbStatus === false`. With stopOnError (default), the remaining calls
 * are skipped (`{skipped: true}`).
 */
export async function runSumexCalls(
  origin: string,
  calls: SumexCall[],
  opts?: { stopOnError?: boolean; timeoutMs?: number },
): Promise<SumexCallResult[]> {
  const stopOnError = opts?.stopOnError ?? true;
  if (calls.length === 0) return [];

  if (calls.length > 1 && (await batchSupported(origin))) {
    try {
      const res = await fetch(`${origin}/batch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calls, stopOnError }),
        cache: "no-store",
        signal: AbortSignal.timeout(opts?.timeoutMs ?? 120_000),
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data?.results) && data.results.length === calls.length) {
          return data.results as SumexCallResult[];
        }
        console.warn(`[SumexBatch] Unexpected /batch response shape — falling back to sequential`);
      } else {
        console.warn(`[SumexBatch] /batch returned ${res.status} — falling back to sequential`);
      }
    } catch (err) {
      console.warn(`[SumexBatch] /batch request failed — falling back to sequential:`, err);
    }
  }

  // Sequential fallback (identical semantics)
  const results: SumexCallResult[] = [];
  let aborted = false;
  for (const call of calls) {
    if (aborted) {
      results.push({ skipped: true });
      continue;
    }
    const t0 = Date.now();
    try {
      const res = await fetch(`${origin}${call.path}`, {
        method: call.method ?? "POST",
        headers: call.body !== undefined ? { "Content-Type": "application/json" } : undefined,
        body: call.body !== undefined ? JSON.stringify(call.body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(60_000),
      });
      const entry: SumexCallResult = { status: res.status, ms: Date.now() - t0 };
      const text = await res.text();
      try {
        entry.json = JSON.parse(text);
      } catch {
        entry.text = text;
      }
      results.push(entry);
      const failed = res.status >= 400 || (entry.json && entry.json.pbStatus === false);
      if (failed && stopOnError) aborted = true;
    } catch (err: any) {
      results.push({ error: err?.message || String(err), ms: Date.now() - t0 });
      if (stopOnError) aborted = true;
    }
  }
  return results;
}
