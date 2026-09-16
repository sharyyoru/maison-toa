/** Canonical Word family names for legacy macOS PostScript font names. */
export async function normalizeDocxFonts(blob: Blob): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  let changed = false;
  for (const file of Object.values(zip.files)) {
    if (file.dir || !file.name.startsWith("word/") || !file.name.endsWith(".xml")) continue;
    const xml = await file.async("string");
    const normalized = xml.replace(/(<w:rFonts\b[^>]*>)/g, tag => tag.replace(
      /(w:(?:ascii|hAnsi|cs|eastAsia)=")TimesNewRomanPS(?:-BoldMT|MT)(")/g,
      "$1Times New Roman$2"
    ));
    if (normalized !== xml) { zip.file(file.name, normalized); changed = true; }
  }
  return changed ? zip.generateAsync({ type: "blob", mimeType: blob.type }) : blob;
}
