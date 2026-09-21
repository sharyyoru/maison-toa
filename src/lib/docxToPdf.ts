import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { sanitizeDocxForPreview } from "./docxPreviewSanitizer";

const CSS_PIXELS_PER_POINT = 96 / 72;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

async function materializePage(page: HTMLElement): Promise<void> {
  page.scrollIntoView({ block: "center", inline: "center" });
  for (let attempt = 0; attempt < 20; attempt += 1) {
    await nextPaint();
    if (page.dataset.materialized !== "false") return;
  }
  throw new Error("A document page could not be prepared for PDF export");
}

/** Export the exact pages already laid out and painted by the live editor. */
export async function convertRenderedDocxToPdf(
  editorViewport: HTMLElement,
  fileName: string
): Promise<void> {
  await document.fonts.ready;
  const pages = Array.from(
    editorViewport.querySelectorAll<HTMLElement>(".docx-page")
  );
  if (pages.length === 0) throw new Error("The editor has no pages to export");

  const previousScrollTop = editorViewport.scrollTop;
  const previousScrollLeft = editorViewport.scrollLeft;
  let pdf: jsPDF | undefined;

  try {
    for (const page of pages) {
      await materializePage(page);
      await Promise.all(
        Array.from(page.querySelectorAll("img")).map((image) => image.decode())
      );

      // Ignore the view zoom while retaining the editor's exact page layout.
      const width = page.offsetWidth / CSS_PIXELS_PER_POINT;
      const height = page.offsetHeight / CSS_PIXELS_PER_POINT;
      const orientation = width > height ? "landscape" : "portrait";
      const oldShadow = page.style.boxShadow;
      page.style.boxShadow = "none";

      try {
        const canvas = await html2canvas(page, {
          scale: 2,
          backgroundColor: "#ffffff",
          logging: false,
          useCORS: true,
          // Ask the browser to rasterize the already-laid-out DOM. The default
          // canvas text painter recalculates baselines and can move text down
          // far enough for table borders to cross headings.
          foreignObjectRendering: true,
          onclone: async (clonedDocument) => {
            // The editor registers its metric-compatible fonts dynamically.
            // html2canvas uses a cloned document, so copy those loaded faces or
            // it silently falls back to platform fonts with different metrics.
            for (const font of document.fonts) {
              clonedDocument.fonts.add(font);
            }
            await clonedDocument.fonts.ready;
          },
        });
        if (!pdf) {
          pdf = new jsPDF({ orientation, unit: "pt", format: [width, height] });
        } else {
          pdf.addPage([width, height], orientation);
        }
        pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
      } finally {
        page.style.boxShadow = oldShadow;
      }
    }

    pdf!.save(fileName.replace(/\.docx$/i, "") + ".pdf");
  } finally {
    editorViewport.scrollTo(previousScrollLeft, previousScrollTop);
  }
}

/** Fallback for DOCX files downloaded from the document list without an open editor. */
export async function convertDocxBlobToPdf(
  blob: Blob,
  fileName: string
): Promise<void> {
  const { renderAsync } = await import("docx-preview");
  const container = document.createElement("div");
  Object.assign(container.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    pointerEvents: "none",
  });
  document.body.appendChild(container);

  try {
    await renderAsync(await sanitizeDocxForPreview(blob), container, undefined, {
      inWrapper: true,
      ignoreWidth: false,
      ignoreHeight: false,
      ignoreFonts: false,
      breakPages: true,
      experimental: true,
      useBase64URL: true,
      renderHeaders: true,
      renderFooters: true,
    });
    await document.fonts.ready;

    const pages = Array.from(
      container.querySelectorAll<HTMLElement>("section.docx")
    );
    if (pages.length === 0) throw new Error("Document rendered with no pages");

    let pdf: jsPDF | undefined;
    for (const page of pages) {
      const width = page.offsetWidth / CSS_PIXELS_PER_POINT;
      const height = page.offsetHeight / CSS_PIXELS_PER_POINT;
      const orientation = width > height ? "landscape" : "portrait";
      const canvas = await html2canvas(page, {
        scale: 2,
        backgroundColor: "#ffffff",
        logging: false,
        useCORS: true,
      });
      if (!pdf) {
        pdf = new jsPDF({ orientation, unit: "pt", format: [width, height] });
      } else {
        pdf.addPage([width, height], orientation);
      }
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", 0, 0, width, height);
    }
    pdf!.save(fileName.replace(/\.docx$/i, "") + ".pdf");
  } finally {
    container.remove();
  }
}
