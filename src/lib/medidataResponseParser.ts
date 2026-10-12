/**
 * Parser for MediData / Forum Datenaustausch `generalInvoiceResponse_500`
 * insurer responses.
 *
 * Extracted from the poll route so that the live poller and
 * scripts/medidata/backfill-response-errors.mjs parse historical and new
 * responses with identical logic — if they diverged, the backfilled history
 * would not be comparable with anything recorded going forward.
 *
 * Regex rather than an XML parser: the payload is flat attributes on a handful
 * of known elements, this matches the existing style in the route, and it
 * avoids adding a dependency to a server route on the critical billing path.
 */

export type MedidataResponseError = {
  /** Insurer reject code, e.g. "000125", "406", "59109". */
  code: string;
  /** Human-readable reason as sent by the insurer. */
  text: string | null;
  /** Service-line reference, when the error is line-specific. */
  recordId: string | null;
};

export type ParsedMedidataResponse = {
  type: 'accepted' | 'rejected' | 'pending' | 'unknown';
  statusIn: string;
  statusOut: string;
  explanation: string;
  /** Every <invoice:error> in the document, in document order. */
  errors: MedidataResponseError[];
  /**
   * The insurer's `allowModification` flag. Observed `false` on 329 of 333
   * responses — i.e. insurers refuse in-place amendment, which is why a
   * duplicate requires a Storno rather than a corrected resend.
   */
  allowModification: boolean | null;
};

/** Decode the XML entities that appear in insurer message text. */
export function decodeXmlEntities(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    // Ampersand last, so "&amp;lt;" does not become "<".
    .replace(/&amp;/g, '&');
}

function attributes(fragment: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of fragment.matchAll(/([A-Za-z_][\w:-]*)\s*=\s*"([^"]*)"/g)) {
    out[m[1]] = m[2];
  }
  return out;
}

/** Extract every `<invoice:error .../>` element. */
export function parseResponseErrors(content: string): MedidataResponseError[] {
  const errors: MedidataResponseError[] = [];
  if (!content) return errors;

  for (const m of content.matchAll(/<(?:\w+:)?error\b([^>]*?)\/?>/g)) {
    const attrs = attributes(m[1] ?? '');
    const code = (attrs.code ?? '').trim();
    if (!code) continue; // nothing actionable without a code
    errors.push({
      code,
      text: attrs.text ? decodeXmlEntities(attrs.text).trim() || null : null,
      recordId: attrs.record_id ? String(attrs.record_id).trim() : null,
    });
  }
  return errors;
}

/**
 * The single code that best represents the rejection. An invoice-level error
 * (no `record_id`) is preferred over line-level ones, because that is the one
 * that determines whether a Storno is required.
 */
export function primaryErrorCode(errors: MedidataResponseError[]): string | null {
  if (!errors.length) return null;
  const invoiceLevel = errors.find((e) => !e.recordId);
  return (invoiceLevel ?? errors[0]).code;
}

export function parseResponseXml(content: string): ParsedMedidataResponse {
  let type: ParsedMedidataResponse['type'] = 'unknown';
  let statusIn = '';
  let statusOut = '';
  let explanation = '';

  const safe = content ?? '';

  // NOTE: status_in/status_out are frequently the literal string "unknown" in
  // the insurer payload itself. That is not a parsing failure — it is why the
  // structured <invoice:error> codes below are the reliable signal and why
  // insurance_response_code must not be populated from statusOut.
  const statusMatch = safe.match(/status_in="([^"]*)"[^>]*status_out="([^"]*)"/);
  if (statusMatch) {
    statusIn = statusMatch[1];
    statusOut = statusMatch[2];
  }

  if (safe.includes('<invoice:accepted') || safe.includes('status_out="granted"')) {
    type = 'accepted';
  } else if (safe.includes('<invoice:rejected') || safe.includes('status_out="refused"')) {
    type = 'rejected';
  } else if (safe.includes('<invoice:pending') || safe.includes('status_out="pending"')) {
    type = 'pending';
  }

  const explMatch = safe.match(/<invoice:explanation>([^<]+)<\/invoice:explanation>/);
  if (explMatch) explanation = decodeXmlEntities(explMatch[1]);

  if (!explanation) {
    const textMatch = safe.match(/<invoice:text>([^<]+)<\/invoice:text>/);
    if (textMatch) explanation = decodeXmlEntities(textMatch[1]);
  }

  const errors = parseResponseErrors(safe);

  // Fall back to the error texts when the insurer sent no <explanation>.
  if (!explanation && errors.length) {
    explanation = errors
      .map((e, i) => `${i + 1}) ${e.text ?? e.code}`)
      .join(' ');
  }

  const allowMatch = safe.match(/allowModification="([^"]*)"/);
  const allowModification = allowMatch ? allowMatch[1] === 'true' : null;

  return { type, statusIn, statusOut, explanation, errors, allowModification };
}
