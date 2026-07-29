/**
 * Retell AI integration helpers.
 * Server-side only — uses service-role env vars.
 */

export const RETELL_API_BASE = "https://api.retellai.com";
export const RETELL_API_KEY = process.env.RETELL_API_KEY ?? "";
export const RETELL_AGENT_ID = process.env.RETELL_AGENT_ID ?? "";
export const RETELL_FROM_NUMBER = process.env.RETELL_FROM_NUMBER ?? "";

export type RetellCallPayload = {
  from_number: string;
  to_number: string;
  agent_id: string;
  webhook_url?: string;
  retell_llm_dynamic_variables: Record<string, string>;
  metadata?: Record<string, string>;
};

export type RetellCallResponse = {
  call_id: string;
  call_status: string;
  [key: string]: unknown;
};

/**
 * Create an outbound phone call via Retell AI.
 */
export async function createRetellCall(
  payload: RetellCallPayload,
): Promise<RetellCallResponse> {
  const body = {
    from_number: payload.from_number,
    to_number: payload.to_number,
    override_agent_id: payload.agent_id,
    override_agent_version: "latest_published",
    agent_override: {
      agent: {
        webhook_url: payload.webhook_url,
        webhook_events: ["call_started", "call_ended", "call_analyzed"],
        webhook_timeout_ms: 10000,
      },
    },
    retell_llm_dynamic_variables: payload.retell_llm_dynamic_variables,
    metadata: payload.metadata ?? {},
  };

  console.log("[Retell] create-phone-call payload:", JSON.stringify(body, null, 2));

  const res = await fetch(`${RETELL_API_BASE}/v2/create-phone-call`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RETELL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseText = await res.text().catch(() => "");
  console.log(`[Retell] create-phone-call response status: ${res.status}, body:`, responseText);

  if (!res.ok) {
    throw new Error(`Retell API error ${res.status}: ${responseText}`);
  }

  return JSON.parse(responseText) as RetellCallResponse;
}

/**
 * Normalize a Swiss/international phone number to E.164.
 */
export function normalizePhone(raw: string): string {
  let digits = raw.replace(/[\s\-().]/g, "");

  if (digits.startsWith("00")) {
    digits = `+${digits.slice(2)}`;
  }

  if (!digits.startsWith("+")) {
    if (digits.startsWith("0")) {
      digits = `+41${digits.slice(1)}`;
    } else if (digits.startsWith("41")) {
      digits = `+${digits}`;
    } else {
      digits = `+${digits}`;
    }
  }

  return digits;
}
