import { browserFields } from "./crop-geometry";
import { parseTransformSettings } from "../src/transform";

export const exportPresets = {
  web: { label: "Web", description: "WebP · quality 80 · up to 1600px wide", fields: { width: "1600", format: "webp", quality: "80" } },
  email: { label: "Email", description: "JPEG · quality 75 · up to 1200px wide", fields: { width: "1200", format: "jpeg", quality: "75", progressive: "true" } },
  lossless: { label: "Lossless", description: "Lossless WebP · original dimensions", fields: { format: "webp", lossless: "true" } },
} as const;

export const SETTINGS_KEY = "smush.settings.v1";
export interface SavedSettings {
  version: 1;
  fields: Record<string, string>;
  ratioLocked: boolean;
}

/** Normalize known transform fields only; never persist images or source URLs. */
export function savedSettings(fields: Record<string, string>, ratioLocked: boolean): SavedSettings {
  const settings = parseTransformSettings(fields);
  return {
    version: 1,
    fields: { ...Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, value === undefined ? "" : String(value)])), ...browserFields(fields) },
    ratioLocked,
  };
}

export function readSavedSettings(value: string | null): SavedSettings | null {
  if (!value) return null;
  try {
    const data = JSON.parse(value);
    if (data?.version !== 1 || typeof data.ratioLocked !== "boolean" ||
        !data.fields || typeof data.fields !== "object" || Array.isArray(data.fields) ||
        !Object.values(data.fields).every(value => typeof value === "string")) return null;
    return savedSettings(data.fields, data.ratioLocked);
  } catch {
    return null;
  }
}
