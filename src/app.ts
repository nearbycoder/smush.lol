import { staticPlugin } from "@elysiajs/static";
import { Elysia, t } from "elysia";
import { agentError, capabilitiesJson, inspectImage, inspectSchema, readAgentJson, transformAgentImage, transformSchema } from "./agent-api";
import { handleMcp } from "./mcp";
import { openapiJson } from "./openapi";
import { usageGuide } from "./usage";
import { isHttpsRequest, securityHeaders } from "./security";
import { transformImage } from "./image";
import { fetchRemoteImage, INTERNAL_FETCH_HEADER, RemoteImageError } from "./remote-image";
import {
  errorMessage,
  MAX_FILE_BYTES,
  MAX_PIXELS,
  parseTransformSettings,
  type TransformSettings,
} from "./transform";

const imageTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/bmp",
  "image/heic",
  "image/heif",
  "image/avif",
  "image/tiff",
];

const safeSourceFormats = new Set([
  "jpeg",
  "png",
  "webp",
  "gif",
  "bmp",
  "heic",
  "heif",
  "avif",
  "tiff",
]);

const HASHED_ASSET_RE = /^\/(?:chunk-|favicon-)[a-z0-9]+\.(?:js|css|svg)$/i;
const HTML_CACHE_CONTROL = "public, max-age=60, stale-while-revalidate=300";
const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function safeAttachmentFilename(filename: string): string {
  const sanitized = filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .slice(0, 128);
  return sanitized || "remote-image";
}

const transformFieldSchema = {
  width: t.Optional(t.String()),
  height: t.Optional(t.String()),
  fit: t.Optional(t.String()),
  filter: t.Optional(t.String()),
  withoutEnlargement: t.Optional(t.String()),
  rotate: t.Optional(t.String()),
  flip: t.Optional(t.String()),
  flop: t.Optional(t.String()),
  brightness: t.Optional(t.String()),
  saturation: t.Optional(t.String()),
  format: t.Optional(t.String()),
  quality: t.Optional(t.String()),
  targetKB: t.Optional(t.String()),
  progressive: t.Optional(t.String()),
  lossless: t.Optional(t.String()),
  compressionLevel: t.Optional(t.String()),
  palette: t.Optional(t.String()),
  colors: t.Optional(t.String()),
  dither: t.Optional(t.String()),
};

async function imageResponse(
  bytes: ArrayBuffer | Uint8Array,
  inputName: string,
  settings: TransformSettings,
  options: { cacheControl: string; disposition: "attachment" | "inline" },
): Promise<Response> {
  const result = await transformImage(bytes, inputName, settings);

  return new Response(result.output, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": options.cacheControl,
      "Content-Disposition": `${options.disposition}; filename="${result.filename}"`,
      "Content-Length": String(result.output.size),
      "Content-Type": result.output.type,
      "Cross-Origin-Resource-Policy": "cross-origin",
      "X-Bun-Version": Bun.version,
      "X-Content-Type-Options": "nosniff",
      "X-Image-Format": settings.format,
      "X-Image-Quality": String(result.quality),
      "X-Image-Height": String(result.height),
      "X-Image-Width": String(result.width),
      "X-Original-Format": result.metadata.format,
    },
  });
}

function handleImageError(error: unknown, set: { status?: number | string }): { error: string } {
  if (error instanceof RemoteImageError) {
    set.status = error.status;
    return { error: error.message };
  }

  const message = errorMessage(error);
  set.status = message.includes("too large") ? 413 : 422;
  return { error: message };
}

