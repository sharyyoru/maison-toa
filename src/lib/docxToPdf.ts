import "@docx-editor.dev/core/styles/editor.css";
import { normalizeDocxFonts } from "./docxFontNormalization";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { packagedFonts } from "@docx-editor.dev/fonts";
import { openFontBackedDocumentForExport } from "@docx-editor.dev/core/export";
import { paintSemanticLayout } from "@docx-editor.dev/core/output";

/** Render using the same font-backed layout and page painter as the DOCX editor. */
export async function convertDocxBlobToPdf(blob: Blob, fileName: string): Promise<void> {
  const opened = await openFontBackedDocumentForExport(
    new Uint8Array(await (await normalizeDocxFonts(blob)).arrayBuffer()),
    { fonts: packagedFonts(), fontPolicy: "strict" }
  );
  if (!opened.ok) throw new Error("Unable to open document for PDF export");
  const { session } = opened;
  const container = document.createElement("div");
  container.className = "docx-editor";
  Object.assign(container.style, { position: "fixed", left: "-100000px", top: "0", pointerEvents: "none" });
  const faces: FontFace[] = [];
  const aliases = new Map<string, string>();
  document.body.appendChild(container);
  try {
    // Private aliases keep the document's font substitutions out of the app's CSS.
    for (const family of session.fontResolution.families) {
      const alias = `docx-export-${crypto.randomUUID()}`;
      aliases.set(family.family.toLowerCase(), alias);
      for (const face of family.faces) {
        const admitted = session.admittedFontFace({ family: family.family, weight: face.weight, style: face.style });
        if (!admitted) throw new Error(`Missing PDF font: ${family.family}`);
        const font = new FontFace(alias, new Uint8Array(admitted.bytes).buffer, { weight: String(face.weight), style: face.style });
        await font.load();
        document.fonts.add(font);
        faces.push(font);
      }
    }
    const layout = await session.layout();
    paintSemanticLayout(container, layout, {
      scale: 96 / 72,
      fontAlias: family => aliases.get(family.toLowerCase()),
      defaultFontFamily: session.fontResolution.defaultFamily,
      showParagraphMarks: false,
      fieldShading: "never",
    });
    await document.fonts.ready;
    await Promise.all(Array.from(container.querySelectorAll("img")).map(img => img.decode()));
    const pages = Array.from(container.querySelectorAll<HTMLElement>(".docx-page"));
    if (!pages.length || pages.length !== layout.pages.length) throw new Error("PDF page layout is incomplete");
    let pdf: jsPDF | undefined;
    for (let i = 0; i < pages.length; i++) {
      const { width, height } = layout.pages[i].box;
      const orientation = width > height ? "landscape" : "portrait";
      if (!pdf) pdf = new jsPDF({ orientation, unit: "pt", format: [width, height] });
      else pdf.addPage([width, height], orientation);
      const page = pages[i];
      page.style.boxShadow = "none";
      const canvas = await html2canvas(page, { scale: 2, backgroundColor: "#ffffff", logging: false, useCORS: true });
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
    }
    pdf!.save(fileName.replace(/\.docx$/i, "") + ".pdf");
  } finally {
    container.remove();
    faces.forEach(face => document.fonts.delete(face));
    session.dispose();
  }
}
