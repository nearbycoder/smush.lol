import { adjustPixels } from "./pixel-operations";
self.onmessage = (event: MessageEvent<{ pixels: ImageData; fields: Record<string, string> }>) => {
  try {
    const { pixels, fields } = event.data;
    adjustPixels(pixels.data, pixels.width, pixels.height, fields);
    self.postMessage({ pixels }, { transfer: [pixels.data.buffer] });
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Image adjustment failed." }); }
};
