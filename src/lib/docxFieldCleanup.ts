/**
 * Removes Word mail-merge "NEXT" field instructions (used to iterate to the
 * next record) and their begin/separate/end field-character markers from a
 * document.xml / header.xml / footer.xml string.
 *
 * These are leftover artifacts from mail-merge templates. Left in place they
 * render as extra blank lines/paragraphs when the document is opened outside
 * of Word's mail-merge context (e.g. in a WYSIWYG editor or an HTML preview).
 */
export function removeNextFieldArtifacts(xml: string): string {
  const stripFieldRuns = (input: string): string => {
    let result = input.replace(
      /<w:r>(?:[^<]|<(?!\/w:r>))*?<w:instrText[^>]*>\s*NEXT\s*<\/w:instrText>(?:[^<]|<(?!\/w:r>))*?<\/w:r>/gi,
      ""
    );
    result = result.replace(
      /<w:r>\s*<w:fldChar[^>]*\bfldCharType="(?:begin|separate|end)"[^>]*\/>\s*<\/w:r>/gi,
      ""
    );
    return result;
  };

  // Drop entire paragraphs that, once the field runs are stripped, have no
  // remaining visible content (text, images, breaks, tabs). This avoids
  // leaving behind a blank line where the merge field used to be.
  return xml.replace(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g, (paragraph) => {
    const hadField =
      /<w:instrText[^>]*>\s*NEXT\s*<\/w:instrText>/i.test(paragraph) ||
      /<w:fldChar\b/i.test(paragraph);
    if (!hadField) return paragraph;

    const cleaned = stripFieldRuns(paragraph);
    const hasVisibleText = /<w:t\b[^>]*>[^<]*[^\s<][^<]*<\/w:t>/.test(cleaned);
    const hasDrawing = /<w:(drawing|pict)\b/i.test(cleaned);
    const hasBreakOrTab = /<w:(br|tab)\b/i.test(cleaned);

    if (!hasVisibleText && !hasDrawing && !hasBreakOrTab) {
      return "";
    }
    return cleaned;
  });
}
