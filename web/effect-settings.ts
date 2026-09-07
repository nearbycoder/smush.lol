export interface Redaction { x: number; y: number; width: number; height: number; mode: "black" | "blur" }
export function redactions(value = "[]"): Redaction[] {
  const items: unknown = JSON.parse(value || "[]");
  if (!Array.isArray(items) || items.length > 30) throw new Error("Use at most 30 redaction regions.");
  return items.map(item => {
    if (!item || !["black", "blur"].includes(item.mode) || ![item.x, item.y, item.width, item.height].every(n => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1) || item.width <= 0 || item.height <= 0 || item.x + item.width > 1.000001 || item.y + item.height > 1.000001) throw new Error("Invalid redaction region.");
    return { x: item.x, y: item.y, width: item.width, height: item.height, mode: item.mode };
  });
}
export function effectSettings(fields: Record<string, string>): Record<string, string> {
  const bounded = (key: string, fallback: number, min: number, max: number) => {
    const value = Number(fields[key] ?? fallback);
    if (!Number.isFinite(value) || value < min || value > max) throw new Error("Invalid watermark size or opacity.");
    return String(value);
  };
  return {
    removeBackground: ["true", "on"].includes(fields.removeBackground ?? "") ? "true" : "false",
    redactions: JSON.stringify(redactions(fields.redactions)),
    watermarkText: (fields.watermarkText ?? "").slice(0, 120),
    watermarkOpacity: bounded("watermarkOpacity", 70, 1, 100), watermarkSize: bounded("watermarkSize", 20, 2, 80),
    watermarkPosition: ["top-left", "top-right", "center", "bottom-left", "bottom-right"].includes(fields.watermarkPosition ?? "") ? fields.watermarkPosition! : "bottom-right",
    watermarkColor: /^#[\da-f]{6}$/i.test(fields.watermarkColor ?? "") ? fields.watermarkColor! : "#ffffff",
  };
}
export const hasEffects = (fields: Record<string, string>) => fields.removeBackground === "true" || Boolean(fields.watermarkText?.trim() || fields.watermarkLogo || (fields.redactions && fields.redactions !== "[]"));
