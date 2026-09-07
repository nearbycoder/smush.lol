import { finishingSettings, borderBounds, cornerPixels } from "./finishing-settings";
export function finishCanvas(canvas: HTMLCanvasElement, fields: Record<string, string>): HTMLCanvasElement {
  const settings = finishingSettings(fields), border = Number(settings.borderSize);
  if (border) {
    const bounds = borderBounds(canvas.width, canvas.height, border), next = document.createElement("canvas"); next.width = bounds.width; next.height = bounds.height;
    const ctx = next.getContext("2d")!;
    if (settings.borderTransparent !== "true") { ctx.fillStyle = settings.borderColor!; ctx.fillRect(0, 0, next.width, next.height); }
    ctx.drawImage(canvas, border, border); canvas.width = canvas.height = 0; canvas = next;
  }
  const radius = cornerPixels(canvas.width, canvas.height, Number(settings.cornerRadius));
  if (radius) {
    const ctx = canvas.getContext("2d")!;
    ctx.save(); ctx.globalCompositeOperation = "destination-in";
    ctx.beginPath(); ctx.roundRect(0, 0, canvas.width, canvas.height, radius); ctx.fill(); ctx.restore();
  }
  return canvas;
}
