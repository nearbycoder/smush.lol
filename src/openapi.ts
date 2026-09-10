import { z } from "zod";
import { capabilities, inspectSchema, optionsSchema, PUBLIC_URL, transformSchema } from "./agent-api";

const error = { description: "Request failed; see the error message.", content: { "application/json": { schema: { type: "object", required: ["error"], properties: { error: { type: "string" } } } } } };
const failures = Object.fromEntries([400, 403, 413, 415, 422, 502].map((status) => [status, error]));
const json = (schema: unknown) => ({ "application/json": { schema } });
const metadata = {
  type: "object", required: ["filename", "width", "height", "format", "bytes"],
  properties: { filename: { type: "string" }, width: { type: "integer" }, height: { type: "integer" }, format: { type: "string" }, bytes: { type: "integer" } },
};
const transformed = { ...metadata, required: [...metadata.required, "mimeType", "originalBytes", "quality", "base64"], properties: {
  ...metadata.properties, mimeType: { type: "string", enum: ["image/webp", "image/jpeg", "image/png"] }, originalBytes: { type: "integer" }, quality: { type: "integer" }, base64: { type: "string", contentEncoding: "base64", description: "Actual output image bytes, base64-encoded. At most 4 MiB decoded." },
} };
const options = z.toJSONSchema(optionsSchema);
const binary = { description: "Encoded image bytes. X-Image-Width, X-Image-Height, X-Image-Quality and X-Image-Format describe converted results.", content: Object.fromEntries(["image/webp", "image/jpeg", "image/png"].map((mime) => [mime, { schema: { type: "string", format: "binary" } }])) };
// Legacy query/form options are strings; strict typed options apply to JSON and MCP.
const stringOptions = Object.fromEntries(Object.keys(options.properties ?? {}).map((name) => [name, { type: "string", description: `See TransformOptions.${name}. Boolean strings: true, 1, or on.` }]));
const urlParameter = { name: "url", in: "query", required: true, schema: { type: "string", format: "uri", maxLength: 4096 }, description: "Public HTTP(S) image URL on port 80 or 443." };
export const openapi = {
  openapi: "3.1.0", info: { title: "smush.lol Image API", version: "1.0.0", description: "Stateless image inspection and conversion. No authentication or storage. JSON and MCP support WebP, JPEG and PNG output; AVIF and advanced editing remain browser-only." },
  servers: [{ url: PUBLIC_URL }],
  externalDocs: { url: `${PUBLIC_URL}/docs`, description: "API and MCP setup" },
  paths: {
    "/health": { get: { operationId: "health", responses: { 200: { description: "Server health", content: json({ type: "object" }) } } } },
    "/api/capabilities": { get: { operationId: "getCapabilities", responses: { 200: { description: "Supported operations, defaults, limits and links", content: { "application/json": { schema: { type: "object" }, example: capabilities } } } } } },
    "/api/inspect": { post: { operationId: "inspectImage", summary: "Inspect a URL or inline image", requestBody: { required: true, content: json(z.toJSONSchema(inspectSchema)) }, responses: { 200: { description: "Detected source properties", content: json(metadata) }, ...failures } } },
    "/api/transform": { post: { operationId: "transformImage", summary: "Convert a URL or inline image and return base64", requestBody: { required: true, content: json(z.toJSONSchema(transformSchema)) }, responses: { 200: { description: "Image and output metadata; no-store", content: json(transformed) }, ...failures } } },
    "/api/image": { get: { operationId: "transformRemoteImage", summary: "Return converted image bytes from a public URL", parameters: [urlParameter, ...Object.entries(stringOptions).map(([name, schema]) => ({ name, in: "query", schema }))], responses: { 200: binary, ...failures } } },
    "/api/smush": { post: { operationId: "transformUpload", summary: "Return converted bytes from a multipart upload", requestBody: { required: true, content: { "multipart/form-data": { schema: { type: "object", required: ["image"], properties: { image: { type: "string", format: "binary", description: "Image upload up to 15 MiB" }, ...stringOptions } } } } }, responses: { 200: binary, ...failures } } },
    "/api/source": { get: { operationId: "fetchSource", summary: "Fetch validated original image bytes", parameters: [urlParameter], responses: { 200: { description: "Original bytes; no-store", content: { "image/*": { schema: { type: "string", format: "binary" } } } }, ...failures } } },
  },
  components: { schemas: { TransformOptions: options } },
};
