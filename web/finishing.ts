import { finishingSettings, borderBounds } from "./finishing-settings";
export function finishCanvas(canvas: HTMLCanvasElement, fields: Record<string, string>): HTMLCanvasElement {
  const settings = finishingSettings(fields), border = Number(settings.borderSize);
  if (border) {
    const bounds = borderBounds(canvas.width, canvas.height, border), next = document.createElement("canvas"); next.width = bounds.width; next.height = bounds.height;
    const ctx = next.getContext("2d")!;
    if (settings.borderTransparent !== "true") { ctx.fillStyle = settings.borderColor!; ctx.fillRect(0, 0, next.width, next.height); }
    ctx.drawImage(canvas, border, border); canvas.width = canvas.height = 0; canvas = next;
  }
  return canvas;
}
