declare const SMUSH_BUILD_ID: string;
import { paintPixelEffects } from "./pixel-effects";
import { hasFinishing } from "./finishing-settings";
import { finishCanvas } from "./finishing";
import { hasEffects } from "./effect-settings";
import { paintEffects } from "./effects";
import { removeBackground } from "./background";
import { cropRect } from "./crop-geometry";
import { parseTransformSettings, MAX_PIXELS, MAX_DIMENSION } from "../src/transform";
import { fitTargetSize } from "../src/target-size";

export const isSvg = (file: File) => file.type === "image/svg+xml" || /\.svg$/i.test(file.name);
export const usesBrowser = (file: File | null, fields: Record<string, string>) => ["true", "on"].includes(fields.localOnly ?? "") || hasFinishing(fields) || hasEffects(fields) || fields.format === "avif" || Boolean(file && isSvg(file));
export async function safeSource(file: File): Promise<Blob> {
  if (!isSvg(file)) return file;
  const xml = new DOMParser().parseFromString(await file.text(), "image/svg+xml");
  if (xml.querySelector("parsererror") || xml.documentElement.localName !== "svg") throw new Error("This SVG is invalid.");
  // Reject active content and external dependencies; images must render independently.
  for (const node of Array.from(xml.querySelectorAll("*"))) {
    if (["script", "foreignObject", "style", "animate", "animateMotion", "animateTransform", "set", "image", "use"].includes(node.localName)) throw new Error("Use a self-contained SVG with paths and shapes, without scripts, stylesheets, images, or linked symbols.");
    for (const attr of Array.from(node.attributes)) if (/^on/i.test(attr.name) || /(?:href|src)$/i.test(attr.name) || /url\s*\(\s*[^#]/i.test(attr.value) || /@import/i.test(attr.value)) throw new Error("Remove external references and active content from the SVG.");
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(await file.text())) throw new Error("SVG document entities are not supported.");
  return new Blob([new XMLSerializer().serializeToString(xml)], { type: "image/svg+xml" });
}
export async function decodeSource(file: File): Promise<{ image: HTMLImageElement; release: () => void }> {
  const url = URL.createObjectURL(await safeSource(file));
  const image = new Image();
  const release = () => { image.removeAttribute("src"); URL.revokeObjectURL(url); };
  try { image.src = url; await image.decode(); if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error("Use an image under 48 megapixels."); return { image, release }; }
  catch (error) { release(); throw new Error(error instanceof Error && error.message.includes("megapixels") ? error.message : "This browser cannot decode this image. Try PNG, JPEG, WebP, AVIF, or a self-contained SVG."); }
}
export function outputSize(width: number, height: number, fields: Record<string, string>) {
  const settings = parseTransformSettings({ ...fields, format: fields.format === "avif" ? "jpeg" : fields.format });
  const rotated = settings.rotate === 90 || settings.rotate === 270;
  const w = rotated ? height : width, h = rotated ? width : height;
  let scale = Math.min(settings.width ? settings.width / w : Infinity, settings.height ? settings.height / h : Infinity);
  if (!Number.isFinite(scale)) scale = 1;
  if (settings.withoutEnlargement) scale = Math.min(scale, 1);
  const size = settings.fit === "fill" && settings.width && settings.height
    ? { width: settings.withoutEnlargement ? Math.min(settings.width, w) : settings.width, height: settings.withoutEnlargement ? Math.min(settings.height, h) : settings.height }
    : { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)) };
  if (size.width > MAX_DIMENSION || size.height > MAX_DIMENSION || size.width * size.height > MAX_PIXELS) throw new Error("Keep output under 48 megapixels and 12,000px per side.");
  return { ...size, rotated, settings };
}
export async function renderImage(file: File, fields: Record<string, string>, signal: AbortSignal): Promise<HTMLCanvasElement> {
  signal.throwIfAborted();
  let { image, release } = await decodeSource(file);
  try {
    signal.throwIfAborted();
    if (fields.removeBackground === "true") {
      const raw = document.createElement("canvas"); raw.width = image.naturalWidth; raw.height = image.naturalHeight;
      if (raw.width * raw.height > 12000000) throw new Error("Use a source under 12 megapixels for background removal.");
      try {
        const context = raw.getContext("2d")!; context.drawImage(image, 0, 0);
        const blob = await removeBackground(file, context.getImageData(0, 0, raw.width, raw.height), signal);
        release(); ({ image, release } = await decodeSource(new File([blob], "cutout.png", { type: "image/png" })));
      } finally { raw.width = raw.height = 0; }
    }
    const rect = cropRect(image.naturalWidth, image.naturalHeight, fields);
    const { width, height, rotated, settings } = outputSize(rect.width, rect.height, fields);
    let canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    if (fields.format === "jpeg") { ctx.fillStyle = /^#[\da-f]{6}$/i.test(fields.background ?? "") ? fields.background! : "#ffffff"; ctx.fillRect(0, 0, width, height); }
    ctx.save(); ctx.translate(width / 2, height / 2); ctx.scale(settings.flop ? -1 : 1, settings.flip ? -1 : 1); ctx.rotate(settings.rotate * Math.PI / 180);
    ctx.filter = `brightness(${settings.brightness}) saturate(${settings.saturation})`;
    ctx.imageSmoothingQuality = "high";
    const dw = rotated ? height : width, dh = rotated ? width : height;
    ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height, -dw / 2, -dh / 2, dw, dh); ctx.restore();
    try { await paintPixelEffects(canvas, fields, signal); await paintEffects(canvas, fields, signal); signal.throwIfAborted(); canvas = finishCanvas(canvas, fields); return canvas; } catch (error) { canvas.width = canvas.height = 0; throw error; }
  } finally { release(); }
}
export const canvasBlob = (canvas: HTMLCanvasElement, type = "image/png", quality?: number) => new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob && blob.type === type ? resolve(blob) : reject(new Error(`This browser cannot encode ${type}.`)), type, quality));
export async function localResponse(file: File, fields: Record<string, string>, signal: AbortSignal): Promise<Response> {
  const canvas = await renderImage(file, fields, signal);
  try {
    const format = fields.format || "webp";
    if (format === "jpeg") { const ctx = canvas.getContext("2d")!; ctx.save(); ctx.globalCompositeOperation = "destination-over"; ctx.fillStyle = /^#[\da-f]{6}$/i.test(fields.background ?? "") ? fields.background! : "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.restore(); }
    const settings = parseTransformSettings({ ...fields, format: format === "avif" ? "jpeg" : format });
    const encode = async (q: number) => ({ output: await canvasBlob(canvas, `image/${format}`, q / 100), quality: q });
    let result: { output: Blob; quality: number };
    if (format === "avif" || format === "webp") {
      signal.throwIfAborted();
      const worker = new Worker(`/codec-worker.js?v=${SMUSH_BUILD_ID}`, { type: "module" });
      try {
        result = await new Promise((resolve, reject) => {
          const abort = () => reject(signal.reason);
          signal.addEventListener("abort", abort, { once: true });
          worker.onerror = () => { signal.removeEventListener("abort", abort); reject(new Error("Could not load the local encoder. Reload and retry.")); };
          worker.onmessage = event => { signal.removeEventListener("abort", abort); event.data.error ? reject(new Error(event.data.error)) : resolve(event.data); };
          const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
          worker.postMessage({ pixels, format, quality: settings.quality, lossless: settings.lossless, targetKB: settings.targetKB }, [pixels.data.buffer]);
        });
      } finally { worker.terminate(); }
    } else result = settings.targetKB ? await fitTargetSize(settings.quality, settings.targetKB * 1024, encode) : await encode(settings.quality);
    signal.throwIfAborted();
    const name = file.name.replace(/\.[^.]+$/, "").replace(/[^\w.-]/g, "-");
    return new Response(result.output, { headers: { "content-type": result.output.type, "content-disposition": `attachment; filename="smushed-${name}.${format === "jpeg" ? "jpg" : format}"`, "x-image-width": String(canvas.width), "x-image-height": String(canvas.height), "x-image-quality": String(result.quality), "x-processing-mode": "browser" } });
  } finally { canvas.width = canvas.height = 0; }
}
