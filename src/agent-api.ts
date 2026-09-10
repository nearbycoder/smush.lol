import { z } from "zod";
import { transformImage } from "./image";
import { assertSafeRemoteUrl, fetchRemoteImage, RemoteImageError } from "./remote-image";
import { errorMessage, filters, MAX_DIMENSION, MAX_FILE_BYTES, MAX_PIXELS, parseTransformSettings } from "./transform";

export const PUBLIC_URL = new URL(process.env.SMUSH_PUBLIC_URL ?? "https://smush.lol").origin;
export const MAX_INLINE_BYTES = 4 * 1024 * 1024;
export const MAX_AGENT_BODY_BYTES = 6 * 1024 * 1024;

export const sourceSchema = z.union([
  z.strictObject({ url: z.string().url().max(4096).describe("Public HTTP(S) image URL on port 80 or 443.") }),
  z.strictObject({
    base64: z.string().min(4).max(4 * Math.ceil(MAX_INLINE_BYTES / 3)).describe("Standard padded base64 image bytes, at most 4 MiB decoded. No data-URL prefix."),
    filename: z.string().min(1).max(128).optional(),
  }),
]);
export const optionsSchema = z.strictObject({
  width: z.number().int().min(1).max(MAX_DIMENSION).optional(),
  height: z.number().int().min(1).max(MAX_DIMENSION).optional(),
  fit: z.enum(["inside", "fill"]).optional().describe("inside preserves aspect ratio; fill stretches to both dimensions. Default inside."),
  filter: z.enum(filters).optional(),
  withoutEnlargement: z.boolean().optional(),
  rotate: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]).optional(),
  flip: z.boolean().optional().describe("Flip vertically."),
  flop: z.boolean().optional().describe("Flip horizontally."),
  brightness: z.number().min(0).max(3).optional(),
  saturation: z.number().min(0).max(3).optional(),
  format: z.enum(["webp", "jpeg", "png"]).optional().describe("Default webp. AVIF is available only in the browser editor."),
  quality: z.number().int().min(1).max(100).optional().describe("Default 82."),
  targetKB: z.number().int().min(1).max(15360).optional().describe("KiB target for JPEG or lossy WebP; may fail if unreachable."),
  progressive: z.boolean().optional(),
  lossless: z.boolean().optional(),
  compressionLevel: z.number().int().min(0).max(9).optional(),
  palette: z.boolean().optional(),
  colors: z.number().int().min(2).max(256).optional(),
  dither: z.boolean().optional(),
});
export const inspectSchema = z.strictObject({ source: sourceSchema });
export const transformSchema = inspectSchema.extend({ options: optionsSchema.optional() });
export const imageUrlSchema = z.strictObject({ url: z.string().url().max(4096), options: optionsSchema.optional() });
export type ImageSource = z.infer<typeof sourceSchema>;

export const capabilities = {
  name: "smush.lol", apiVersion: "1.0.0", authentication: "none",
  outputFormats: ["webp", "jpeg", "png"],
  operations: ["inspect", "resize", "convert", "compress", "rotate", "flip", "brightness", "saturation"],
  defaults: parseTransformSettings({}),
  limits: { maxSourceBytes: MAX_FILE_BYTES, maxInlineBytes: MAX_INLINE_BYTES, maxJsonBodyBytes: MAX_AGENT_BODY_BYTES, maxPixels: MAX_PIXELS, maxDimension: MAX_DIMENSION },
  storage: "Images are processed in memory. No saved uploads or persistent result URLs. Remote HTTP processing sends image bytes to this server; local stdio processes on the machine running it.",
  browserOnlyFeatures: ["AVIF encoding", "crop UI", "background removal", "watermarks", "redaction", "finishing effects", "batch ZIP", "recipes"],
  endpoints: { mcp: `${PUBLIC_URL}/mcp`, docs: `${PUBLIC_URL}/docs`, openapi: `${PUBLIC_URL}/openapi.json`, usage: `${PUBLIC_URL}/llms.txt` },
};

export class AgentInputError extends Error {
  constructor(message: string, readonly status = 400) { super(message); }
}

export function settingsFromOptions(options: z.infer<typeof optionsSchema> = {}) {
  return parseTransformSettings(Object.fromEntries(Object.entries(options).map(([key, value]) => [key, String(value)])));
}

async function loadSource(source: ImageSource) {
  if ("url" in source) return fetchRemoteImage(source.url);
  if (source.base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(source.base64)) {
    throw new AgentInputError("Use standard padded base64 without a data-URL prefix.");
  }
  const bytes = Buffer.from(source.base64, "base64");
  if (bytes.length > MAX_INLINE_BYTES) throw new AgentInputError("Inline images must be 4 MiB or smaller. Use /api/smush for larger uploads.", 413);
  if (bytes.toString("base64") !== source.base64) throw new AgentInputError("Invalid base64 image encoding.");
  return { bytes, filename: source.filename ?? "image" };
}

export async function inspectImage(input: z.infer<typeof inspectSchema>) {
  const source = await loadSource(input.source);
  const metadata = await new Bun.Image(source.bytes, { autoOrient: true, maxPixels: MAX_PIXELS }).metadata();
  return { filename: source.filename, width: metadata.width, height: metadata.height, format: metadata.format, bytes: source.bytes.byteLength };
}

export async function transformAgentImage(input: z.infer<typeof transformSchema>) {
  const settings = settingsFromOptions(input.options);
  const source = await loadSource(input.source);
  const result = await transformImage(source.bytes, source.filename, settings);
  if (result.output.size > MAX_INLINE_BYTES) throw new AgentInputError("Result exceeds 4 MiB. Reduce dimensions or quality, or use the binary /api/image or /api/smush endpoint.", 413);
  return {
    filename: result.filename, mimeType: result.output.type,
    width: result.width, height: result.height, bytes: result.output.size,
    originalBytes: source.bytes.byteLength, format: settings.format, quality: result.quality,
    base64: Buffer.from(await result.output.arrayBuffer()).toString("base64"),
  };
}

export async function createImageUrl(input: z.infer<typeof imageUrlSchema>) {
  settingsFromOptions(input.options);
  const source = await assertSafeRemoteUrl(input.url);
  const url = new URL("/api/image", PUBLIC_URL);
  url.searchParams.set("url", source.href);
  for (const [key, value] of Object.entries(input.options ?? {})) url.searchParams.set(key, String(value));
  return { url: url.href, note: "Transforms on each uncached request. The source must remain publicly accessible; this does not store an image." };
}

export function agentError(error: unknown) {
  if (error instanceof z.ZodError) return { status: 400, error: error.issues.map((issue) => `${issue.path.join(".") || "request"}: ${issue.message}`).join("; ") };
  if (error instanceof AgentInputError || error instanceof RemoteImageError) return { status: error.status, error: error.message };
  const message = errorMessage(error);
  return { status: message.includes("too large") ? 413 : 422, error: message };
}

// Read incrementally so chunked requests cannot bypass Content-Length checks.
export async function readAgentJson(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") throw new AgentInputError("Content-Type must be application/json.", 415);
  if (Number(request.headers.get("content-length")) > MAX_AGENT_BODY_BYTES) throw new AgentInputError("JSON requests must be 6 MiB or smaller.", 413);
  const reader = request.body?.getReader();
  if (!reader) throw new AgentInputError("A JSON request body is required.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AGENT_BODY_BYTES) { await reader.cancel(); throw new AgentInputError("JSON requests must be 6 MiB or smaller.", 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  try { return JSON.parse(Buffer.concat(chunks, size).toString("utf8")); }
  catch { throw new AgentInputError("The request body must be valid JSON."); }
}
