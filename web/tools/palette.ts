import { sourceCanvas, number, paragraph, download, type ImageTool } from "./shared";
export function palette(data: Uint8ClampedArray, count: number) {
  const buckets = new Map<number, { r: number; g: number; b: number; count: number }>(); let total = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3]! < 128) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5);
    const item = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 }; item.r += r; item.g += g; item.b += b; item.count++; total++; buckets.set(key, item);
  }
  return [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, count).map(item => ({ hex: "#" + [item.r, item.g, item.b].map(n => Math.round(n / item.count).toString(16).padStart(2, "0")).join(""), percent: item.count / total * 100 }));
}
export const paletteTool: ImageTool = {
  title: "Color palette", description: "Extract dominant colors from a 256px sample. Transparent pixels are excluded; percentages describe visible sample pixels.",
  controls: '<label>Number of colors <input id="palette-count" type="number" min="2" max="12" value="6" /></label>',
  async run({ file, output, signal }) {
    const c = await sourceCanvas(file, 256);
    try { signal.throwIfAborted(); const colors = palette(c.getContext("2d")!.getImageData(0, 0, c.width, c.height).data, Math.round(number("palette-count", 2, 12))); if (!colors.length) throw new Error("This image has no sufficiently opaque colors.");
      for (const color of colors) { const row = paragraph(output, `${color.hex.toUpperCase()} · ${color.percent.toFixed(1)}%`); const swatch = document.createElement("span"); swatch.className = "palette-swatch"; swatch.style.background = color.hex; row.prepend(swatch); }
      download(output, new Blob([`:root {\n${colors.map((c, i) => `  --image-color-${i + 1}: ${c.hex};`).join("\n")}\n}\n`], { type: "text/css" }), "image-palette.css");
    } finally { c.width = c.height = 0; }
  },
};
