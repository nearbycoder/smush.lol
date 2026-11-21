import { advancedKinds, advancedPixels } from "./studio-advanced";
import { studioSize, validateStudio, type StudioKind, type StudioValues } from "./studio-settings";

const clamp = (v: number) => Math.max(0, Math.min(255, v));
const luminance = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
const parseRgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
];

/** Mutates one RGBA raster. Neighborhood operations take a separate immutable sample. */
export function studioPixels(data: Uint8ClampedArray, width: number, height: number, kind: StudioKind, fields: StudioValues) {
  studioSize(width, height);
  if (data.length !== width * height * 4) throw new Error("Invalid pixel buffer.");
  const f = validateStudio(kind, fields);
  if (advancedKinds.has(kind)) return advancedPixels(data, width, height, kind, f);

  const len = data.length;
  switch (kind) {
    case "pixelate": {
      const size = Number(f.size);
      if (size <= 1) return data;
      for (let by = 0; by < height; by += size) {
        const endY = Math.min(height, by + size);
        for (let bx = 0; bx < width; bx += size) {
          const endX = Math.min(width, bx + size);
          let r = 0, g = 0, b = 0, alpha = 0;
          for (let y = by; y < endY; y++) {
            const row = y * width;
            for (let x = bx; x < endX; x++) {
              const i = (row + x) * 4, a = data[i + 3]!;
              r += data[i]! * a; g += data[i + 1]! * a; b += data[i + 2]! * a; alpha += a;
            }
          }
          // Retain the source alpha silhouette, including partially transparent pixels.
          if (alpha) {
            const ar = r / alpha, ag = g / alpha, ab = b / alpha;
            for (let y = by; y < endY; y++) {
              const row = y * width;
              for (let x = bx; x < endX; x++) {
                const i = (row + x) * 4;
                if (data[i + 3]) { data[i] = ar; data[i + 1] = ag; data[i + 2] = ab; }
              }
            }
          }
        }
      }
      return data;
    }

    case "balance": {
      const temperature = Number(f.temperature) * 0.6;
      const tint = Number(f.tint) * 0.4;
      const dr = temperature + tint / 2;
      const dg = -tint;
      const db = -temperature + tint / 2;
      if (dr === 0 && dg === 0 && db === 0) return data;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = data[i]! + dr;
        data[i + 1] = data[i + 1]! + dg;
        data[i + 2] = data[i + 2]! + db;
      }
      return data;
    }

    case "gamma":
    case "levels": {
      const black = kind === "levels" ? Number(f.black) : 0;
      const white = kind === "levels" ? Number(f.white) : 255;
      const invGamma = 1 / Number(f.gamma);
      const scale = 255 / (white - black);
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) {
        lut[v] = 255 * Math.pow(clamp((v - black) * scale) / 255, invGamma);
      }
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = lut[data[i]!]!;
        data[i + 1] = lut[data[i + 1]!]!;
        data[i + 2] = lut[data[i + 2]!]!;
      }
      return data;
    }

    case "tones": {
      const shadows = Number(f.shadows);
      const highlights = Number(f.highlights);
      if (shadows === 0 && highlights === 0) return data;
      const inv255 = 1 / 255;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const l = luminance(r, g, b) * inv255;
        const invL = 1 - l;
        const delta = 0.8 * (shadows * invL * invL + highlights * l * l);
        data[i] = r + delta;
        data[i + 1] = g + delta;
        data[i + 2] = b + delta;
      }
      return data;
    }

    case "vibrance": {
      const amount = Number(f.amount);
      if (amount === 0) return data;
      const amountNorm = amount / 100;
      const positive = amount > 0;
      const inv255 = 1 / 255;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const lum = luminance(r, g, b);
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const factor = 1 + amountNorm * (positive ? 1 - (max - min) * inv255 : 1);
        data[i] = lum + (r - lum) * factor;
        data[i + 1] = lum + (g - lum) * factor;
        data[i + 2] = lum + (b - lum) * factor;
      }
      return data;
    }

    case "hue": {
      const shift = Number(f.angle) / 60;
      if (shift === 0) return data;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const max = r > g ? (r > b ? r : b) : (g > b ? g : b);
        const min = r < g ? (r < b ? r : b) : (g < b ? g : b);
        const delta = max - min;
        if (!delta) continue;
        let hue = max === r ? (g - b) / delta : max === g ? (b - r) / delta + 2 : (r - g) / delta + 4;
        hue = ((hue + shift) % 6 + 6) % 6;
        const x = delta * (1 - Math.abs(hue % 2 - 1));
        if (hue < 1) { data[i] = delta + min; data[i + 1] = x + min; data[i + 2] = min; }
        else if (hue < 2) { data[i] = x + min; data[i + 1] = delta + min; data[i + 2] = min; }
        else if (hue < 3) { data[i] = min; data[i + 1] = delta + min; data[i + 2] = x + min; }
        else if (hue < 4) { data[i] = min; data[i + 1] = x + min; data[i + 2] = delta + min; }
        else if (hue < 5) { data[i] = x + min; data[i + 1] = min; data[i + 2] = delta + min; }
        else { data[i] = delta + min; data[i + 1] = min; data[i + 2] = x + min; }
      }
      return data;
    }

    case "replace":
    case "key": {
      const [fromR, fromG, fromB] = parseRgb(f.from ?? "#000000");
      const [toR, toG, toB] = parseRgb(f.to ?? "#000000");
      const tolerance = Number(f.tolerance);
      const softness = Number(f.softness);
      const invSoftness = softness ? 1 / softness : 0;
      const invMaxDist = 100 / Math.sqrt(3 * 255 * 255);
      const maxReach = tolerance + softness;
      const isKey = kind === "key";
      for (let i = 0; i < len; i += 4) {
        const alpha = data[i + 3]!;
        if (!alpha) continue;
        const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
        const dr = r - fromR, dg = g - fromG, db = b - fromB;
        const distance = Math.sqrt(dr * dr + dg * dg + db * db) * invMaxDist;
        if (distance > maxReach) continue;
        const match = distance <= tolerance ? 1 : invSoftness ? Math.max(0, 1 - (distance - tolerance) * invSoftness) : 0;
        if (match <= 0) continue;
        if (isKey) {
          data[i + 3] = alpha * (1 - match);
        } else {
          data[i] = r + (toR - r) * match;
          data[i + 1] = g + (toG - g) * match;
          data[i + 2] = b + (toB - b) * match;
        }
      }
      return data;
    }

    case "opacity": {
      const factor = Number(f.amount) / 100;
      if (factor === 1) return data;
      for (let i = 3; i < len; i += 4) {
        if (data[i]) data[i] = data[i]! * factor;
      }
      return data;
    }

    case "vignette": {
      const amount = Number(f.amount);
      if (amount === 0) return data;
      const radius = Number(f.radius) / 100;
      const invRange = 1 / (1 - radius);
      const strength = Math.abs(amount) / 100;
      const target = amount < 0 ? 255 : 0;
      const invW = width === 1 ? 0 : 2 / (width - 1);
      const invH = height === 1 ? 0 : 2 / (height - 1);
      const invSqrt2 = Math.SQRT1_2;
      for (let y = 0; y < height; y++) {
        const ny = height === 1 ? 0 : y * invH - 1;
        const ny2 = ny * ny;
        const rowBase = y * width * 4;
        for (let x = 0; x < width; x++) {
          const i = rowBase + x * 4;
          if (!data[i + 3]) continue;
          const nx = width === 1 ? 0 : x * invW - 1;
          const distance = Math.sqrt(nx * nx + ny2) * invSqrt2;
          if (distance <= radius) continue;
          const rawT = (distance - radius) * invRange;
          const t = rawT > 1 ? 1 : rawT;
          const weight = t * t * (3 - 2 * t) * strength;
          const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
          data[i] = r + (target - r) * weight;
          data[i + 1] = g + (target - g) * weight;
          data[i + 2] = b + (target - b) * weight;
        }
      }
      return data;
    }

    case "grain": {
      const amount = Number(f.amount);
      if (amount === 0) return data;
      let seed = Number(f.seed) || 1;
      const scale = amount * 1.28;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
        const noise = ((seed >>> 0) / 4294967296 - 0.5) * scale;
        data[i] = data[i]! + noise;
        data[i + 1] = data[i + 1]! + noise;
        data[i + 2] = data[i + 2]! + noise;
      }
      return data;
    }

    case "posterize": {
      const steps = Number(f.levels) - 1;
      const lut = new Uint8ClampedArray(256);
      for (let v = 0; v < 256; v++) lut[v] = Math.round(v / 255 * steps) * 255 / steps;
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        data[i] = lut[data[i]!]!;
        data[i + 1] = lut[data[i + 1]!]!;
        data[i + 2] = lut[data[i + 2]!]!;
      }
      return data;
    }

    case "threshold": {
      const thresh = Number(f.threshold);
      for (let i = 0; i < len; i += 4) {
        if (!data[i + 3]) continue;
        const v = luminance(data[i]!, data[i + 1]!, data[i + 2]!) >= thresh ? 255 : 0;
        data[i] = data[i + 1] = data[i + 2] = v;
      }
      return data;
    }

    case "edges":
    case "emboss": {
      const amount = Number(f.amount);
      const pixelCount = width * height;
      const lumaBuf = new Float32Array(pixelCount);
      const alphaBuf = new Float32Array(pixelCount);
      const inv255 = 1 / 255;
      for (let p = 0, i = 0; p < pixelCount; p++, i += 4) {
        const a = data[i + 3]!;
        alphaBuf[p] = a * inv255;
        if (a) lumaBuf[p] = luminance(data[i]!, data[i + 1]!, data[i + 2]!);
      }
      const maxX = width - 1;
      const maxY = height - 1;
      if (kind === "emboss") {
        for (let y = 0; y < height; y++) {
          const ym = y > 0 ? (y - 1) * width : 0;
          const yp = y < maxY ? (y + 1) * width : maxY * width;
          const row = y * width;
          for (let x = 0; x < width; x++) {
            const p = row + x;
            const i = p * 4;
            if (!data[i + 3]) continue;
            const lum = lumaBuf[p]!;
            const xm = x > 0 ? x - 1 : 0;
            const xp = x < maxX ? x + 1 : maxX;
            const p1 = yp + xp, p0 = ym + xm;
            const v1 = lumaBuf[p1]! * alphaBuf[p1]! + lum * (1 - alphaBuf[p1]!);
            const v0 = lumaBuf[p0]! * alphaBuf[p0]! + lum * (1 - alphaBuf[p0]!);
            const v = 128 + (v1 - v0) * amount;
            data[i] = data[i + 1] = data[i + 2] = v;
          }
        }
      } else {
        const scale = amount / 4;
        for (let y = 0; y < height; y++) {
          const ym = y > 0 ? (y - 1) * width : 0;
          const y0 = y * width;
          const yp = y < maxY ? (y + 1) * width : maxY * width;
          for (let x = 0; x < width; x++) {
            const p = y0 + x;
            const i = p * 4;
            if (!data[i + 3]) continue;
            const lum = lumaBuf[p]!;
            const xm = x > 0 ? x - 1 : 0;
            const xp = x < maxX ? x + 1 : maxX;
            const tl = ym + xm, tc = ym + x, tr = ym + xp;
            const ml = y0 + xm, mr = y0 + xp;
            const bl = yp + xm, bc = yp + x, br = yp + xp;
            const vtl = lumaBuf[tl]! * alphaBuf[tl]! + lum * (1 - alphaBuf[tl]!);
            const vtc = lumaBuf[tc]! * alphaBuf[tc]! + lum * (1 - alphaBuf[tc]!);
            const vtr = lumaBuf[tr]! * alphaBuf[tr]! + lum * (1 - alphaBuf[tr]!);
            const vml = lumaBuf[ml]! * alphaBuf[ml]! + lum * (1 - alphaBuf[ml]!);
            const vmr = lumaBuf[mr]! * alphaBuf[mr]! + lum * (1 - alphaBuf[mr]!);
            const vbl = lumaBuf[bl]! * alphaBuf[bl]! + lum * (1 - alphaBuf[bl]!);
            const vbc = lumaBuf[bc]! * alphaBuf[bc]! + lum * (1 - alphaBuf[bc]!);
            const vbr = lumaBuf[br]! * alphaBuf[br]! + lum * (1 - alphaBuf[br]!);
            const gx = -vtl + vtr - 2 * vml + 2 * vmr - vbl + vbr;
            const gy = -vtl - 2 * vtc - vtr + vbl + 2 * vbc + vbr;
            const v = Math.sqrt(gx * gx + gy * gy) * scale;
            data[i] = data[i + 1] = data[i + 2] = v;
          }
        }
      }
      return data;
    }

    default:
      throw new Error("This tool needs canvas layout processing.");
  }
}
