import avif, { init as initAvif } from "@jsquash/avif/encode";
import webp, { init as initWebp } from "@jsquash/webp/encode";
import { fitTargetSize } from "../src/target-size";

let avifReady: Promise<unknown> | null = null;
let webpReady: Promise<unknown> | null = null;

function ensureCodec(format: string) {
  const locateFile = (name: string) => `/codecs/${format}/${name}`;
  if (format === "avif") {
    return (avifReady ??= initAvif({ locateFile }).catch(error => { avifReady = null; throw error; }));
  }
  return (webpReady ??= initWebp({ locateFile }).catch(error => { webpReady = null; throw error; }));
}

self.onmessage = async (event: MessageEvent<{ pixels: ImageData; format: string; quality: number; lossless: boolean; targetKB?: number }>) => {
  try {
    const { pixels, format, quality, lossless, targetKB } = event.data;
    await ensureCodec(format);
    const encode = async (q: number) => ({ output: new Blob([format === "avif" ? await avif(pixels, { quality: q, speed: 8 }) : await webp(pixels, { quality: q, lossless: Number(lossless) })], { type: `image/${format}` }), quality: q });
    const result = targetKB ? await fitTargetSize(quality, targetKB * 1024, encode) : await encode(quality);
    self.postMessage(result);
  } catch (error) { self.postMessage({ error: error instanceof Error ? error.message : "Encoding failed." }); }
};
