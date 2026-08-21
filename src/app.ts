import { staticPlugin } from "@elysiajs/static";
import { Elysia, t } from "elysia";
import { transformImage } from "./image";
import { fetchRemoteImage, RemoteImageError } from "./remote-image";
import {
  errorMessage,
  MAX_FILE_BYTES,
  parseTransformSettings,
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
  progressive: t.Optional(t.String()),
  lossless: t.Optional(t.String()),
  compressionLevel: t.Optional(t.String()),
  palette: t.Optional(t.String()),
  colors: t.Optional(t.String()),
  dither: t.Optional(t.String()),
};

type TransformFields = Record<string, FormDataEntryValue | undefined>;

async function imageResponse(
  bytes: ArrayBuffer | Uint8Array,
  inputName: string,
  fields: TransformFields,
  options: { cacheControl: string; disposition: "attachment" | "inline" },
): Promise<Response> {
  const settings = parseTransformSettings(fields);
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
      "Cache-Control": "public, max-age=3600",
      "Content-Type": "text/html; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export const app = new Elysia({
  serve: {
    maxRequestBodySize: MAX_FILE_BYTES + 1024 * 1024,
  },
})
  .get("/health", () => ({
    ok: true,
    runtime: "bun",
    version: Bun.version,
  }))
  .get("/docs", docsPage)
  .get(
    "/api/image",
    async ({ query, set }) => {
      const { url, ...fields } = query;

      try {
        const remote = await fetchRemoteImage(url);
        return await imageResponse(remote.bytes, remote.filename, fields, {
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
        const bytes = await image.arrayBuffer();
        return await imageResponse(bytes, image.name, fields, {
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
    if (code === "VALIDATION") {
      set.status = 400;
      return {
        error: path === "/api/image"
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
      headers: {
        "Cache-Control": "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    }),
  );

export type App = typeof app;