function docsPage(): Response {
  return new Response(Bun.file("public/docs.html"), {
    headers: {
      "Cache-Control": HTML_CACHE_CONTROL,
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const jsonApiHeaders = {
  "Cache-Control": "no-store",
  "Access-Control-Allow-Origin": "*",
  "X-Content-Type-Options": "nosniff",
};
const precomputedJsonHeaders = {
  ...jsonApiHeaders,
  "Content-Type": "application/json; charset=utf-8",
};

async function agentResponse(request: Request, operation: "inspect" | "transform") {
  try {
    const input = await readAgentJson(request);
    const result = operation === "inspect"
      ? await inspectImage(inspectSchema.parse(input))
      : await transformAgentImage(transformSchema.parse(input));
    return Response.json(result, { headers: jsonApiHeaders });
  } catch (error) {
    const result = agentError(error);
    return Response.json({ error: result.error }, { status: result.status, headers: jsonApiHeaders });
  }
}

export const app = new Elysia({
  serve: {
    maxRequestBodySize: MAX_FILE_BYTES + 1024 * 1024,
    idleTimeout: 30,
  },
})
  .onRequest(({ request, set }) => {
    Object.assign(set.headers, securityHeaders);
    if (isHttpsRequest(request)) {
      set.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains";
    }
  })
  .onAfterHandle(({ path, responseValue, set }) => {
    const cacheControl = HASHED_ASSET_RE.test(path)
      ? IMMUTABLE_CACHE_CONTROL
      : (path === "/" || path === "/index.html" || path === "/docs.html")
        ? HTML_CACHE_CONTROL
        : undefined;
    if (!cacheControl) return;
    delete set.headers["Cache-Control"];
    set.headers["cache-control"] = cacheControl;
    if (responseValue instanceof Response) {
      responseValue.headers.set("Cache-Control", cacheControl);
    }
  })
  .get("/health", () => ({
    ok: true,
    runtime: "bun",
    version: Bun.version,
  }))
  .get("/docs", docsPage)
  .get("/llms.txt", () => new Response(usageGuide, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600", "X-Content-Type-Options": "nosniff" } }))
  .get("/llm.txt", () => new Response(null, { status: 301, headers: { Location: "/llms.txt" } }))
  .get("/LLM.txt", () => new Response(null, { status: 301, headers: { Location: "/llms.txt" } }))
  .get("/openapi.json", () => new Response(openapiJson, { headers: precomputedJsonHeaders }))
  .get("/api/capabilities", () => new Response(capabilitiesJson, { headers: precomputedJsonHeaders }))
  .options("/api/*", () => new Response(null, { status: 204, headers: { ...jsonApiHeaders, "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Access-Control-Allow-Headers": "Content-Type" } }))
  .post("/api/inspect", ({ request }) => agentResponse(request, "inspect"), { parse: "none" })
  .post("/api/transform", ({ request }) => agentResponse(request, "transform"), { parse: "none" })
  .all("/mcp", ({ request }) => handleMcp(request), { parse: "none" })
  .get("/api/source", async ({ query, request, set }) => {
    try {
      if (request.headers.has(INTERNAL_FETCH_HEADER)) {
        throw new RemoteImageError("Recursive smush.lol API URLs are not allowed.", 403);
      }
      const remote = await fetchRemoteImage(query.url);
      const metadata = await new Bun.Image(remote.bytes, { autoOrient: true, maxPixels: MAX_PIXELS }).metadata();
      const type = metadata.format.toLowerCase();
      if (!safeSourceFormats.has(type)) {
        throw new RemoteImageError("The URL did not return a supported image.", 415);
      }
      return new Response(remote.bytes, { headers: {
        "Content-Type": `image/${type}`,
        "Content-Length": String(remote.bytes.byteLength),
        "Content-Disposition": `attachment; filename="${safeAttachmentFilename(remote.filename)}"`,
        "Cache-Control": "no-store",
        "Cross-Origin-Resource-Policy": "same-origin",
        "X-Content-Type-Options": "nosniff",
        "X-Image-Width": String(metadata.width),
        "X-Image-Height": String(metadata.height),
      } });
    } catch (error) { return handleImageError(error, set); }
  }, { query: t.Object({ url: t.String({ minLength: 1, maxLength: 4096 }) }) })
  .get(
    "/api/image",
    async ({ query, request, set }) => {
      const { url, ...fields } = query;

      try {
        if (request.headers.has(INTERNAL_FETCH_HEADER)) {
          throw new RemoteImageError("Recursive smush.lol API URLs are not allowed.", 403);
        }
        const settings = parseTransformSettings(fields);
        const remote = await fetchRemoteImage(url);
        return await imageResponse(remote.bytes, remote.filename, settings, {
          cacheControl: "public, max-age=3600, stale-while-revalidate=86400",
          disposition: "inline",
        });
      } catch (error) {
        return handleImageError(error, set);
      }
    },
    {
      query: t.Object({
        url: t.String({ minLength: 1, maxLength: 4096 }),
        ...transformFieldSchema,
      }),
    },
  )
  .post(
    "/api/smush",
    async ({ body, set }) => {
      const { image, ...fields } = body;

      try {
        const settings = parseTransformSettings(fields);
        const bytes = await image.arrayBuffer();
        return await imageResponse(bytes, image.name, settings, {
          cacheControl: "no-store",
          disposition: "attachment",
        });
      } catch (error) {
        return handleImageError(error, set);
      }
    },
    {
      body: t.Object({
        image: t.File({
          format: imageTypes,
          maxSize: MAX_FILE_BYTES,
        }),
        ...transformFieldSchema,
      }),
    },
  )
  .onError(({ code, error, path, set }) => {
    if (code === "NOT_FOUND") {
      set.status = 404;
      return { error: "Not found." };
    }
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: (path === "/api/image" || path === "/api/source")
          ? "A public HTTP(S) image URL is required."
          : "Please choose a supported image under 15 MB.",
      };
    }

    console.error(error);
    set.status = 500;
    return { error: "The image could not be processed." };
  })
  .use(
    staticPlugin({
      assets: "public",
      prefix: "/",
      indexHTML: true,
      maxAge: 3600,
      headers: {
        "X-Content-Type-Options": "nosniff",
      },
    }),
  );

export type App = typeof app;
