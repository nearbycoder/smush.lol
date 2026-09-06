import { browserFields, cropRect } from "./crop-geometry";
import { MAX_FILE_BYTES, MAX_PIXELS } from "../src/transform";

export function needsPreparation(fields: Record<string, string>): boolean {
  return Boolean(fields.cropRatio || (fields.format === "jpeg" && fields.background));
}

export async function prepareImage(file: File, fields: Record<string, string>, signal: AbortSignal): Promise<File> {
  signal.throwIfAborted();
  if (!needsPreparation(fields)) return file;
  const values = browserFields(fields);
  const url = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement("canvas");
  try {
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error("This browser cannot crop or fill this format. Try a PNG, JPEG, or WebP source, or turn off cropping and background color."); }
    signal.throwIfAborted();
    if (image.naturalWidth * image.naturalHeight > MAX_PIXELS) throw new Error("Use an image under 48 megapixels for cropping.");
    const rect = cropRect(image.naturalWidth, image.naturalHeight, values);
    canvas.width = rect.width;
    canvas.height = rect.height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Your browser could not prepare this image.");
    if (fields.format === "jpeg" && values.background) {
      context.fillStyle = values.background;
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.drawImage(image, rect.x, rect.y, rect.width, rect.height, 0, 0, rect.width, rect.height);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Could not prepare this image.")), "image/png"));
    signal.throwIfAborted();
    if (blob.size > MAX_FILE_BYTES) throw new Error("The prepared image exceeds 15 MB. Choose a smaller crop or source image.");
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".png", { type: "image/png" });
  } finally {
    image.removeAttribute("src");
    URL.revokeObjectURL(url);
    canvas.width = canvas.height = 0;
  }
}
