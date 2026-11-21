import type { StudioKind, StudioValues } from "./studio-settings";

export const advancedKinds = new Set<StudioKind>(["autoLevels", "autoBalance", "channelMixer", "splitTone", "selectiveSaturation", "gradientMap", "dither", "halftone", "scanlines", "solarize", "median", "softBlur", "tiltShift", "chromatic"]);
const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const parseRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

function hue(r: number, g: number, b: number) {
  const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
  const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
  const d = max - min;
  if (!d) return 0;
  return ((max === r ? (g - b) / d : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60 + 360) % 360;
}

/** Three separable sliding-box passes approximate a Gaussian in linear time.
 * Work in premultiplied RGBA; normalize colors once, retaining source alpha. */
function blur(data: Uint8ClampedArray, width: number, height: number, radius: number) {
  const len = data.length;
  let source = new Float32Array(len);
  let target = new Float32Array(len);
  const inv255 = 1 / 255;
  for (let i = 0; i < len; i += 4) {
    const a = data[i + 3]! * inv255;
    source[i] = data[i]! * a;
    source[i + 1] = data[i + 1]! * a;
    source[i + 2] = data[i + 2]! * a;
    source[i + 3] = a;
  }

  const ideal = Math.sqrt(4 * radius * radius + 1);
  const floor = Math.floor(ideal);
  const low = Math.max(1, floor % 2 ? floor : floor - 1);
  const high = low + 2;
  const lowerCount = Math.round((12 * radius * radius - 3 * low * low - 12 * low - 9) / (-4 * low - 4));
  const rowStride = width * 4;
  const maxX = width - 1;
  const maxY = height - 1;

  for (let pass = 0; pass < 3; pass++) {
    const r = ((pass < lowerCount ? low : high) - 1) / 2;
    const invKernel = 1 / (2 * r + 1);

    // Horizontal pass (all 4 channels fused per pixel for cache locality)
    for (let y = 0; y < height; y++) {
      const base = y * rowStride;
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let offset = -r; offset <= r; offset++) {
        const idx = base + (offset < 0 ? 0 : offset > maxX ? maxX : offset) * 4;
        sr += source[idx]!; sg += source[idx + 1]!; sb += source[idx + 2]!; sa += source[idx + 3]!;
      }
      for (let x = 0; x < width; x++) {
        const out = base + x * 4;
        target[out] = sr * invKernel;
        target[out + 1] = sg * invKernel;
        target[out + 2] = sb * invKernel;
        target[out + 3] = sa * invKernel;
        const addX = x + r + 1;
        const subX = x - r;
        const addIdx = base + (addX > maxX ? maxX : addX) * 4;
        const subIdx = base + (subX < 0 ? 0 : subX) * 4;
        sr += source[addIdx]! - source[subIdx]!;
        sg += source[addIdx + 1]! - source[subIdx + 1]!;
        sb += source[addIdx + 2]! - source[subIdx + 2]!;
        sa += source[addIdx + 3]! - source[subIdx + 3]!;
      }
    }
    [source, target] = [target, source];

    // Vertical pass (all 4 channels fused per pixel)
    for (let x = 0; x < width; x++) {
      const base = x * 4;
      let sr = 0, sg = 0, sb = 0, sa = 0;
      for (let offset = -r; offset <= r; offset++) {
        const idx = base + (offset < 0 ? 0 : offset > maxY ? maxY : offset) * rowStride;
        sr += source[idx]!; sg += source[idx + 1]!; sb += source[idx + 2]!; sa += source[idx + 3]!;
      }
      for (let y = 0; y < height; y++) {
        const out = base + y * rowStride;
        target[out] = sr * invKernel;
        target[out + 1] = sg * invKernel;
        target[out + 2] = sb * invKernel;
        target[out + 3] = sa * invKernel;
        const addY = y + r + 1;
        const subY = y - r;
        const addIdx = base + (addY > maxY ? maxY : addY) * rowStride;
        const subIdx = base + (subY < 0 ? 0 : subY) * rowStride;
        sr += source[addIdx]! - source[subIdx]!;
        sg += source[addIdx + 1]! - source[subIdx + 1]!;
        sb += source[addIdx + 2]! - source[subIdx + 2]!;
        sa += source[addIdx + 3]! - source[subIdx + 3]!;
      }
    }
    [source, target] = [target, source];
  }

  const result = data.slice();
  for (let i = 0; i < len; i += 4) {
    const a = source[i + 3]!;
    if (data[i + 3] && a > 1e-6) {
      const invA = 1 / a;
      result[i] = source[i]! * invA;
      result[i + 1] = source[i + 1]! * invA;
      result[i + 2] = source[i + 2]! * invA;
    }
  }
  return result;
}

