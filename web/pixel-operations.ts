import { finishingSettings } from "./finishing-settings";

function parseHexRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

export function adjustPixels(data: Uint8ClampedArray, width: number, height: number, fields: Record<string, string>) {
  const settings = finishingSettings(fields);
  const contrastVal = Number(settings.contrast);
  const exposureVal = Number(settings.exposure);
  const hasTone = contrastVal !== 100 || exposureVal !== 0;
  const filter = settings.colorFilter;
  const amount = Number(settings.filterAmount) / 100;
  const hasFilter = filter !== "none" && amount > 0;
  const duotone = settings.duotone === "true" ? Number(settings.duotoneAmount) / 100 : 0;

  if (hasTone || hasFilter || duotone > 0) {
    const contrast = contrastVal / 100;
    const exposure = 2 ** exposureVal;
    const tones = hasTone
      ? Uint8ClampedArray.from({ length: 256 }, (_, n) => (n * exposure - 128) * contrast + 128)
      : null;
    const invAmount = 1 - amount;
    const invDuotone = 1 - duotone;
    const [darkR, darkG, darkB] = duotone ? parseHexRgb(settings.duotoneDark!) : [0, 0, 0];
    const [lightR, lightG, lightB] = duotone ? parseHexRgb(settings.duotoneLight!) : [0, 0, 0];
    const diffR = lightR - darkR;
    const diffG = lightG - darkG;
    const diffB = lightB - darkB;

    for (let i = 0, len = data.length; i < len; i += 4) {
      if (!data[i + 3]) continue;
      let r = tones ? tones[data[i]!]! : data[i]!;
      let g = tones ? tones[data[i + 1]!]! : data[i + 1]!;
      let b = tones ? tones[data[i + 2]!]! : data[i + 2]!;

      if (hasFilter) {
        let cr = r, cg = g, cb = b;
        if (filter === "grayscale") {
          cr = cg = cb = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        } else if (filter === "sepia") {
          cr = Math.min(255, 0.393 * r + 0.769 * g + 0.189 * b);
          cg = Math.min(255, 0.349 * r + 0.686 * g + 0.168 * b);
          cb = Math.min(255, 0.272 * r + 0.534 * g + 0.131 * b);
        } else if (filter === "invert") {
          cr = 255 - r;
          cg = 255 - g;
          cb = 255 - b;
        }
        data[i] = r * invAmount + cr * amount;
        data[i + 1] = g * invAmount + cg * amount;
        data[i + 2] = b * invAmount + cb * amount;
      } else if (tones) {
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
      }

      if (duotone) {
        const dr = data[i]!, dg = data[i + 1]!, db = data[i + 2]!;
        const luminance = (0.2126 * dr + 0.7152 * dg + 0.0722 * db) / 255;
        data[i] = dr * invDuotone + (darkR + diffR * luminance) * duotone;
        data[i + 1] = dg * invDuotone + (darkG + diffG * luminance) * duotone;
        data[i + 2] = db * invDuotone + (darkB + diffB * luminance) * duotone;
      }
    }
  }

  return sharpenPixels(data, width, height, Number(settings.sharpen) / 100);
}

export function sharpenPixels(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (!amount) return data;
  if (width * height > 12000000) throw new Error("Resize below 12 megapixels before sharpening.");
  const source = new Uint8ClampedArray(data);
  const rowStride = width * 4;
  const maxX = width - 1;
  const maxY = height - 1;
  const inv255 = 1 / 255;

  for (let y = 0; y < height; y++) {
    const rowBase = y * rowStride;
    const upOffset = y > 0 ? -rowStride : 0;
    const downOffset = y < maxY ? rowStride : 0;
    for (let x = 0; x < width; x++) {
      const i = rowBase + x * 4;
      if (!source[i + 3]) continue;
      const left = x > 0 ? i - 4 : i;
      const right = x < maxX ? i + 4 : i;
      const up = i + upOffset;
      const down = i + downOffset;
      const la = source[left + 3]! * inv255;
      const ra = source[right + 3]! * inv255;
      const ua = source[up + 3]! * inv255;
      const da = source[down + 3]! * inv255;
      const cr = source[i]!, cg = source[i + 1]!, cb = source[i + 2]!;
      data[i] = cr + ((cr - source[left]!) * la + (cr - source[right]!) * ra + (cr - source[up]!) * ua + (cr - source[down]!) * da) * amount;
      data[i + 1] = cg + ((cg - source[left + 1]!) * la + (cg - source[right + 1]!) * ra + (cg - source[up + 1]!) * ua + (cg - source[down + 1]!) * da) * amount;
      data[i + 2] = cb + ((cb - source[left + 2]!) * la + (cb - source[right + 2]!) * ra + (cb - source[up + 2]!) * ua + (cb - source[down + 2]!) * da) * amount;
    }
  }
  return data;
}
