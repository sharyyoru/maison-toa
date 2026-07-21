/**
 * Supabase Storage object keys only accept a restricted character set.
 * Encode Unicode code points instead of discarding them so filenames remain
 * reversible and can still be shown exactly as entered in the document editor.
 */
export function encodeStorageFileName(fileName: string): string {
  return Array.from(fileName.normalize("NFC"), (character) => {
    if (/^[a-zA-Z0-9._-]$/.test(character)) return character;
    const codePoint = character.codePointAt(0);
    return codePoint === undefined
      ? "_"
      : `__u${codePoint.toString(16).toUpperCase()}__`;
  }).join("");
}

export function decodeStorageFileName(fileName: string): string {
  return fileName.replace(/__u([0-9A-F]{2,6})__/gi, (encoded, hex: string) => {
    const codePoint = Number.parseInt(hex, 16);
    return Number.isSafeInteger(codePoint) && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : encoded;
  });
}
