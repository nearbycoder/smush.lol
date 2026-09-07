import type { ExportFields } from "./queue";
import { MAX_DIMENSION } from "../src/transform";

export function exportVariants(widthsText: string, formats: string[], original: boolean, base: ExportFields) {
  const widths = widthsText.trim() ? [...new Set(widthsText.split(",").map(value => Number(value.trim())))] : [];
  if (widths.some(width => !Number.isInteger(width) || width < 1 || width > MAX_DIMENSION)) {
    throw new Error("Enter comma-separated widths from 1 to 12,000px.");
  }
  if (!formats.length || formats.some(format => !["webp", "jpeg", "png", "avif"].includes(format))) throw new Error("Choose at least one export format.");
  const sizes: Array<number | undefined> = [...widths, ...(original ? [undefined] : [])];
  if (!sizes.length) throw new Error("Choose at least one width or include the original size.");
  if (sizes.length * formats.length > 50) throw new Error("Choose 50 exports or fewer.");
  return sizes.flatMap(width => [...new Set(formats)].map(format => {
    const fields: ExportFields = { ...base, width: width === undefined ? "" : String(width), height: "", fit: "inside", format };
    // A quality target cannot alter PNG or lossless encoding.
    if (format === "png" || (format === "webp" && ["on", "true", "1"].includes(base.lossless ?? ""))) delete fields.targetKB;
    return { label: `${width === undefined ? "original" : `${width}w`}-${format}`, fields };
  }));
}
