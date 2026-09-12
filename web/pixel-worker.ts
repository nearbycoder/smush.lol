import { alphaBounds } from "./trim-geometry";
import { adjustPixels } from "./pixel-operations";
import { studioPixels } from "./tools/studio-pixels";
import type { StudioKind } from "./tools/studio-settings";
self.onmessage = (event: MessageEvent<{ pixels: ImageData; fields: Record<string, string>; operation?: string }>) => {
  try {
    const { pixels, fields } = event.data;
    if (event.data.operation === "trim") {
      self.postMessage({ bounds: alphaBounds(pixels.data, pixels.width, pixels.height, Number(fields.trimThreshold || 0), Number(fields.trimPadding || 0)) }); return;
    }
    if (event.data.operation?.startsWith("studio:")) studioPixels(pixels.data, pixels.width, pixels.height, event.data.operation.slice(7) as StudioKind, fields);
    else adjustPixels(pixels.data, pixels.width, pixels.height, fields);
    self.postMessage({ pixels }, { transfer: [pixels.data.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Image adjustment failed." }); }
};
