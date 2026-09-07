import { alphaBounds } from "./trim-geometry";
import { adjustPixels } from "./pixel-operations";
self.onmessage = (event: MessageEvent<{ pixels: ImageData; fields: Record<string, string>; operation?: string }>) => {
  try {
    const { pixels, fields } = event.data;
    if (event.data.operation === "trim") {
      self.postMessage({ bounds: alphaBounds(pixels.data, pixels.width, pixels.height, Number(fields.trimThreshold || 0), Number(fields.trimPadding || 0)) }); return;
    }
    adjustPixels(pixels.data, pixels.width, pixels.height, fields);
    self.postMessage({ pixels }, { transfer: [pixels.data.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Image adjustment failed." }); }
};
