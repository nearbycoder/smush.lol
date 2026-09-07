import { sourceCanvas, paragraph, download, value, type ImageTool } from "./shared";
export function histogram(data: Uint8ClampedArray) {
  const bins = Array.from({ length: 4 }, () => Array<number>(256).fill(0)); let pixels = 0, luminance = 0, transparent = 0;
  for (let i = 0; i < data.length; i += 4) { if (data[i + 3]! < 128) { transparent++; continue; } const l = Math.round(.2126 * data[i]! + .7152 * data[i + 1]! + .0722 * data[i + 2]!); for (let ch = 0; ch < 3; ch++) bins[ch]![data[i + ch]!]!++; bins[3]![l]!++; luminance += l; pixels++; }
  return { bins, pixels, transparent, mean: pixels ? luminance / pixels : 0 };
}
export const histogramTool: ImageTool = {
  title: "Histogram & statistics", description: "Analyze RGB or luminance distribution from a 1024px sample. Pixels below 50% opacity are excluded from color statistics.",
  controls: '<label>Channels <select id="histogram-channel"><option value="rgb">RGB overlay</option><option value="luma">Luminance</option></select></label>',
  async run({ file, signal, output }) {
    const sample = await sourceCanvas(file, 1024);
    try { signal.throwIfAborted(); const result = histogram(sample.getContext("2d")!.getImageData(0, 0, sample.width, sample.height).data);
      if (!result.pixels) throw new Error("No opaque pixels to analyze.");
      const canvas = document.createElement("canvas"); canvas.width = 768; canvas.height = 256; canvas.setAttribute("aria-label", "Histogram: left is dark, right is bright; heights represent sample pixel counts."); const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#17160f"; ctx.fillRect(0, 0, 768, 256); const channels = value("histogram-channel") === "luma" ? [3] : [0, 1, 2]; const peak = Math.max(...channels.flatMap(ch => result.bins[ch]!));
      for (const ch of channels) { ctx.fillStyle = ["#ff666699", "#88ee7799", "#88aaff99", "#ffffff"][ch]!; for (let i = 0; i < 256; i++) { const height = result.bins[ch]![i]! / peak * 240; ctx.fillRect(i * 3, 256 - height, 3, height); } }
      output.append(canvas); paragraph(output, `${result.pixels.toLocaleString()} analyzed pixels · ${result.transparent.toLocaleString()} excluded · mean luminance ${result.mean.toFixed(1)} / 255`);
      paragraph(output, `Black luminance: ${result.bins[3]![0]} pixels · white luminance: ${result.bins[3]![255]} pixels. Histogram counts are relative to the resized sample.`);
      download(output, new Blob(["level,red,green,blue,luminance\n" + Array.from({ length: 256 }, (_, i) => [i, ...result.bins.map(b => b[i])].join(",")).join("\n")], { type: "text/csv" }), "histogram.csv");
    } finally { sample.width = sample.height = 0; }
  },
};
