import { finishingSettings } from "./finishing-settings";
export function adjustPixels(data: Uint8ClampedArray, width: number, height: number, fields: Record<string, string>) {
  const settings = finishingSettings(fields), amount = Number(settings.filterAmount) / 100;
  for (let i = 0; i < data.length; i += 4) {
    if (!data[i + 3]) continue;
    const r = data[i]!, g = data[i + 1]!, b = data[i + 2]!;
    let color = [r, g, b];
    if (settings.colorFilter === "grayscale") { const y = .2126 * r + .7152 * g + .0722 * b; color = [y, y, y]; }
    if (settings.colorFilter === "sepia") color = [Math.min(255, .393*r+.769*g+.189*b), Math.min(255,.349*r+.686*g+.168*b), Math.min(255,.272*r+.534*g+.131*b)];
    if (settings.colorFilter === "invert") color = [255-r, 255-g, 255-b];
    for (let c = 0; c < 3; c++) data[i+c] = data[i+c]! * (1-amount) + color[c]! * amount;
  }
  return data;
}
