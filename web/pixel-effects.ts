declare const SMUSH_BUILD_ID: string;
import { hasPixelEffects } from "./finishing-settings";

let idlePixelWorker: Worker | null = null;

export async function runPixelTask(pixels: ImageData, fields: Record<string, string>, signal: AbortSignal, operation = "adjust") {
  signal.throwIfAborted();
  const worker = idlePixelWorker ?? new Worker(`/pixel-worker.js?v=${SMUSH_BUILD_ID}`, { type: "module" });
  idlePixelWorker = null;
  let reusable = false;
  let abort: () => void = () => {};
  try {
    const result = await new Promise<{ pixels: ImageData; bounds: { x: number; y: number; width: number; height: number } }>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () => reject(new Error("Could not load image adjustments. Reload and retry."));
      worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data);
      worker.postMessage({ pixels, fields, operation }, [pixels.data.buffer]);
    });
    signal.throwIfAborted();
    reusable = true;
    return result;
  } finally {
    signal.removeEventListener("abort", abort);
    worker.onmessage = null;
    worker.onerror = null;
    if (reusable && !idlePixelWorker) idlePixelWorker = worker;
    else worker.terminate();
  }
}

export async function paintPixelEffects(canvas: HTMLCanvasElement, fields: Record<string, string>, signal: AbortSignal) {
  if (!hasPixelEffects(fields)) return;
  signal.throwIfAborted();
  if (Number(fields.sharpen || 0) > 0 && canvas.width * canvas.height > 12000000) throw new Error("Resize below 12 megapixels before sharpening.");
  const ctx = canvas.getContext("2d")!;
  const result = await runPixelTask(ctx.getImageData(0, 0, canvas.width, canvas.height), fields, signal);
  ctx.putImageData(result.pixels, 0, 0);
}
