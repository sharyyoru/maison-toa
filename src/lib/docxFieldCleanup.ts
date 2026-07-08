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

/**
 * Restores explicit "nil" border overrides that the eigenpal docx editor drops
 * when it re-serializes table cells or paragraphs that had explicit `none` borders.
 *
 * Background: Word documents use `<w:tcBorders>` (cell borders) and `<w:pBdr>`
 * (paragraph borders) with `w:val="none"` to suppress borders that would
 * otherwise be inherited from the table-level `<w:tblBorders>` definition.
 * The eigenpal editor's serializer omits border sides with `style === "none"`,
 * so after editing and saving a document, previously-hidden cell/paragraph borders
 * become visible as stray horizontal and vertical lines.
 *
 * Fix: for every `<w:tcBorders>` and `<w:pBdr>` element in the XML, add an
 * explicit `w:val="nil"` override for every standard border side (top, left,
 * bottom, right) that isn't already defined. `nil` is equivalent to `none` for
 * rendering but is distinct in the spec (nil = "no border at all", none = "no
 * border, but space is still reserved"). Both reliably suppress inherited borders.
 */
const BORDER_SIDES = ["top", "left", "bottom", "right"] as const;
const NIL_BORDER = (side: string) => `<w:${side} w:val="nil"/>`;
const FULL_NIL_TCBORDERS = `<w:tcBorders>${BORDER_SIDES.map(NIL_BORDER).join("")}</w:tcBorders>`;

/**
 * Fixes stray border lines introduced by the eigenpal editor's serializer
 * dropping explicit `none` border overrides from `<w:tcBorders>` and `<w:pBdr>`.
 *
 * The serializer's border-side function returns "" for any side with
 * style === "none" || "nil". When ALL sides are none, the `<w:tcBorders>`
 * wrapper element is also omitted entirely (empty output → skipped by the
 * parent serializer). Without any `<w:tcBorders>`, the cell inherits borders
 * from the table-level `<w:tblBorders>` definition, causing previously-hidden
 * borders to reappear as stray lines.
 *
 * Two-pass fix applied to word/document.xml (and header/footer XML):
 *   1. Any `<w:tcPr>` missing `<w:tcBorders>` gets a full nil override injected.
 *   2. Any `<w:tcBorders>` or `<w:pBdr>` present but missing some sides gets
 *      nil overrides for those sides.
 */
export function restoreDroppedBorderOverrides(xml: string): string {
  // Pass 1: inject a full nil <w:tcBorders> into every <w:tcPr> that has none.
  // This handles the case where eigenpal dropped the element entirely.
  let result = xml.replace(
    /(<w:tcPr\b[^>]*>)([\s\S]*?)(<\/w:tcPr>)/g,
    (match, open: string, content: string, close: string) => {
      if (content.includes("<w:tcBorders")) return match;
      return `${open}${content}${FULL_NIL_TCBORDERS}${close}`;
    }
  );

  // Pass 2: for any <w:tcBorders> or <w:pBdr> that exists but is missing
  // some of the four standard sides, fill in nil overrides for those sides.
  for (const tagName of ["w:tcBorders", "w:pBdr"] as const) {
    result = result.replace(
      new RegExp(`(<${tagName}>)([\\s\\S]*?)(<\\/${tagName}>)`, "g"),
      (match, open: string, content: string, close: string) => {
        const missing = BORDER_SIDES.filter(
          (side) => !new RegExp(`<w:${side}\\b`).test(content)
        );
        if (missing.length === 0) return match;
        return `${open}${content}${missing.map(NIL_BORDER).join("")}${close}`;
      }
    );
  }

  return result;
}
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
