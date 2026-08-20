import {
  MAX_PIXELS,
  outputFilename,
  type TransformSettings,
  validateOutputSize,
} from "./transform";

export async function transformImage(
  bytes: ArrayBuffer | Uint8Array,
  inputName: string,
  settings: TransformSettings,
) {
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

  return {
    filename: outputFilename(inputName, settings.format),
    height: pipeline.height,
    metadata,
    output,
    width: pipeline.width,
  };
}
