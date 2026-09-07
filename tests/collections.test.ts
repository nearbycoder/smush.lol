import { test, expect } from "bun:test";
import { PDFDocument } from "pdf-lib";
import { imagesPdf } from "../web/pdf-export";
import { sheetLayout, pdfLayout } from "../web/collection-layout";
const bytes = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="), c => c.charCodeAt(0));
test("contact sheet bounds reject excessive canvases", () => {
  expect(sheetLayout(5, 1600, 4, true)).toMatchObject({ width: 1600, columns: 4, height: 880 });
  expect(() => sheetLayout(50, 4800, 1, true)).toThrow("too tall");
  expect(() => sheetLayout(0, 1600, 4, true)).toThrow();
});
test("PDF preserves page order and sizes while fitting without cropping", async () => {
  const output = await imagesPdf([{ bytes, width: 400, height: 200 }, { bytes, width: 200, height: 600 }], "image", false, 0, new AbortController().signal);
  const pdf = await PDFDocument.load(await output.arrayBuffer());
  expect(pdf.getPageCount()).toBe(2);
  expect(pdf.getPage(0).getSize()).toEqual({ width: 300, height: 150 });
  expect(pdf.getPage(1).getSize()).toEqual({ width: 150, height: 450 });
  expect(pdfLayout(400, 200, "letter", true, 24)).toMatchObject({ pageWidth: 792, pageHeight: 612, x: 24, width: 744, height: 372 });
  await expect(imagesPdf([], "a4", false, 24, new AbortController().signal)).rejects.toThrow("at least one");
  await expect(imagesPdf([{ bytes, width: 1, height: 1 }], "a4", false, 24, AbortSignal.abort())).rejects.toThrow();
});
