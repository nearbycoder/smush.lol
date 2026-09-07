import { finishingSettings } from "./finishing-settings";
export function adjustPixels(data: Uint8ClampedArray, width: number, height: number, fields: Record<string, string>) {
  const settings = finishingSettings(fields), amount = Number(settings.filterAmount) / 100;
  const duotone = settings.duotone === "true" ? Number(settings.duotoneAmount) / 100 : 0;
  const rgb = (hex: string) => [1,3,5].map(start => parseInt(hex.slice(start, start+2),16));
  const dark = rgb(settings.duotoneDark!), light = rgb(settings.duotoneLight!);
  const contrast = Number(settings.contrast) / 100, exposure = 2 ** Number(settings.exposure);
  // A lookup table avoids repeated exposure/contrast arithmetic on large images.
  const tones = Uint8ClampedArray.from({ length: 256 }, (_, n) => (n * exposure - 128) * contrast + 128);
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    for (let c = 0; c < 3; c++) data[i+c] = tones[data[i+c]!]!;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    let color = [r, g, b];
    if (settings.colorFilter === "grayscale") { const y = .2126 * r + .7152 * g + .0722 * b; color = [y, y, y]; }
    if (settings.colorFilter === "sepia") color = [Math.min(255, .393*r+.769*g+.189*b), Math.min(255,.349*r+.686*g+.168*b), Math.min(255,.272*r+.534*g+.131*b)];
    if (settings.colorFilter === "invert") color = [255-r, 255-g, 255-b];
    for (let c = 0; c < 3; c++) data[i+c] = data[i+c]! * (1-amount) + color[c]! * amount;
    if (duotone) {
      const luminance = (.2126*data[i]! + .7152*data[i+1]! + .0722*data[i+2]!) / 255;
      for (let c = 0; c < 3; c++) data[i+c] = data[i+c]! * (1-duotone) + (dark[c]! + (light[c]!-dark[c]!)*luminance) * duotone;
    }
  }
  return sharpenPixels(data, width, height, Number(settings.sharpen) / 100);
}

export function sharpenPixels(data: Uint8ClampedArray, width: number, height: number, amount: number) {
  if (!amount) return data;
  if (width * height > 12000000) throw new Error("Resize below 12 megapixels before sharpening.");
  const source = new Uint8ClampedArray(data);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const i = (y * width + x) * 4;
    if (!source[i + 3]) continue;
    const neighbors = [x ? i-4 : i, x+1 < width ? i+4 : i, y ? i-width*4 : i, y+1 < height ? i+width*4 : i];
    for (let c = 0; c < 3; c++) {
      const center = source[i+c]!;
      let edge = 0;
      for (const n of neighbors) edge += (center - source[n+c]!) * source[n+3]! / 255;
      data[i+c] = center + edge * amount;
    }
  }
  return data;
}
