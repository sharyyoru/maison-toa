import { renderAsync } from "docx-preview";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";
import { sanitizeDocxForPreview } from "./docxPreviewSanitizer";

/**
 * Converts a DOCX blob into a PDF and triggers the browser save dialog.
 *
 * Uses docx-preview to render the document in an off-screen container, then
 * html2canvas captures each rendered page and jsPDF assembles them into a PDF.
 * This is a client-side workaround because the Vercel deployment does not have
 * a server-side DOCX→PDF converter such as LibreOffice available.
 */
export async function convertDocxBlobToPdf(blob: Blob, fileName: string): Promise<void> {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-99999px";
  container.style.top = "0";
  container.style.opacity = "0";
  container.style.pointerEvents = "none";
  container.style.width = "210mm";
  container.style.zIndex = "-1";
  document.body.appendChild(container);

  try {
    const sanitizedBlob = await sanitizeDocxForPreview(blob);

    await renderAsync(sanitizedBlob, container, undefined, {
      className: "docx-pdf-render",
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

    const pages = container.querySelectorAll(".docx-pdf-render .docx-wrapper > section.docx");
    if (pages.length === 0) {
      throw new Error("Document rendered with no pages");
    }

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();

    for (let i = 0; i < pages.length; i++) {
      const page = pages[i] as HTMLElement;
      const canvas = await html2canvas(page, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

      const imgData = canvas.toDataURL("image/png");
      if (i > 0) pdf.addPage();
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
    }

    const pdfFileName = fileName.replace(/\.docx$/i, "").concat(".pdf");
    pdf.save(pdfFileName);
  } finally {
    if (container.parentNode) {
      document.body.removeChild(container);
    }
  }
}
