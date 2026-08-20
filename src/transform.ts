export const MAX_FILE_BYTES = 15 * 1024 * 1024;
export const MAX_PIXELS = 48_000_000;
export const MAX_DIMENSION = 12_000;

export const filters = [
  "lanczos3",
  "lanczos2",
  "mitchell",
  "cubic",
  "mks2013",
  "mks2021",
  "bilinear",
  "linear",
  "box",
  "nearest",
] as const;

export type ResizeFilter = (typeof filters)[number];
export type OutputFormat = "jpeg" | "png" | "webp";
export type FitMode = "inside" | "fill";

export interface TransformSettings {
  width?: number;
  height?: number;
  fit: FitMode;
  filter: ResizeFilter;
  withoutEnlargement: boolean;
  rotate: 0 | 90 | 180 | 270;
  flip: boolean;
  flop: boolean;
  brightness: number;
  saturation: number;
  format: OutputFormat;
  quality: number;
  progressive: boolean;
  lossless: boolean;
  compressionLevel: number;
  palette: boolean;
  colors: number;
  dither: boolean;
}

type FormFields = Record<string, FormDataEntryValue | undefined>;

function readString(fields: FormFields, key: string): string | undefined {
  const value = fields[key];
  return typeof value === "string" ? value : undefined;
}

function readBoolean(fields: FormFields, key: string, fallback = false): boolean {
  const value = readString(fields, key);
  if (value === undefined) return fallback;
  return value === "true" || value === "1" || value === "on";
}

function readNumber(
  fields: FormFields,
  key: string,
  fallback: number,
  min: number,
  max: number,
): number {
  const raw = readString(fields, key);
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function readDimension(fields: FormFields, key: string): number | undefined {
  const raw = readString(fields, key);
  if (raw === undefined || raw.trim() === "") return undefined;

  const value = Math.round(Number(raw));
  if (!Number.isFinite(value) || value < 1 || value > MAX_DIMENSION) {
    throw new Error(`${key} must be between 1 and ${MAX_DIMENSION.toLocaleString()}`);
  }

  return value;
}

export function parseTransformSettings(fields: FormFields): TransformSettings {
  const fitValue = readString(fields, "fit");
  const fit: FitMode = fitValue === "fill" ? "fill" : "inside";

  const filterValue = readString(fields, "filter");
  const filter: ResizeFilter = filters.includes(filterValue as ResizeFilter)
    ? (filterValue as ResizeFilter)
    : "lanczos3";

  const formatValue = readString(fields, "format");
  const format: OutputFormat =
    formatValue === "jpeg" || formatValue === "png" ? formatValue : "webp";

  const rotation = readNumber(fields, "rotate", 0, 0, 270);
  const rotate: TransformSettings["rotate"] =
    rotation === 90 || rotation === 180 || rotation === 270 ? rotation : 0;

  return {
    width: readDimension(fields, "width"),
    height: readDimension(fields, "height"),
    fit,
    filter,
    withoutEnlargement: readBoolean(fields, "withoutEnlargement"),
    rotate,
    flip: readBoolean(fields, "flip"),
    flop: readBoolean(fields, "flop"),
    brightness: readNumber(fields, "brightness", 1, 0, 3),
    saturation: readNumber(fields, "saturation", 1, 0, 3),
    format,
    quality: Math.round(readNumber(fields, "quality", 82, 1, 100)),
    progressive: readBoolean(fields, "progressive"),
    lossless: readBoolean(fields, "lossless"),
    compressionLevel: Math.round(readNumber(fields, "compressionLevel", 6, 0, 9)),
    palette: readBoolean(fields, "palette"),
    colors: Math.round(readNumber(fields, "colors", 128, 2, 256)),
    dither: readBoolean(fields, "dither"),
  };
}

export function validateOutputSize(
  settings: TransformSettings,
  source: { width: number; height: number },
): void {
  let width = settings.width ?? source.width;
  let height = settings.height ?? source.height;

  if (settings.width && !settings.height) {
    height = Math.round((settings.width / source.width) * source.height);
  } else if (!settings.width && settings.height) {
    width = Math.round((settings.height / source.height) * source.width);
  } else if (settings.width && settings.height && settings.fit === "inside") {
    const scale = Math.min(settings.width / source.width, settings.height / source.height);
    width = Math.round(source.width * scale);
    height = Math.round(source.height * scale);
  }

  if (settings.rotate === 90 || settings.rotate === 270) {
    [width, height] = [height, width];
  }

  if (width > MAX_DIMENSION || height > MAX_DIMENSION || width * height > MAX_PIXELS) {
    throw new Error("That output would be too large. Keep it under 48 megapixels and 12,000px per side.");
  }
}

export function outputFilename(inputName: string, format: OutputFormat): string {
  const extension = format === "jpeg" ? "jpg" : format;
  const base = inputName
    .replace(/\.[^.]+$/, "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return `smushed-${base || "image"}.${extension}`;
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    const code = "code" in error && typeof error.code === "string" ? error.code : undefined;

    if (code === "ERR_IMAGE_TOO_MANY_PIXELS") {
      return "That image is too large to smush safely. Try one under 48 megapixels.";
    }
    if (code === "ERR_IMAGE_UNKNOWN_FORMAT" || code === "ERR_IMAGE_DECODE_FAILED") {
      return "Bun couldn't read that image. Try a JPEG, PNG, WebP, GIF, BMP, HEIC, AVIF, or TIFF.";
    }
    if (code === "ERR_IMAGE_FORMAT_UNSUPPORTED") {
      return "That image format isn't supported on this server. JPEG, PNG, and WebP work everywhere.";
    }

    return error.message;
  }

  return "The image could not be transformed.";
}
