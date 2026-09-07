import { MAX_PIXELS, MAX_DIMENSION } from "../src/transform";
export function sheetLayout(count: number, width: number, columns: number, labels: boolean) {
  if (!Number.isInteger(count) || count < 1 || count > 50) throw new Error("Choose between 1 and 50 images.");
  if (!Number.isInteger(width) || width < 400 || width > 4800 || !Number.isInteger(columns) || columns < 1 || columns > 6) throw new Error("Use a sheet width of 400–4800px and 1–6 columns.");
  const gap = 16, cell = Math.floor((width - gap * (columns + 1)) / columns), labelHeight = labels ? 36 : 0;
  const height = gap + Math.ceil(count / columns) * (cell + labelHeight + gap);
  if (width * height > MAX_PIXELS || height > MAX_DIMENSION) throw new Error("This sheet is too tall. Add columns or reduce the width.");
  return { width, height, cell, gap, labelHeight, columns };
}
export function pdfLayout(width: number, height: number, paper: string, landscape: boolean, margin: number) {
  if (![width, height].every(n => Number.isFinite(n) && n > 0 && n <= 12000) || !Number.isFinite(margin) || margin < 0 || margin > 72 || !["a4", "letter", "image"].includes(paper)) throw new Error("Invalid PDF page settings.");
  let pageWidth = paper === "image" ? width * .75 + margin * 2 : paper === "letter" ? 612 : 595.28;
  let pageHeight = paper === "image" ? height * .75 + margin * 2 : paper === "letter" ? 792 : 841.89;
  if (landscape && paper !== "image") [pageWidth, pageHeight] = [pageHeight, pageWidth];
  const scale = Math.min((pageWidth - 2 * margin) / width, (pageHeight - 2 * margin) / height);
  return { pageWidth, pageHeight, width: width * scale, height: height * scale, x: (pageWidth - width * scale) / 2, y: (pageHeight - height * scale) / 2 };
}
