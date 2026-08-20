import { describe, expect, test } from "bun:test";
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
});
