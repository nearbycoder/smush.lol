import { staticPlugin } from "@elysiajs/static";
import { Elysia, t } from "elysia";
import {
  errorMessage,
  MAX_FILE_BYTES,
  MAX_PIXELS,
  outputFilename,
  parseTransformSettings,
  validateOutputSize,
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
  .post(
    "/api/smush",
    async ({ body, set }) => {
      const { image, ...fields } = body;

      try {
        const bytes = await image.arrayBuffer();
        const settings = parseTransformSettings(fields);

        const metadata = await new Bun.Image(bytes, {
          autoOrient: true,
          maxPixels: MAX_PIXELS,
        }).metadata();

        validateOutputSize(settings, metadata);

        const pipeline = new Bun.Image(bytes, {
          autoOrient: true,
          maxPixels: MAX_PIXELS,
        });

        if (settings.rotate !== 0) pipeline.rotate(settings.rotate);
        if (settings.flip) pipeline.flip();
        if (settings.flop) pipeline.flop();

        if (settings.width || settings.height) {
          if (settings.width) {
            pipeline.resize(settings.width, settings.height, {
              fit: settings.fit,
              filter: settings.filter,
              withoutEnlargement: settings.withoutEnlargement,
            });
          } else if (settings.height) {
            const width = Math.max(1, Math.round((settings.height / metadata.height) * metadata.width));
            pipeline.resize(width, settings.height, {
              fit: settings.fit,
              filter: settings.filter,
              withoutEnlargement: settings.withoutEnlargement,
            });
          }
        }

        if (settings.brightness !== 1 || settings.saturation !== 1) {
          pipeline.modulate({
            brightness: settings.brightness,
            saturation: settings.saturation,
          });
        }

        if (settings.format === "jpeg") {
          pipeline.jpeg({ quality: settings.quality, progressive: settings.progressive });
        } else if (settings.format === "png") {
          pipeline.png({
            compressionLevel: settings.compressionLevel,
            palette: settings.palette,
            colors: settings.colors,
            dither: settings.dither,
          });
        } else {
          pipeline.webp({ quality: settings.quality, lossless: settings.lossless });
        }

        const output = await pipeline.blob();
        const filename = outputFilename(image.name, settings.format);

        return new Response(output, {
          headers: {
            "Cache-Control": "no-store",
            "Content-Disposition": `attachment; filename="${filename}"`,
            "Content-Length": String(output.size),
            "Content-Type": output.type,
            "X-Bun-Version": Bun.version,
            "X-Image-Format": settings.format,
            "X-Image-Height": String(pipeline.height),
            "X-Image-Width": String(pipeline.width),
            "X-Original-Format": metadata.format,
          },
        });
      } catch (error) {
        const message = errorMessage(error);
        set.status = message.includes("too large") ? 413 : 422;
        return { error: message };
      }
    },
    {
      body: t.Object({
        image: t.File({
          format: imageTypes,
          maxSize: MAX_FILE_BYTES,
        }),
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
      }),
    },
  )
  .onError(({ code, error, set }) => {
    if (code === "VALIDATION") {
      set.status = 400;
      return { error: "Please choose a supported image under 15 MB." };
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
