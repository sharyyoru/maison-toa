export async function sanitizeDocxForPreview(blob: Blob): Promise<Blob> {
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(blob);
  let changed = false;

  const xmlFiles = Object.keys(zip.files).filter(
    (fileName) =>
      fileName.startsWith("word/") &&
      fileName.endsWith(".xml") &&
      !zip.files[fileName].dir
  );

  for (const fileName of xmlFiles) {
    const file = zip.file(fileName);
    if (!file) continue;

    const xml = await file.async("string");
    const sanitizedXml = xml
      .replace(/<w:textDirection\b(?=[^>]*\bw:val="lrTb")[^>]*\/>/g, "")
      .replace(/<w:textDirection\b(?=[^>]*\bw:val="lrTb")[^>]*><\/w:textDirection>/g, "");

    if (sanitizedXml !== xml) {
      zip.file(fileName, sanitizedXml);
      changed = true;
    }
  }

  if (!changed) {
    return blob;
  }

  return zip.generateAsync({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}
