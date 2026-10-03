import type { StudioKind, StudioValues } from "./studio-settings";

export const advancedKinds = new Set<StudioKind>(["autoLevels", "autoBalance", "channelMixer", "splitTone", "selectiveSaturation", "gradientMap", "dither", "halftone", "scanlines", "solarize", "median", "softBlur", "tiltShift", "chromatic"]);
const luma = (r: number, g: number, b: number) => .2126 * r + .7152 * g + .0722 * b;
const color = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
function hue(r: number, g: number, b: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (!d) return 0;
  return ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
}

/** Three separable sliding-box passes approximate a Gaussian in linear time.
 * Work in premultiplied RGBA; normalize colors once, retaining source alpha. */
function blur(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  let source = Float32Array.from(data, (v, i) => i % 4 === 3 ? v / 255 : v * data[i - i % 4 + 3]! / 255);
  let target = new Float32Array(source.length);
  const ideal = Math.sqrt(4 * radius * radius + 1), floor = Math.floor(ideal), low = Math.max(1, floor % 2 ? floor : floor - 1), high = low + 2;
  const lowerCount = Math.round((12 * radius * radius - 3 * low * low - 12 * low - 9) / (-4 * low - 4));
  for (let pass = 0; pass < 3; pass++) {
    const r = ((pass < lowerCount ? low : high) - 1) / 2;
    for (const horizontal of [true, false]) {
      const length = horizontal ? width : height, lines = horizontal ? height : width;
      const stride = horizontal ? 4 : width * 4;
      for (let line = 0; line < lines; line++) {
        const base = horizontal ? line * width * 4 : line * 4;
        for (let c = 0; c < 4; c++) {
          let sum = 0;
          for (let offset = -r; offset <= r; offset++) sum += source[base + Math.max(0, Math.min(length - 1, offset)) * stride + c]!;
          for (let pos = 0; pos < length; pos++) {
            target[base + pos * stride + c] = sum / (2 * r + 1);
            sum += source[base + Math.min(length - 1, pos + r + 1) * stride + c]! - source[base + Math.max(0, pos - r) * stride + c]!;
          }
        }
      }
      [source, target] = [target, source];
    }
  }
  const result = data.slice();
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] && source[i + 3]! > 1e-6) {
    for (let c = 0; c < 3; c++) result[i + c] = source[i + c]! / source[i + 3]!;
  }
  return result;
}

