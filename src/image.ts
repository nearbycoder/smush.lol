import { fitTargetSize } from "./target-size";
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
  const initial = new Bun.Image(bytes, {
    autoOrient: true,
    maxPixels: MAX_PIXELS,
  });
  const metadata = await initial.metadata();

  validateOutputSize(settings, metadata);

  const rotated = settings.rotate === 90 || settings.rotate === 270;
  const sourceWidth = rotated ? metadata.height : metadata.width;
  const sourceHeight = rotated ? metadata.width : metadata.height;
  const resizeWidth = settings.width
    ?? (settings.height ? Math.max(1, Math.round((settings.height / sourceHeight) * sourceWidth)) : undefined);
  const hasTransforms = settings.rotate !== 0 || settings.flip || settings.flop
    || Boolean(resizeWidth || settings.height)
    || settings.brightness !== 1 || settings.saturation !== 1;

  function applyTransforms(pipeline: Bun.Image) {
    if (settings.rotate !== 0) pipeline.rotate(settings.rotate);
    if (settings.flip) pipeline.flip();
    if (settings.flop) pipeline.flop();

    if (resizeWidth) {
      pipeline.resize(resizeWidth, settings.height, {
        fit: settings.fit,
        filter: settings.filter,
        withoutEnlargement: settings.withoutEnlargement,
      });
    }

    if (settings.brightness !== 1 || settings.saturation !== 1) {
      pipeline.modulate({
        brightness: settings.brightness,
        saturation: settings.saturation,
      });
    }

    return pipeline;
  }

  function applyFormat(pipeline: Bun.Image, quality: number) {
    if (settings.format === "jpeg") {
      pipeline.jpeg({ quality, progressive: settings.progressive });
    } else if (settings.format === "png") {
      pipeline.png({
        compressionLevel: settings.compressionLevel,
        palette: settings.palette,
        colors: settings.colors,
        dither: settings.dither,
      });
    } else {
      pipeline.webp({ quality, lossless: settings.lossless });
    }

    return pipeline;
  }

  let attempts = 0;
  let outputPixels = 0;
  let preparedBytes: Uint8Array | null = null;
  let preparedWidth = 0;
  let preparedHeight = 0;
  const MAX_PREPARED_PIXELS = 8_000_000;

  async function encode(quality: number) {
    attempts += 1;

    // For targetKB quality searches, materialize the transformed pixels once as an
    // uncompressed lossless PNG (up to 8 MP) instead of re-decoding, orienting,
    // resizing, and modulating on every binary-search iteration.
    if (preparedBytes) {
      const pipeline = applyFormat(
        new Bun.Image(preparedBytes, { autoOrient: false, maxPixels: MAX_PIXELS }),
        quality,
      );
      return { output: await pipeline.blob(), height: preparedHeight, width: preparedWidth };
    }

    if (attempts === 2 && hasTransforms && outputPixels > 0 && outputPixels <= MAX_PREPARED_PIXELS) {
      const prepared = applyTransforms(new Bun.Image(bytes, { autoOrient: true, maxPixels: MAX_PIXELS }));
      preparedBytes = await prepared.png({ compressionLevel: 0 }).bytes();
      preparedWidth = prepared.width;
      preparedHeight = prepared.height;
      const pipeline = applyFormat(
        new Bun.Image(preparedBytes, { autoOrient: false, maxPixels: MAX_PIXELS }),
        quality,
      );
      return { output: await pipeline.blob(), height: preparedHeight, width: preparedWidth };
    }

    const base = attempts === 1
      ? initial
      : new Bun.Image(bytes, { autoOrient: true, maxPixels: MAX_PIXELS });
    const pipeline = applyFormat(applyTransforms(base), quality);
    const output = await pipeline.blob();
    if (attempts === 1) outputPixels = pipeline.width * pipeline.height;

    return { output, height: pipeline.height, width: pipeline.width };
  }

  const result = settings.targetKB
    ? await fitTargetSize(settings.quality, settings.targetKB * 1024, encode)
    : { ...await encode(settings.quality), quality: settings.quality };

  return {
    filename: outputFilename(inputName, settings.format),
    ...result,
    metadata,
  };
}
