import { sourceCanvas, paragraph, download, value, type ImageTool } from "./shared";
export function histogram(data: Uint8ClampedArray) {
  const rBins = new Uint32Array(256), gBins = new Uint32Array(256), bBins = new Uint32Array(256), lBins = new Uint32Array(256);
  let pixels = 0, luminance = 0, transparent = 0;
  for (let i = 0, len = data.length; i < len; i += 4) {
    if (data[i + 3]! < 128) { transparent++; continue; }
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const l = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    rBins[r]!++; gBins[g]!++; bBins[b]!++; lBins[l]!++;
    luminance += l; pixels++;
  }
  return { bins: [rBins, gBins, bBins, lBins], pixels, transparent, mean: pixels ? luminance / pixels : 0 };
}
export const histogramTool: ImageTool = {
  title: "Histogram & statistics", description: "Analyze RGB or luminance distribution from a 1024px sample. Pixels below 50% opacity are excluded from color statistics.",
  controls: '<label>Channels <select id="histogram-channel"><option value="rgb">RGB overlay</option><option value="luma">Luminance</option></select></label>',
  async run({ file, signal, output }) {
    const sample = await sourceCanvas(file, 1024);
    try { signal.throwIfAborted(); const result = histogram(sample.getContext("2d")!.getImageData(0, 0, sample.width, sample.height).data);
      if (!result.pixels) throw new Error("No opaque pixels to analyze.");
      const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 256; canvas.setAttribute("aria-label", "Histogram: left is dark, right is bright; heights represent sample pixel counts."); const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#17160f"; ctx.fillRect(0, 0, 768, 256); const channels = value("histogram-channel") === "luma" ? [3] : [0, 1, 2];
      let peak = 1;
      for (const ch of channels) { const bin = result.bins[ch]!; for (let i = 0; i < 256; i++) if (bin[i]! > peak) peak = bin[i]!; }
      for (const ch of channels) { ctx.fillStyle = ["#ff666699", "#88ee7799", "#88aaff99", "#ffffff"][ch]!; for (let i = 0; i < 256; i++) { const height = result.bins[ch]![i]! / peak * 240; ctx.fillRect(i * 3, 256 - height, 3, height); } }
      output.append(canvas); paragraph(output, `${result.pixels.toLocaleString()} analyzed pixels · ${result.transparent.toLocaleString()} excluded · mean luminance ${result.mean.toFixed(1)} / 255`);
      paragraph(output, `Black luminance: ${result.bins[3]![0]} pixels · white luminance: ${result.bins[3]![255]} pixels. Histogram counts are relative to the resized sample.`);
      download(output, new Blob(["level,red,green,blue,luminance\n" + Array.from({ length: 256 }, (_, i) => [i, ...result.bins.map(b => b[i])].join(",")).join("\n")], { type: "text/csv" }), "histogram.csv");
    } finally { sample.width = sample.height = 0; }
  },
};
