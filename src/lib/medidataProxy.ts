/**
 * MediData Proxy Client
 *
 * Communicates with the Railway-hosted proxy service that forwards
 * requests to MediData's servers in Switzerland (bypassing geoblocking).
 *
 * Proxy docs: POST /api/medidata/upload               → MediData POST /ela/uploads (multipart)
 *             POST /api/medidata/send-xml              → MediData POST /ela/uploads (raw XML)
 *             GET  /api/medidata/participants           → MediData GET  /ela/participants
 *             GET  /api/medidata/uploads/:ref/status    → MediData GET  /ela/uploads/{ref}/status
 *             GET  /api/medidata/downloads              → MediData GET  /ela/downloads
 *             GET  /api/medidata/downloads/:ref         → MediData GET  /ela/downloads/{ref}
 *             PUT  /api/medidata/downloads/:ref/status  → MediData PUT  /ela/downloads/{ref}/status
 *             GET  /api/medidata/notifications          → MediData GET  /ela/notifications
 *             PUT  /api/medidata/notifications/:id/status → MediData PUT /ela/notifications/{id}/status
 *             POST /api/medidata/proxy                  → Generic proxy for any MediData path
 */

const PROXY_BASE_URL =
  process.env.MEDIDATA_PROXY_URL ||
  "https://medidata-proxy-production.up.railway.app";
const PROXY_API_KEY = process.env.MEDIDATA_PROXY_API_KEY || "";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProxyResponse<T = unknown> = {
  success: boolean;
  status?: number;
  statusText?: string;
  data?: T;
  message?: string;
  error?: string;
  medidataStatus?: number;
  medidataResponse?: unknown;
};

export type UploadResult = {
  success: boolean;
  transmissionReference: string | null;
  statusCode: number;
  errorMessage: string | null;
  rawResponse: unknown;
};

export type UploadStatus = {
  transmissionReference: string;
  status: string;
  statusCode: number;
  rawResponse: unknown;
};

export type Participant = {
  glnParticipant: string;
  glnReceiver: string;
  name: string;
  street?: string;
  zipCode?: string;
  town?: string;
  lawTypes: number[];
  bagNumber?: string | null;
  tgTpChange?: boolean;
  tgAllowed?: boolean;
};

