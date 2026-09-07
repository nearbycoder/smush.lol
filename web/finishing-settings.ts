export function bounded(fields: Record<string, string>, key: string, fallback: number, min: number, max: number): number { const value = Number(fields[key] || fallback); if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${key} must be between ${min} and ${max}.`); return value; }
export const enabled = (value?: string) => value === "true" || value === "on";
export function finishingSettings(fields: Record<string, string>): Record<string, string> {
  return { borderSize: String(Math.round(bounded(fields, "borderSize", 0, 0, 1024))), borderColor: /^#[\da-f]{6}$/i.test(fields.borderColor ?? "") ? fields.borderColor! : "#ffffff", borderTransparent: String(enabled(fields.borderTransparent)) };
}
export const hasFinishing = (fields: Record<string, string>) => Number(fields.borderSize || 0) !== 0;
export function canvasBounds(width: number, height: number) { if (width > 12000 || height > 12000 || width * height > 48000000) throw new Error("Finished image exceeds 12,000px per side or 48 megapixels. Reduce the image or border size."); return { width, height }; }
export function borderBounds(width: number, height: number, size: number) { return canvasBounds(width + 2 * size, height + 2 * size); }
