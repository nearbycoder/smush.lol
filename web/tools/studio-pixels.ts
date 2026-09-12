import { studioSize, validateStudio, type StudioKind, type StudioValues } from "./studio-settings";
const clamp = (v: number) => Math.max(0, Math.min(255, v));
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

function shiftHue(r: number, g: number, b: number, degrees: number) {
  const max = Math.max(r, g, b), min = Math.min(r, g, b), delta = max - min;
  if (!delta) return [r, g, b];
  let hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
  hue = ((hue + degrees / 60) % 6 + 6) % 6;
  const x = delta * (1 - Math.abs(hue % 2 - 1));
  const channels = hue < 1 ? [delta, x, 0] : hue < 2 ? [x, delta, 0] : hue < 3 ? [0, delta, x] : hue < 4 ? [0, x, delta] : hue < 5 ? [x, 0, delta] : [delta, 0, x];
  return channels.map(v => v + min);
}

/** Mutates one RGBA raster. Neighborhood operations take a separate immutable sample. */
export function studioPixels(data: Uint8ClampedArray, width: number, height: number, kind: StudioKind, fields: StudioValues) {
  studioSize(width, height);
  if (data.length !== width * height * 4) throw new Error("Invalid pixel buffer.");
  const f = validateStudio(kind, fields), amount = Number(f.amount), from = rgb(f.from ?? "#000000"), to = rgb(f.to ?? "#000000");
  if (kind === "pixelate") {
    const size = Number(f.size);
    for (let by = 0; by < height; by += size) for (let bx = 0; bx < width; bx += size) {
      const endX = Math.min(width, bx + size), endY = Math.min(height, by + size);
      let r = 0, g = 0, b = 0, alpha = 0;
      for (let y = by; y < endY; y++) for (let x = bx; x < endX; x++) {
        const i = (y * width + x) * 4, a = data[i + 3]!;
        r += data[i]! * a; g += data[i + 1]! * a; b += data[i + 2]! * a; alpha += a;
      }
      // Retain the source alpha silhouette, including partially transparent pixels.
      if (alpha) for (let y = by; y < endY; y++) for (let x = bx; x < endX; x++) {
        const i = (y * width + x) * 4;
        if (data[i + 3]) { data[i] = r / alpha; data[i + 1] = g / alpha; data[i + 2] = b / alpha; }
      }
    }
    return data;
  }
  const sample = kind === "edges" || kind === "emboss" ? data.slice() : null;
  let seed = Number(f.seed) || 1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4, alpha = data[i + 3]!;
    if (!alpha) continue;
    let r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    const lum = luminance(r, g, b);
    switch (kind) {
      case "balance": {
        const temperature = Number(f.temperature) * 0.6, tint = Number(f.tint) * 0.4;
        r += temperature + tint / 2; g -= tint; b += -temperature + tint / 2; break;
      }
      case "gamma":
      case "levels": {
        const black = kind === "levels" ? Number(f.black) : 0, white = kind === "levels" ? Number(f.white) : 255;
        const correct = (v: number) => 255 * Math.pow(clamp((v - black) / (white - black) * 255) / 255, 1 / Number(f.gamma));
        r = correct(r); g = correct(g); b = correct(b); break;
      }
      case "tones": {
        const l = lum / 255;
        const delta = 0.8 * (Number(f.shadows) * (1 - l) ** 2 + Number(f.highlights) * l ** 2);
        r += delta; g += delta; b += delta; break;
      }
      case "vibrance": {
        const saturation = (Math.max(r, g, b) - Math.min(r, g, b)) / 255;
        const factor = 1 + amount / 100 * (amount > 0 ? 1 - saturation : 1);
        r = lum + (r - lum) * factor; g = lum + (g - lum) * factor; b = lum + (b - lum) * factor; break;
      }
      case "hue": [r, g, b] = shiftHue(r, g, b, Number(f.angle)) as [number, number, number]; break;
      case "replace":
      case "key": {
        const distance = Math.hypot(r - from[0]!, g - from[1]!, b - from[2]!) / Math.sqrt(3 * 255 ** 2) * 100;
        const tolerance = Number(f.tolerance), softness = Number(f.softness);
        const match = distance <= tolerance ? 1 : softness ? Math.max(0, 1 - (distance - tolerance) / softness) : 0;
        if (kind === "key") data[i + 3] = alpha * (1 - match);
        else { r += (to[0]! - r) * match; g += (to[1]! - g) * match; b += (to[2]! - b) * match; }
        break;
      }
      case "opacity": data[i + 3] = alpha * amount / 100; break;
      case "vignette": {
        const nx = width === 1 ? 0 : (x / (width - 1) - 0.5) * 2, ny = height === 1 ? 0 : (y / (height - 1) - 0.5) * 2;
        const distance = Math.hypot(nx, ny) / Math.SQRT2, radius = Number(f.radius) / 100;
        const t = Math.max(0, Math.min(1, (distance - radius) / (1 - radius))), weight = t * t * (3 - 2 * t) * Math.abs(amount) / 100;
        const target = amount < 0 ? 255 : 0;
        r += (target - r) * weight; g += (target - g) * weight; b += (target - b) * weight; break;
      }
      case "grain": {
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const noise = ((seed >>> 0) / 4294967296 - 0.5) * amount * 1.28;
        r += noise; g += noise; b += noise; break;
      }
      case "posterize": {
        const steps = Number(f.levels) - 1, quantize = (v: number) => Math.round(v / 255 * steps) * 255 / steps;
        r = quantize(r); g = quantize(g); b = quantize(b); break;
      }
      case "threshold": r = g = b = lum >= Number(f.threshold) ? 255 : 0; break;
      case "edges":
      case "emboss": {
        const at = (dx: number, dy: number) => {
          const j = (Math.max(0, Math.min(height - 1, y + dy)) * width + Math.max(0, Math.min(width - 1, x + dx))) * 4;
          const a = sample![j + 3]! / 255;
          return luminance(sample![j]!, sample![j + 1]!, sample![j + 2]!) * a + lum * (1 - a);
        };
        if (kind === "emboss") r = g = b = 128 + (at(1, 1) - at(-1, -1)) * amount;
        else {
          const gx = -at(-1, -1) + at(1, -1) - 2 * at(-1, 0) + 2 * at(1, 0) - at(-1, 1) + at(1, 1);
          const gy = -at(-1, -1) - 2 * at(0, -1) - at(1, -1) + at(-1, 1) + 2 * at(0, 1) + at(1, 1);
          r = g = b = Math.hypot(gx, gy) * amount / 4;
        }
        break;
      }
      default: throw new Error("This tool needs canvas layout processing.");
    }
    data[i] = r; data[i + 1] = g; data[i + 2] = b;
  }
  return data;
}