export type DownloadMessage = {
  transmissionReference: string;
  [key: string]: unknown;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function proxyHeaders(extra?: Record<string, string>): Record<string, string> {
  return {
    "x-api-key": PROXY_API_KEY,
    ...extra,
  };
}

async function proxyFetch<T = unknown>(
  path: string,
  init?: RequestInit,
): Promise<ProxyResponse<T>> {
  const url = `${PROXY_BASE_URL}${path}`;
  try {
    const res = await fetch(url, {
      ...init,
      headers: {
        ...proxyHeaders(),
        ...(init?.headers as Record<string, string> | undefined),
      },
    });
    const text = await res.text();
    let body: ProxyResponse<T>;
    try {
      body = JSON.parse(text) as ProxyResponse<T>;
    } catch {
      body = { success: res.ok, data: text as unknown as T };
    }
    if (!res.ok && body.success === undefined) {
      body.success = false;
    }
    body.status = body.status ?? res.status;
    return body;
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Upload XML invoice to MediData via the proxy (multipart/form-data).
 *
 * This is the recommended method per the proxy docs.
 */
export async function uploadInvoiceXml(
  xmlContent: string,
  filename: string = "invoice.xml",
  info?: Record<string, unknown>,
): Promise<UploadResult> {
  const MAX_RETRIES = 3;
  const RETRY_DELAYS = [0, 2000, 5000]; // ms

  // Log key XML elements before upload for debugging
  console.log(`[uploadInvoiceXml] Uploading ${filename} (${xmlContent.length} chars)`);
  const hasCopyToGuarantor = xmlContent.includes('print_copy_to_guarantor');
  const hasOnline = xmlContent.includes('<invoice:online');
  const hasPhone = xmlContent.includes('<invoice:phone');
  const hasGuarantor = xmlContent.includes('<invoice:guarantor');
  console.log(`[uploadInvoiceXml] XML flags: print_copy_to_guarantor=${hasCopyToGuarantor}, online/email=${hasOnline}, phone=${hasPhone}, guarantor=${hasGuarantor}`);
  // Log processing section
  const procMatch = xmlContent.match(/<invoice:processing[\s\S]*?<\/invoice:processing>/);
  if (procMatch) console.log(`[uploadInvoiceXml] <processing>: ${procMatch[0].substring(0, 500)}`);
  // Log patient section (first 500 chars)
  const patMatch = xmlContent.match(/<invoice:patient[\s\S]*?<\/invoice:patient>/);
  if (patMatch) console.log(`[uploadInvoiceXml] <patient>: ${patMatch[0].substring(0, 500)}`);
  // Log guarantor section
  const guarMatch = xmlContent.match(/<invoice:guarantor[\s\S]*?<\/invoice:guarantor>/);
  if (guarMatch) console.log(`[uploadInvoiceXml] <guarantor>: ${guarMatch[0].substring(0, 500)}`);

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (attempt > 0) {
      console.log(`[uploadInvoiceXml] Retry ${attempt}/${MAX_RETRIES - 1} after ${RETRY_DELAYS[attempt]}ms…`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS[attempt]));
    }

    // Try multipart upload first, fall back to raw XML on 403
    const useRaw = attempt >= 2;
    let res: ProxyResponse<Record<string, unknown>>;

    if (useRaw) {
      // Fallback: send raw XML via /api/medidata/send-xml
      const headers: Record<string, string> = {
        "Content-Type": "application/xml",
        "x-filename": filename,
      };
      if (info) headers["x-info"] = JSON.stringify(info);
      res = await proxyFetch<Record<string, unknown>>("/api/medidata/send-xml", {
        method: "POST",
        headers,
        body: xmlContent,
      });
    } else {
      // Primary: multipart form-data via /api/medidata/upload
      const formData = new FormData();
      const xmlBlob = new Blob([xmlContent], { type: "application/xml" });
      formData.append("file", xmlBlob, filename);
      if (info) formData.append("info", JSON.stringify(info));
      res = await proxyFetch<Record<string, unknown>>("/api/medidata/upload", {
        method: "POST",
        body: formData,
      });
    }

    if (res.success && res.data) {
      const data = res.data as Record<string, unknown>;
      const ref =
        (data.transmissionReference ??
          data.id ??
          data.messageId ??
          data.message_id ??
          null) as string | null;
      return {
        success: true,
        transmissionReference: ref,
        statusCode: res.status ?? 200,
        errorMessage: null,
        rawResponse: res,
      };
    }

    // If 403 and we have retries left, retry
    const status = res.status ?? res.medidataStatus ?? 0;
    if (status === 403 && attempt < MAX_RETRIES - 1) {
      console.warn(`[uploadInvoiceXml] Got 403 on attempt ${attempt + 1}, retrying…`);
      continue;
    }

    return {
      success: false,
      transmissionReference: null,
      statusCode: status,
      errorMessage: res.message || res.error || "Upload failed",
      rawResponse: res,
    };
  }

  // Should not reach here
  return {
    success: false,
    transmissionReference: null,
    statusCode: 0,
    errorMessage: "All upload retries exhausted",
    rawResponse: null,
  };
}

/**
 * Upload XML invoice via raw XML body (alternative method).
 */
export async function sendRawXml(
  xmlContent: string,
  filename: string = "invoice.xml",
  info?: Record<string, unknown>,
): Promise<UploadResult> {
  const headers: Record<string, string> = {
    "Content-Type": "application/xml",
    "x-filename": filename,
  };
  if (info) {
    headers["x-info"] = JSON.stringify(info);
  }

  const res = await proxyFetch<Record<string, unknown>>("/api/medidata/send-xml", {
    method: "POST",
    headers,
    body: xmlContent,
  });

  if (res.success && res.data) {
    const data = res.data as Record<string, unknown>;
    const ref =
      (data.transmissionReference ??
        data.id ??
        data.messageId ??
        null) as string | null;
    return {
      success: true,
      transmissionReference: ref,
      statusCode: res.status ?? 200,
      errorMessage: null,
      rawResponse: res,
    };
  }

  return {
    success: false,
    transmissionReference: null,
    statusCode: res.status ?? res.medidataStatus ?? 0,
    errorMessage: res.message || res.error || "Send XML failed",
    rawResponse: res,
  };
}

/**
 * Check upload / transmission status.
 */
export async function getUploadStatus(
  transmissionReference: string,
): Promise<UploadStatus> {
  const res = await proxyFetch<Record<string, unknown>>(
    `/api/medidata/uploads/${encodeURIComponent(transmissionReference)}/status`,
  );
  return {
    transmissionReference,
    status: res.success ? "ok" : "error",
    statusCode: res.status ?? 0,
    rawResponse: res,
  };
}

/**
 * Fetch participant (insurer) list from MediData.
 */
export async function getParticipants(
  query?: { limit?: number; offset?: number; glnparticipant?: string; lawtype?: number; name?: string },
): Promise<Participant[]> {
  let path = "/api/medidata/participants";
  if (query) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null) params.set(k, String(v));
    }
    const qs = params.toString();
    if (qs) path += `?${qs}`;
  }
  const res = await proxyFetch<Participant[]>(path);
  if (res.success && Array.isArray(res.data)) {
    return res.data;
  }
  console.warn("[MediDataProxy] getParticipants failed:", res.message || res.error);
  return [];
}

