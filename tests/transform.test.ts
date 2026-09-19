import { describe, expect, test } from "bun:test";
import { transformImage } from "../src/image";
import {
  outputFilename,
  parseTransformSettings,
  validateOutputSize,
} from "../src/transform";

describe("transform settings", () => {
  test("parses and constrains form values", () => {
    const settings = parseTransformSettings({
      width: "1200",
      height: "800",
      fit: "fill",
      filter: "nearest",
      rotate: "90",
      brightness: "1.25",
      saturation: "0",
      format: "jpeg",
      quality: "500",
      progressive: "on",
    });

    expect(settings).toMatchObject({
      width: 1200,
      height: 800,
      fit: "fill",
      filter: "nearest",
      rotate: 90,
      brightness: 1.25,
      saturation: 0,
      format: "jpeg",
      quality: 100,
      progressive: true,
    });
  });

  test("rejects oversized dimensions", () => {
    expect(() => parseTransformSettings({ width: "12001" })).toThrow("width must be between");
    expect(() =>
      validateOutputSize(parseTransformSettings({ width: "10000", height: "10000" }), {
        width: 100,
        height: 100,
      }),
    ).toThrow("too large");
  });

  test("builds a safe download name", () => {
    expect(outputFilename("My vacation (final)!!.JPG", "webp")).toBe("smushed-My-vacation-final.webp");
    expect(outputFilename("🫠.png", "jpeg")).toBe("smushed-image.jpg");
  });

  test("bounds rotated output before allocating the resized image", async () => {
    for (const rotate of ["90", "270"]) {
      expect(() => validateOutputSize(parseTransformSettings({ width: "12000", rotate }), { width: 12000, height: 1 })).toThrow("too large");
      expect(() => validateOutputSize(parseTransformSettings({ height: "12000", rotate }), { width: 1, height: 12000 })).toThrow("too large");
    }
    const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    const thin = await new Bun.Image(pixel).resize(64, 1, { fit: "fill" }).png().blob();
    await expect(transformImage(await thin.arrayBuffer(), "thin.png", parseTransformSettings({ width: "12000", rotate: "90" }))).rejects.toThrow("too large");
    // Height-only resizing must use the same rotated aspect ratio as validation.
    const result = await transformImage(await thin.arrayBuffer(), "thin.png", parseTransformSettings({ height: "128", rotate: "90", format: "png" }));
    expect(await new Bun.Image(await result.output.arrayBuffer()).metadata()).toMatchObject({ width: 2, height: 128 });
    const bounded = await transformImage(await thin.arrayBuffer(), "thin.png", parseTransformSettings({ width: "128", rotate: "90", withoutEnlargement: "true", format: "png" }));
    expect(await new Bun.Image(await bounded.output.arrayBuffer()).metadata()).toMatchObject({ width: 1, height: 64 });
  });
});
