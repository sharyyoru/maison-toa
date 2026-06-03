/**
 * Shared HTML/XML escaping and conversion utilities.
 *
 * Previously duplicated across:
 *   - src/app/api/workflows/send-test-email/route.ts
 *   - src/app/api/workflows/deal-stage-changed/route.ts
 *   - src/app/api/emails/inbound/mailgun/route.ts
 *   - src/components/RichTextEditor.tsx
 *   - src/components/SignatureEditor.tsx
 *   - src/components/DocxEditor/DocxPreviewEditor.tsx
 *   - src/lib/medidata.ts
 */

/**
 * Escape basic HTML special characters (&, <, >).
 */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Escape all XML special characters (&, <, >, ", ').
 */
export function escapeXml(str: string): string {
  if (!str) return "";
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Convert plain text to simple HTML, escaping special characters and
 * replacing newlines with `<br />` tags.
 */
export function textToHtml(text: string): string {
  const escaped = escapeHtml(text);
  return escaped
    .split(/\r?\n/g)
    .map((line) => (line.length === 0 ? "<br />" : line))
    .join("<br />");
}