/**
 * Fetch incoming download messages (insurer responses).
 */
export async function getDownloads(): Promise<DownloadMessage[]> {
  const res = await proxyFetch<DownloadMessage[]>("/api/medidata/downloads");
  if (res.success && Array.isArray(res.data)) {
    return res.data;
  }
  return [];
}

/**
 * Fetch a specific download by reference.
 */
export async function getDownload(ref: string): Promise<ProxyResponse> {
  return proxyFetch(`/api/medidata/downloads/${encodeURIComponent(ref)}`);
}

/**
 * Confirm a download (mark as received).
 */
export async function confirmDownload(ref: string): Promise<boolean> {
  const res = await proxyFetch(
    `/api/medidata/downloads/${encodeURIComponent(ref)}/status`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CONFIRMED" }),
    },
  );
  return res.success === true;
}

/**
 * Fetch notifications.
 */
export async function getNotifications(): Promise<ProxyResponse> {
  return proxyFetch("/api/medidata/notifications");
}

/**
 * Mark a notification as fetched.
 * Body must be { notificationFetched: true } per MediData API spec.
 */
export async function confirmNotification(notificationId: number | string): Promise<boolean> {
  const res = await proxyFetch(
    `/api/medidata/notifications/${encodeURIComponent(String(notificationId))}/status`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationFetched: true }),
    },
  );
  return res.success === true;
}

/**
 * Generic proxy for any MediData API path not covered by the typed functions.
 * Uses the proxy's POST /api/medidata/proxy endpoint.
 */
export async function proxyRequest(
  method: string,
  path: string,
  data?: unknown,
  headers?: Record<string, string>,
): Promise<ProxyResponse> {
  return proxyFetch("/api/medidata/proxy", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, path, data, headers }),
  });
}

/**
 * Test proxy connectivity.
 */
export async function testConnection(): Promise<{
  success: boolean;
  message: string;
}> {
  try {
    const res = await fetch(`${PROXY_BASE_URL}/health`);
    if (res.ok) {
      return { success: true, message: "Proxy is reachable" };
    }
    return { success: false, message: `Proxy returned HTTP ${res.status}` };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : "Network error",
    };
  }
}