/** Validated controls and raster bounds are checked by studioPixels before entry. */
export function advancedPixels(data: Uint8ClampedArray, width: number, height: number, kind: StudioKind, f: StudioValues) {
  const amount = Number(f.amount ?? 100) / 100;
  const dark = color(f.dark ?? "#000000"), light = color(f.light ?? "#ffffff"), mid = color(f.mid ?? "#808080"), tint = color(f.color ?? "#000000");
  const sample = ["median", "chromatic"].includes(kind) ? data.slice() : null;
  const blurred = kind === "softBlur" || kind === "tiltShift" ? blur(data, width, height, Number(f.radius)) : null;
  const lows = [0, 0, 0], highs = [255, 255, 255], gains = [1, 1, 1];
  if (kind === "autoLevels" || kind === "autoBalance") {
    const histograms = Array.from({ length: 3 }, () => new Float64Array(256));
    const sums = [0, 0, 0]; let weight = 0;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3]! / 255; weight += alpha;
      for (let c = 0; c < 3; c++) { histograms[c]![data[i + c]!]! += alpha; sums[c]! += data[i + c]! * alpha; }
    }
    if (weight) {
      if (kind === "autoBalance") {
        const average = (sums[0]! + sums[1]! + sums[2]!) / 3;
        for (let c = 0; c < 3; c++) gains[c] = sums[c]! > 0 ? Math.min(4, average / sums[c]!) : 1;
      } else for (let c = 0; c < 3; c++) {
        const cut = weight * Number(f.clip) / 100; let cumulative = 0;
        for (let v = 0; v < 256; v++) { cumulative += histograms[c]![v]!; if (cumulative > cut) { lows[c] = v; break; } }
        cumulative = 0;
        for (let v = 255; v >= 0; v--) { cumulative += histograms[c]![v]!; if (cumulative > cut) { highs[c] = v; break; } }
      }
    }
  }
  const size = Number(f.size), targetHue = hue(tint[0]!, tint[1]!, tint[2]!);
  const bayer = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
  let cells: Float32Array | undefined;
  const columns = Math.ceil(width / size);
  if (kind === "halftone") {
    cells = new Float32Array(columns * Math.ceil(height / size));
    const weights = new Float32Array(cells.length);
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4, cell = Math.floor(y / size) * columns + Math.floor(x / size), a = data[i + 3]! / 255;
      cells[cell]! += luma(data[i]!, data[i + 1]!, data[i + 2]!) * a; weights[cell]! += a;
    }
    for (let i = 0; i < cells.length; i++) cells[i] = weights[i] ? cells[i]! / weights[i]! : 255;
  }
  const medianNeighbors: Array<{ i: number; l: number }> = [];
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!data[i + 3]) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!, lum = luma(r, g, b), original = [r, g, b];
    let result = original;
    switch (kind) {
      case "autoLevels": result = original.map((v, c) => highs[c]! > lows[c]! ? (v - lows[c]!) * 255 / (highs[c]! - lows[c]!) : v); break;
      case "autoBalance": result = original.map((v, c) => v * (1 + (gains[c]! - 1) * amount)); break;
      case "channelMixer": result = original.map((v, c) => v * Number(f[["red", "green", "blue"][c]!]!) / 100); break;
      case "splitTone": result = original.map((v, c) => v * (1 - amount) + (dark[c]! + (light[c]! - dark[c]!) * lum / 255) * amount); break;
      case "selectiveSaturation": {
        const distance = Math.abs(hue(r, g, b) - targetHue), circular = Math.min(distance, 360 - distance);
        const weight = Math.max(0, 1 - circular / Number(f.range));
        result = original.map(v => lum + (v - lum) * (1 + amount * weight)); break;
      }
      case "gradientMap": {
        const lower = lum < 127.5, t = lower ? lum / 127.5 : (lum - 127.5) / 127.5, start = lower ? dark : mid, end = lower ? mid : light;
        result = original.map((v, c) => v * (1 - amount) + (start[c]! + (end[c]! - start[c]!) * t) * amount); break;
      }
      case "dither": {
        const threshold = 127.5 + ((bayer[(Math.floor(y / size) % 4) * 4 + Math.floor(x / size) % 4]! + .5) / 16 - .5) * 255 * amount;
        result = [0, 0, 0].map(() => lum >= threshold ? 255 : 0); break;
      }
      case "halftone": {
        const cellX = Math.floor(x / size), cellY = Math.floor(y / size), cellWidth = Math.min(size, width - cellX * size), cellHeight = Math.min(size, height - cellY * size);
        const dx = x % size + .5 - cellWidth / 2, dy = y % size + .5 - cellHeight / 2;
        const radius = Math.sqrt(1 - cells![cellY * columns + cellX]! / 255) * Math.hypot(cellWidth, cellHeight) / 2;
        result = radius > 0 && Math.hypot(dx, dy) <= radius ? dark : light; break;
      }
      case "scanlines": {
        const position = f.direction === "vertical" ? x : y;
        if (position % Number(f.spacing) < Number(f.thickness)) result = original.map((v, c) => v * (1 - amount) + tint[c]! * amount);
        break;
      }
      case "solarize": result = original.map(v => v * (1 - amount) + (v >= Number(f.threshold) ? 255 - v : v) * amount); break;
      case "median": {
        medianNeighbors.length = 0;
        const radius = (size - 1) / 2;
        for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
          if (x + dx < 0 || x + dx >= width || y + dy < 0 || y + dy >= height) continue;
          const j = ((y + dy) * width + x + dx) * 4;
          if (sample![j + 3]) medianNeighbors.push({ i: j, l: luma(sample![j]!, sample![j + 1]!, sample![j + 2]!) });
        }
        medianNeighbors.sort((a, b) => a.l - b.l);
        const j = medianNeighbors[Math.floor(medianNeighbors.length / 2)]!.i;
        result = original.map((v, c) => v * (1 - amount) + sample![j + c]! * amount); break;
      }
      case "softBlur": result = original.map((v, c) => v * (1 - amount) + blurred![i + c]! * amount); break;
      case "tiltShift": {
        const vertical = f.direction === "vertical", length = vertical ? width : height;
        const pos = length <= 1 ? .5 : (vertical ? x : y) / (length - 1), band = Number(f.band) / 200;
        const t = Math.max(0, Math.min(1, (Math.abs(pos - Number(f.position) / 100) - band) / Math.max(.01, .5 - band)));
        const mix = t * t * (3 - 2 * t);
        result = original.map((v, c) => v * (1 - mix) + blurred![i + c]! * mix); break;
      }
      case "chromatic": result = original.map((v, c) => {
        if (c === 1) return v;
        const sign = c === 0 ? 1 : -1, sx = Math.max(0, Math.min(width - 1, x + Number(f.x) * sign)), sy = Math.max(0, Math.min(height - 1, y + Number(f.y) * sign));
        const j = (sy * width + sx) * 4, alpha = sample![j + 3]! / 255;
        return v + (sample![j + c]! - v) * amount * alpha;
      }); break;
      default: throw new Error("Unknown advanced image tool.");
    }
    for (let c = 0; c < 3; c++) data[i + c] = result[c]!;
  }
  return data;
}
