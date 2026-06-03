/**
 * Shared template rendering utilities.
 *
 * Previously duplicated across:
 *   - src/app/api/workflows/send-test-email/route.ts
 *   - src/app/api/workflows/deal-stage-changed/route.ts
 *   - src/app/api/workflows/resend-whatsapp/route.ts
 *   - src/lib/email.ts (sanitizeTelLinks)
 */

/**
 * Resolve a dot-separated path on an unknown object, e.g. "patient.firstName".
 */
export function resolvePath(object: unknown, path: string): unknown {
  const parts = path
    .split(".")
    .map((part) => part.trim())
    .filter(Boolean);

  return parts.reduce<unknown>((current, key) => {
    if (!current || typeof current !== "object") return undefined;
    if (!(key in (current as Record<string, unknown>))) return undefined;
    return (current as Record<string, unknown>)[key];
  }, object);
}

/**
 * Decode HTML-encoded curly braces that Unlayer / rich-text editors produce.
 */
export function decodeHtmlEntities(str: string): string {
  return str
    .replace(/&#123;/g, "{")
    .replace(/&#125;/g, "}")
    .replace(/&lbrace;/g, "{")
    .replace(/&rbrace;/g, "}")
    .replace(/&#x7b;/gi, "{")
    .replace(/&#x7d;/gi, "}");
}

/**
 * Render a Mustache-style `{{ path }}` template against a context object.
 */
export function renderTemplate(template: string, context: unknown): string {
  if (!template) return "";

  const decoded = decodeHtmlEntities(template);

  return decoded.replace(/{{\s*([^}]+?)\s*}}/g, (_match, rawPath) => {
    const value = resolvePath(context, String(rawPath).trim());
    if (value === undefined || value === null) return "";
    return String(value);
  });
}

/**
 * Sanitize tel: links for iPhone compatibility.
 * Decodes URL-encoded protocols and strips non-digit characters from phone
 * numbers so that iOS correctly interprets them.
 */
export function sanitizeTelLinks(html: string): string {
  let result = html.replace(/href\s*=\s*(["'])tel%3A/gi, "href=$1tel:");
  result = result.replace(/href\s*=\s*(["'])tel:%2B/gi, "href=$1tel:+");

  result = result.replace(
    /href\s*=\s*["']tel:([^"']+)["']/gi,
    (_match, phoneNumber) => {
      let decoded = phoneNumber;
      try {
        decoded = decodeURIComponent(phoneNumber);
      } catch {
        // If decoding fails, use original
      }
      decoded = decoded
        .replace(/&nbsp;/gi, "")
        .replace(/&#160;/g, "")
        .replace(/&amp;/gi, "&")
        .replace(/&plus;/gi, "+")
        .replace(/\u00A0/g, "");

      const cleaned = decoded.replace(/[^0-9+]/g, "");
      return `href="tel:${cleaned}"`;
    }
  );

  return result;
}
