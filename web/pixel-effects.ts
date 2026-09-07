import { hasPixelEffects } from "./finishing-settings";
export async function paintPixelEffects(canvas: HTMLCanvasElement, fields: Record<string, string>, signal: AbortSignal) {
  if (!hasPixelEffects(fields)) return;
  signal.throwIfAborted();
  const worker = new Worker("/pixel-worker.js", { type: "module" });
  let abort: () => void = () => {};
  try {
    const pixels = await new Promise<ImageData>((resolve, reject) => {
      abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () => reject(new Error("Could not load image adjustments. Reload and retry."));
      worker.onmessage = event => event.data.error ? reject(new Error(event.data.error)) : resolve(event.data.pixels);
      const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
      worker.postMessage({ pixels, fields }, [pixels.data.buffer]);
    });
    signal.throwIfAborted();
    canvas.getContext("2d")!.putImageData(pixels, 0, 0);
  } finally { signal.removeEventListener("abort", abort); worker.terminate(); }
}
