import { expect, test } from "bun:test";
import { fitTargetSize } from "../src/target-size";
import { parseTransformSettings } from "../src/transform";
import { transformImage } from "../src/image";

test("quality search retains the highest fitting candidate with bounded encoding work", async () => {
  const qualities: number[] = [];
  const result = await fitTargetSize(100, 450, async quality => {
    qualities.push(quality);
    return { output: new Blob([new Uint8Array(quality * 10)]) };
  });
  expect(result.quality).toBe(45);
  expect(result.output.size).toBeLessThanOrEqual(450);
  expect(qualities.length).toBeLessThanOrEqual(9);
});

test("already small images only encode once, and impossible targets fail explicitly", async () => {
  let calls = 0;
  const encode = async () => { calls++; return { output: new Blob([new Uint8Array(100)]) }; };
  expect((await fitTargetSize(82, 100, encode)).quality).toBe(82);
  expect(calls).toBe(1);
  await expect(fitTargetSize(82, 99, encode)).rejects.toThrow("Reduce its width or height");
});

test("target settings reject invalid limits and incompatible formats", () => {
  for (const targetKB of ["0", "-1", "Infinity", "1.5", "15361", "foo"]) {
    expect(() => parseTransformSettings({ targetKB })).toThrow("Target size");
  }
  expect(() => parseTransformSettings({ targetKB: "50", format: "png" })).toThrow("requires JPEG");
  expect(() => parseTransformSettings({ targetKB: "50", lossless: "true" })).toThrow("requires JPEG");
});

test("real encoding meets target without changing output dimensions", async () => {
  const bytes = await Bun.file(new URL("../.github/assets/editor.jpg", import.meta.url)).arrayBuffer();
  const settings = parseTransformSettings({ format: "webp", quality: "82", targetKB: "30" });
  const result = await transformImage(bytes, "editor.jpg", settings);
  expect(result.output.size).toBeLessThanOrEqual(30 * 1024);
  expect(result.quality).toBeLessThan(82);
  const source = await new Bun.Image(bytes).metadata();
  const output = await new Bun.Image(result.output).metadata();
  expect(output.width).toBe(source.width);
  expect(output.height).toBe(source.height);
});
