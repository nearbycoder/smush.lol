let cached: { file: File; blob: Blob } | undefined;
export async function removeBackground(file: File, pixels: ImageData, signal: AbortSignal): Promise<Blob> {
  signal.throwIfAborted();
  if (cached?.file === file) return cached.blob;
  const worker = new Worker("/background-worker.js", { type: "module" });
  try {
    const blob = await new Promise<Blob>((resolve, reject) => {
      const abort = () => reject(signal.reason);
      signal.addEventListener("abort", abort, { once: true });
      worker.onerror = () => { signal.removeEventListener("abort", abort); reject(new Error("Could not load background removal. Check your connection and retry.")); };
      worker.onmessage = event => {
        if (event.data.progress) { document.dispatchEvent(new CustomEvent("processing-progress", { detail: event.data.progress })); return; }
        signal.removeEventListener("abort", abort);
        event.data.error ? reject(new Error(`Background removal failed: ${event.data.error}`)) : resolve(event.data.output);
      };
      worker.postMessage({ pixels }, [pixels.data.buffer]);
    });
    signal.throwIfAborted(); cached = { file, blob }; return blob;
  } finally { worker.terminate(); }
}
