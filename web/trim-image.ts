import { finishingSettings } from "./finishing-settings";
import { runPixelTask } from "./pixel-effects";
export async function trimImageRect(image: CanvasImageSource, rect: { x: number; y: number; width: number; height: number }, fields: Record<string, string>, signal: AbortSignal) {
  signal.throwIfAborted();
  if (rect.width * rect.height > 12000000) throw new Error("Use a crop or source under 12 megapixels for transparent trimming.");
  const canvas = document.createElement("canvas"); canvas.width = rect.width; canvas.height = rect.height;
  try {
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const { bounds } = await runPixelTask(ctx.getImageData(0, 0, rect.width, rect.height), finishingSettings(fields), signal, "trim");
    return { ...bounds, x: rect.x + bounds.x, y: rect.y + bounds.y };
  } finally { canvas.width = canvas.height = 0; }
}
