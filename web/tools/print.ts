import { decodeSource } from "../local-image";
import { number, value, paragraph, download, type ImageTool } from "./shared";
export function printSize(width: number, height: number, dpi: number, requested: number, unit: string) {
  if (![width, height, dpi, requested].every(n => Number.isFinite(n) && n > 0) || !["in", "cm"].includes(unit)) throw new Error("Enter positive dimensions and DPI.");
  const factor = unit === "cm" ? 2.54 : 1;
  return { width: width / dpi * factor, height: height / dpi * factor, effectiveDpi: width / (requested / factor), requestedHeight: requested * height / width, requiredWidth: Math.ceil(requested / factor * dpi), requiredHeight: Math.ceil(requested * height / width / factor * dpi) };
}
export const printTool: ImageTool = {
  title: "Print size & DPI", description: "Calculate physical print dimensions and pixel requirements. This calculator does not resample the image or change its metadata.",
  controls: '<label>Target DPI <input id="print-dpi" type="number" min="1" max="2400" value="300" /></label><label>Units <select id="print-unit"><option value="in">Inches</option><option value="cm">Centimeters</option></select></label><label>Desired print width <input id="print-width" type="number" min="0.1" max="500" step="0.1" value="6" /></label>',
  async run({ file, signal, output }) {
    const { image, release } = await decodeSource(file);
    try { signal.throwIfAborted(); const dpi = number("print-dpi", 1, 2400), requested = number("print-width", .1, 500), unit = value("print-unit"), r = printSize(image.naturalWidth, image.naturalHeight, dpi, requested, unit);
      const lines = [`Source: ${image.naturalWidth} × ${image.naturalHeight}px`, `At ${dpi} DPI: ${r.width.toFixed(2)} × ${r.height.toFixed(2)} ${unit}`, `Desired print: ${requested} × ${r.requestedHeight.toFixed(2)} ${unit}`, `Effective resolution: ${r.effectiveDpi.toFixed(1)} DPI`, `Pixels needed at ${dpi} DPI: ${r.requiredWidth} × ${r.requiredHeight}`, r.effectiveDpi >= dpi ? "The source meets your target DPI at this size." : "The source is below your target DPI at this size. Choose a smaller print or a larger source."];
      lines.forEach(line => paragraph(output, line)); download(output, new Blob([lines.join("\n")], { type: "text/plain" }), "print-size-report.txt");
    } finally { release(); }
  },
};