const BAYER_4X4 = new Uint8Array([0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]);

/** Validated controls and raster bounds are checked by studioPixels before entry. */
export function advancedPixels(data: Uint8ClampedArray, width: number, height: number, kind: StudioKind, f: StudioValues) {
  const len = data.length;
  const amount = Number(f.amount ?? 100) / 100;
  const invAmount = 1 - amount;

  switch (kind) {
    case "autoLevels": {
      const hR = new Float64Array(256), hG = new Float64Array(256), hB = new Float64Array(256);
      let weight = 0;
      const inv255 = 1 / 255;
      for (let i = 0; i < len; i += 4) {
        const a = data[i + 3]! * inv255;
        if (!a) continue;
        weight += a;
        hR[data[i]!]! += a;
        hG[data[i + 1]!]! += a;
        hB[data[i + 2]!]! += a;
      }
      if (!weight) return data;
      const cut = weight * Number(f.clip) / 100;
      const makeLut = (hist: Float64Array) => {
        let low = 0, high = 255, cumulative = 0;
        for (let v = 0; v < 256; v++) { cumulative += hist[v]!; if (cumulative > cut) { low = v; break; } }
        cumulative = 0;
        for (let v = 255; v >= 0; v--) { cumulative += hist[v]!; if (cumulative > cut) { high = v; break; } }
        const lut = new Uint8ClampedArray(256);
        const span = high - low;
        for (let v = 0; v < 256; v++) lut[v] = span > 0 ? (v - low) * 255 / span : v;
        return lut;
      };
      const lutR = makeLut(hR), lutG = makeLut(hG), lutB = makeLut(hB);
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = lutR[data[i]!]!;
        data[i + 1] = lutG[data[i + 1]!]!;
        data[i + 2] = lutB[data[i + 2]!]!;
      }
      return data;
    }

    case "autoBalance": {
      if (amount === 0) return data;
      let sumR = 0, sumG = 0, sumB = 0, weight = 0;
      const inv255 = 1 / 255;
      for (let i = 0; i < len; i += 4) {
        const a = data[i + 3]! * inv255;
        if (!a) continue;
        weight += a;
        sumR += data[i]! * a;
        sumG += data[i + 1]! * a;
        sumB += data[i + 2]! * a;
      }
      if (!weight) return data;
      const average = (sumR + sumG + sumB) / 3;
      const gainR = 1 + ((sumR > 0 ? Math.min(4, average / sumR) : 1) - 1) * amount;
      const gainG = 1 + ((sumG > 0 ? Math.min(4, average / sumG) : 1) - 1) * amount;
      const gainB = 1 + ((sumB > 0 ? Math.min(4, average / sumB) : 1) - 1) * amount;
      const lutR = new Uint8ClampedArray(256), lutG = new Uint8ClampedArray(256), lutB = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) { lutR[v] = v * gainR; lutG[v] = v * gainG; lutB[v] = v * gainB; }
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = lutR[data[i]!]!;
        data[i + 1] = lutG[data[i + 1]!]!;
        data[i + 2] = lutB[data[i + 2]!]!;
      }
      return data;
    }

    case "channelMixer": {
      const red = Number(f.red), green = Number(f.green), blue = Number(f.blue);
      const lutR = new Uint8ClampedArray(256), lutG = new Uint8ClampedArray(256), lutB = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) { lutR[v] = v * red / 100; lutG[v] = v * green / 100; lutB[v] = v * blue / 100; }
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = lutR[data[i]!]!;
        data[i + 1] = lutG[data[i + 1]!]!;
        data[i + 2] = lutB[data[i + 2]!]!;
      }
      return data;
    }

    case "splitTone": {
      if (amount === 0) return data;
      const [darkR, darkG, darkB] = parseRgb(f.dark ?? "#000000");
      const [lightR, lightG, lightB] = parseRgb(f.light ?? "#ffffff");
      const diffR = lightR - darkR, diffG = lightG - darkG, diffB = lightB - darkB;
      const inv255 = 1 / 255;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const t = luma(r, g, b) * inv255;
        data[i] = r * invAmount + (darkR + diffR * t) * amount;
        data[i + 1] = g * invAmount + (darkG + diffG * t) * amount;
        data[i + 2] = b * invAmount + (darkB + diffB * t) * amount;
      }
      return data;
    }

    case "selectiveSaturation": {
      if (amount === 0) return data;
      const [tintR, tintG, tintB] = parseRgb(f.color ?? "#000000");
      const targetHue = hue(tintR, tintG, tintB);
      const range = Number(f.range);
      const invRange = 1 / range;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const distance = Math.abs(hue(r, g, b) - targetHue);
        const circular = distance < 180 ? distance : 360 - distance;
        if (circular >= range) continue;
        const factor = 1 + amount * (1 - circular * invRange);
        const lum = luma(r, g, b);
        data[i] = lum + (r - lum) * factor;
        data[i + 1] = lum + (g - lum) * factor;
        data[i + 2] = lum + (b - lum) * factor;
      }
      return data;
    }

    case "gradientMap": {
      if (amount === 0) return data;
      const [darkR, darkG, darkB] = parseRgb(f.dark ?? "#000000");
      const [midR, midG, midB] = parseRgb(f.mid ?? "#808080");
      const [lightR, lightG, lightB] = parseRgb(f.light ?? "#ffffff");
      const invHalf = 1 / 127.5;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const lum = luma(r, g, b);
        let mr: number, mg: number, mb: number;
        if (lum < 127.5) {
          const t = lum * invHalf;
          mr = darkR + (midR - darkR) * t;
          mg = darkG + (midG - darkG) * t;
          mb = darkB + (midB - darkB) * t;
        } else {
          const t = (lum - 127.5) * invHalf;
          mr = midR + (lightR - midR) * t;
          mg = midG + (lightG - midG) * t;
          mb = midB + (lightB - midB) * t;
        }
        data[i] = r * invAmount + mr * amount;
        data[i + 1] = g * invAmount + mg * amount;
        data[i + 2] = b * invAmount + mb * amount;
      }
      return data;
    }

    case "dither": {
      const size = Number(f.size);
      const scale = 255 * amount;
      const thresholds = new Float32Array(16);
      for (let k = 0; k < 16; k++) thresholds[k] = 127.5 + ((BAYER_4X4[k]! + 0.5) / 16 - 0.5) * scale;
      for (let y = 0; y < height; y++) {
        const bayerRow = (Math.floor(y / size) & 3) * 4;
        const rowBase = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = rowBase + x * 4;
          if (!data[i + 3]) continue;
          const v = luma(data[i]!, data[i + 1]!, data[i + 2]!) >= thresholds[bayerRow + (Math.floor(x / size) & 3)]! ? 255 : 0;
          data[i] = data[i + 1] = data[i + 2] = v;
        }
      }
      return data;
    }

    case "halftone": {
      const size = Number(f.size);
      const [darkR, darkG, darkB] = parseRgb(f.dark ?? "#000000");
      const [lightR, lightG, lightB] = parseRgb(f.light ?? "#ffffff");
      const columns = Math.ceil(width / size);
      const rows = Math.ceil(height / size);
      const cells = new Float32Array(columns * rows);
      const weights = new Float32Array(cells.length);
      const inv255 = 1 / 255;
      for (let y = 0; y < height; y++) {
        const cellRow = Math.floor(y / size) * columns;
        const rowBase = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = rowBase + x * 4;
          const a = data[i + 3]! * inv255;
          if (!a) continue;
          const cell = cellRow + Math.floor(x / size);
          cells[cell]! += luma(data[i]!, data[i + 1]!, data[i + 2]!) * a;
          weights[cell]! += a;
        }
      }
      for (let i = 0; i < cells.length; i++) cells[i] = weights[i] ? cells[i]! / weights[i]! : 255;
      for (let y = 0; y < height; y++) {
        const cellY = Math.floor(y / size);
        const cellHeight = Math.min(size, height - cellY * size);
        const dy = (y % size) + 0.5 - cellHeight / 2;
        const dy2 = dy * dy;
        const cellRow = cellY * columns;
        const rowBase = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = rowBase + x * 4;
          if (!data[i + 3]) continue;
          const cellX = Math.floor(x / size);
          const cellWidth = Math.min(size, width - cellX * size);
          const dx = (x % size) + 0.5 - cellWidth / 2;
          const radius = Math.sqrt(1 - cells[cellRow + cellX]! * inv255) * Math.sqrt(cellWidth * cellWidth + cellHeight * cellHeight) * 0.5;
          if (radius > 0 && dx * dx + dy2 <= radius * radius) {
            data[i] = darkR; data[i + 1] = darkG; data[i + 2] = darkB;
          } else {
            data[i] = lightR; data[i + 1] = lightG; data[i + 2] = lightB;
          }
        }
      }
      return data;
    }

    case "scanlines": {
      if (amount === 0) return data;
      const [tintR, tintG, tintB] = parseRgb(f.color ?? "#000000");
      const spacing = Number(f.spacing);
      const thickness = Number(f.thickness);
      const tr = tintR * amount, tg = tintG * amount, tb = tintB * amount;
      if (f.direction === "vertical") {
        for (let y = 0; y < height; y++) {
          const rowBase = y * width * 4;
          for (let x = 0; x < width; x++) {
            if (x % spacing >= thickness) continue;
            const i = rowBase + x * 4;
            if (!data[i + 3]) continue;
            data[i] = data[i]! * invAmount + tr;
            data[i + 1] = data[i + 1]! * invAmount + tg;
            data[i + 2] = data[i + 2]! * invAmount + tb;
          }
        }
      } else {
        for (let y = 0; y < height; y++) {
          if (y % spacing >= thickness) continue;
          const rowBase = y * width * 4;
          const rowEnd = rowBase + width * 4;
          for (let i = rowBase; i < rowEnd; i += 4) {
            if (!data[i + 3]) continue;
            data[i] = data[i]! * invAmount + tr;
            data[i + 1] = data[i + 1]! * invAmount + tg;
            data[i + 2] = data[i + 2]! * invAmount + tb;
          }
        }
      }
      return data;
    }

    case "solarize": {
      if (amount === 0) return data;
      const threshold = Number(f.threshold);
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = v * invAmount + (v >= threshold ? 255 - v : v) * amount;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = lut[data[i]!]!;
        data[i + 1] = lut[data[i + 1]!]!;
        data[i + 2] = lut[data[i + 2]!]!;
      }
      return data;
    }

    case "median": {
      if (amount === 0) return data;
      const sample = data.slice();
      const radius = (Number(f.size) - 1) / 2;
      const pixelCount = width * height;
      const lumaBuf = new Float32Array(pixelCount);
      for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
        lumaBuf[p] = sample[i + 3] ? luma(sample[i]!, sample[i + 1]!, sample[i + 2]!) : -1;
      }
      const neighIdx = new Int32Array(25);
      const neighLum = new Float32Array(25);
      for (let y = 0; y < height; y++) {
        const yMin = y > radius ? y - radius : 0;
        const yMax = y + radius < height ? y + radius : height - 1;
        const rowBase = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = rowBase + x * 4;
          if (!sample[i + 3]) continue;
          const xMin = x > radius ? x - radius : 0;
          const xMax = x + radius < width ? x + radius : width - 1;
          let count = 0;
          for (let ny = yMin; ny <= yMax; ny++) {
            const nRow = ny * width;
            for (let nx = xMin; nx <= xMax; nx++) {
              const p = nRow + nx;
              const l = lumaBuf[p]!;
              if (l < 0) continue;
              // Stable insertion sort in fixed scratch buffers (0 heap allocations).
              let pos = count++;
              while (pos > 0 && neighLum[pos - 1]! > l) {
                neighLum[pos] = neighLum[pos - 1]!;
                neighIdx[pos] = neighIdx[pos - 1]!;
                pos--;
              }
              neighLum[pos] = l;
              neighIdx[pos] = p * 4;
            }
          }
          const j = neighIdx[count >> 1]!;
          data[i] = sample[i]! * invAmount + sample[j]! * amount;
          data[i + 1] = sample[i + 1]! * invAmount + sample[j + 1]! * amount;
          data[i + 2] = sample[i + 2]! * invAmount + sample[j + 2]! * amount;
        }
      }
      return data;
    }

    case "softBlur": {
      if (amount === 0) return data;
      const blurred = blur(data, width, height, Number(f.radius));
      if (amount === 1) {
        data.set(blurred);
        return data;
      }
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = data[i]! * invAmount + blurred[i]! * amount;
        data[i + 1] = data[i + 1]! * invAmount + blurred[i + 1]! * amount;
        data[i + 2] = data[i + 2]! * invAmount + blurred[i + 2]! * amount;
      }
      return data;
    }

    case "tiltShift": {
      const blurred = blur(data, width, height, Number(f.radius));
      const vertical = f.direction === "vertical";
      const length = vertical ? width : height;
      const band = Number(f.band) / 200;
      const center = Number(f.position) / 100;
      const invSpread = 1 / Math.max(0.01, 0.5 - band);
      const invSpan = length <= 1 ? 0 : 1 / (length - 1);
      if (vertical) {
        const mixByX = new Float32Array(width);
        for (let x = 0; x < width; x++) {
          const pos = length <= 1 ? 0.5 : x * invSpan;
          const raw = (Math.abs(pos - center) - band) * invSpread;
          const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
          mixByX[x] = t * t * (3 - 2 * t);
        }
        for (let y = 0; y < height; y++) {
          const rowBase = y * width * 4;
          for (let x = 0; x < width; x++) {
            const mix = mixByX[x]!;
            if (mix === 0) continue;
            const i = rowBase + x * 4;
            if (!data[i + 3]) continue;
            const invMix = 1 - mix;
            data[i] = data[i]! * invMix + blurred[i]! * mix;
            data[i + 1] = data[i + 1]! * invMix + blurred[i + 1]! * mix;
            data[i + 2] = data[i + 2]! * invMix + blurred[i + 2]! * mix;
          }
        }
      } else {
        for (let y = 0; y < height; y++) {
          const pos = length <= 1 ? 0.5 : y * invSpan;
          const raw = (Math.abs(pos - center) - band) * invSpread;
          const t = raw <= 0 ? 0 : raw >= 1 ? 1 : raw;
          const mix = t * t * (3 - 2 * t);
          if (mix === 0) continue;
          const invMix = 1 - mix;
          const rowBase = y * width * 4;
          const rowEnd = rowBase + width * 4;
          for (let i = rowBase; i < rowEnd; i += 4) {
            if (!data[i + 3]) continue;
            data[i] = data[i]! * invMix + blurred[i]! * mix;
            data[i + 1] = data[i + 1]! * invMix + blurred[i + 1]! * mix;
            data[i + 2] = data[i + 2]! * invMix + blurred[i + 2]! * mix;
          }
        }
      }
      return data;
    }

    case "chromatic": {
      const dx = Number(f.x), dy = Number(f.y);
      if (amount === 0 || (dx === 0 && dy === 0)) return data;
      const sample = data.slice();
      const maxX = width - 1, maxY = height - 1;
      const scale = amount / 255;
      for (let y = 0; y < height; y++) {
        const syR = y + dy < 0 ? 0 : y + dy > maxY ? maxY : y + dy;
        const syB = y - dy < 0 ? 0 : y - dy > maxY ? maxY : y - dy;
        const rowR = syR * width, rowB = syB * width, rowBase = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = rowBase + x * 4;
          if (!sample[i + 3]) continue;
          const sxR = x + dx < 0 ? 0 : x + dx > maxX ? maxX : x + dx;
          const sxB = x - dx < 0 ? 0 : x - dx > maxX ? maxX : x - dx;
          const jR = (rowR + sxR) * 4;
          const jB = (rowB + sxB) * 4;
          const aR = sample[jR + 3]!;
          if (aR) data[i] = sample[i]! + (sample[jR]! - sample[i]!) * scale * aR;
          const aB = sample[jB + 3]!;
          if (aB) data[i + 2] = sample[i + 2]! + (sample[jB + 2]! - sample[i + 2]!) * scale * aB;
        }
      }
      return data;
    }

    default:
      throw new Error("Unknown advanced image tool.");
  }
}
