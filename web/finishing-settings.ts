export function bounded(fields: Record<string, string>, key: string, fallback: number, min: number, max: number): number { const value = Number(fields[key] || fallback); if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`); return value; }
export const enabled = (value?: string) => value === "true" || value === "on";
export function finishingSettings(fields: Record<string, string>): Record<string, string> {
  if (fields.colorFilter && !["none", "grayscale", "sepia", "invert"].includes(fields.colorFilter)) throw new Error("Choose a supported color filter.");
  return { sharpen: String(bounded(fields, "sharpen", 0, 0, 200)), contrast: String(bounded(fields, "contrast", 100, 0, 200)), exposure: String(bounded(fields, "exposure", 0, -3, 3)), colorFilter: fields.colorFilter || "none", filterAmount: String(bounded(fields, "filterAmount", 100, 0, 100)), cornerRadius: String(bounded(fields, "cornerRadius", 0, 0, 50)), borderSize: String(Math.round(bounded(fields, "borderSize", 0, 0, 1024))), borderColor: /^#[\da-f]{6}$/i.test(fields.borderColor ?? "") ? fields.borderColor! : "#ffffff", borderTransparent: String(enabled(fields.borderTransparent)) };
}
export const hasFinishing = (fields: Record<string, string>) => hasPixelEffects(fields) || Number(fields.borderSize || 0) !== 0 || Number(fields.cornerRadius || 0) !== 0;
export function canvasBounds(width: number, height: number) { if (width > 12000 || height > 12000 || width * height > 48000000) throw new Error("Finished image exceeds 12,000px per side or 48 megapixels. Reduce the image or border size."); return { width, height }; }
export function borderBounds(width: number, height: number, size: number) { return canvasBounds(width + 2 * size, height + 2 * size); }

export const cornerPixels = (width: number, height: number, percent: number) => Math.min(width, height) * Math.min(50, Math.max(0, percent)) / 100;

export const hasPixelEffects = (fields: Record<string, string>) => Number(fields.sharpen || 0) > 0 || Number(fields.contrast ?? 100) !== 100 || Number(fields.exposure || 0) !== 0 || Boolean(fields.colorFilter && fields.colorFilter !== "none" && Number(fields.filterAmount ?? 100) > 0);
