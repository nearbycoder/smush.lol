import avif, { init as initAvif } from "@jsquash/avif/encode";
import webp, { init as initWebp } from "@jsquash/webp/encode";
import { fitTargetSize } from "../src/target-size";
self.onmessage = async (event: MessageEvent<{ pixels: ImageData; format: string; quality: number; lossless: boolean; targetKB?: number }>) => {
  try {
    const { pixels, format, quality, lossless, targetKB } = event.data;
    const locateFile = (name: string) => `/codecs/${format}/${name}`;
    if (format === "avif") await initAvif({ locateFile });
    else await initWebp({ locateFile });
    const encode = async (q: number) => ({ output: new Blob([format === "avif" ? await avif(pixels, { quality: q, speed: 8 }) : await webp(pixels, { quality: q, lossless: Number(lossless) })], { type: `image/${format}` }), quality: q });
    const result = targetKB ? await fitTargetSize(quality, targetKB * 1024, encode) : await encode(quality);
    self.postMessage(result);
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Encoding failed." }); }
};
