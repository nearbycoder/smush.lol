import { PDFDocument } from "pdf-lib";
import { pdfLayout } from "./collection-layout";
export interface PdfImage { bytes: Uint8Array; width: number; height: number }
export async function imagesPdf(images: AsyncIterable<PdfImage> | Iterable<PdfImage>, paper: string, landscape: boolean, margin: number, signal: AbortSignal): Promise<Blob> {
  const pdf = await PDFDocument.create();
  pdf.setTitle("Images from smush.lol"); pdf.setCreator("smush.lol");
  let count = 0, bytes = 0;
  for await (const image of images) {
    signal.throwIfAborted(); count++; bytes += image.bytes.length;
    if (count > 50 || bytes > 100 * 1024 * 1024) throw new Error("Keep the PDF under 50 pages and 100 MB of image data.");
    const layout = pdfLayout(image.width, image.height, paper, landscape, margin);
    const embedded = await pdf.embedPng(image.bytes);
    const page = pdf.addPage([layout.pageWidth, layout.pageHeight]);
    page.drawImage(embedded, { x: layout.x, y: layout.y, width: layout.width, height: layout.height });
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  if (!count) throw new Error("Choose at least one image.");
  signal.throwIfAborted(); const output = await pdf.save(); signal.throwIfAborted();
  return new Blob([new Uint8Array(output)], { type: "application/pdf" });
}
