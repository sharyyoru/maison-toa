/**
 * Removes Word mail-merge "NEXT" field instructions (used to iterate to the
 * next record) from a document.xml / header.xml / footer.xml string.
 *
 * These are leftover artifacts from mail-merge templates. A NEXT field has no
 * visible result of its own - it's a pure directive - so it is safe to
 * remove entirely. Left in place (or only partially removed), it can render
 * as extra blank lines, or as stray marks/vertical lines, because the
 * begin/separate/end markers that bracket a field must stay balanced: partial
 * removal leaves orphaned field-boundary markers that confuse renderers.
 *
 * Only the exact field span - from its `begin` marker to its matching `end`
 * marker - is removed, and only when the field's instruction is "NEXT". Any
 * other content sharing a run with those markers (e.g. visible text placed
 * right after the `end` marker in the same run) is left untouched.
 */
const FIELD_SPAN_TEST =
  /<w:fldChar\b[^>]*\bfldCharType="begin"[^>]*\/>[\s\S]*?<w:fldChar\b[^>]*\bfldCharType="end"[^>]*\/>/;
const IS_NEXT_FIELD = /<w:instrText\b[^>]*>\s*NEXT\b/i;

function stripNextFieldSpans(fragment: string): string {
  // Fresh RegExp per call - a global regex's lastIndex must never be shared
  // across separate replace() passes.
  const fieldSpan = new RegExp(FIELD_SPAN_TEST.source, "g");
  return fragment.replace(fieldSpan, (span) => (IS_NEXT_FIELD.test(span) ? "" : span));
}

export function removeNextFieldArtifacts(xml: string): string {
  // Drop paragraphs that, once their NEXT field spans are removed, have no
  // remaining visible content (text, images, breaks, tabs). This avoids
  // leaving behind a blank/vertical line where the merge field used to be.
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    if (!FIELD_SPAN_TEST.test(paragraph) || !IS_NEXT_FIELD.test(paragraph)) {
      return paragraph;
    }

    const cleaned = stripNextFieldSpans(paragraph);
    const hasVisibleText = /<w:t\b[^>]*>[^<]*[^\s<][^<]*<\/w:t>/.test(cleaned);
    const hasDrawing = /<w:(drawing|pict)\b/i.test(cleaned);
    const hasBreakOrTab = /<w:(br|tab)\b/i.test(cleaned);

    if (!hasVisibleText && !hasDrawing && !hasBreakOrTab) {
      return "";
    }
    return cleaned;
  });
}
