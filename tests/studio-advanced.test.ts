import { expect, test } from "bun:test";
import { studioPixels } from "../web/tools/studio-pixels";
import { validateStudio, type StudioKind, type StudioValues } from "../web/tools/studio-settings";
const run = (kind: StudioKind, fields: StudioValues, values: number[], width = values.length / 4) => [...studioPixels(new Uint8ClampedArray(values), width, values.length / 4 / width, kind, fields)];
const pixel = [60, 120, 180, 128];

test("auto levels ignores hidden colors and stretches occupied channel endpoints", () => {
  expect(run("autoLevels", { clip: "0" }, [50, 30, 20, 255, 150, 80, 60, 255, 250, 130, 100, 255, 0, 255, 255, 0])).toEqual([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255, 0, 255, 255, 0]);
  expect(run("autoLevels", {}, pixel)).toEqual(pixel);
});

test("auto levels clips outliers using alpha-weighted histograms", () => {
  const values = [0, 0, 0, 1, 50, 50, 50, 255, 100, 100, 100, 255, 150, 150, 150, 255, 255, 255, 255, 1];
  expect(run("autoLevels", { clip: "1" }, values).slice(4, 16)).toEqual([0, 0, 0, 255, 128, 128, 128, 255, 255, 255, 255, 255]);
});

test("gray-world balance neutralizes average casts without touching alpha", () => {
  expect(run("autoBalance", { amount: "100" }, pixel)).toEqual([120, 120, 120, 128]);
  expect(run("autoBalance", { amount: "0" }, pixel)).toEqual(pixel);
  expect(run("autoBalance", {}, [0, 0, 0, 255])).toEqual([0, 0, 0, 255]);
  expect(run("autoBalance", { amount: "100" }, [...pixel, 255, 0, 0, 0]).slice(0, 4)).toEqual([120, 120, 120, 128]);
});

test("channel mixing and split toning produce known colors", () => {
  expect(run("channelMixer", { red: "200", green: "0", blue: "50" }, pixel)).toEqual([120, 0, 90, 128]);
  expect(run("splitTone", { dark: "#ff0000", light: "#0000ff", amount: "100" }, [0, 0, 0, 200, 255, 255, 255, 100])).toEqual([255, 0, 0, 200, 0, 0, 255, 100]);
});

test("selective saturation follows circular hue distance and leaves other colors intact", () => {
  expect(run("selectiveSaturation", { color: "#ff0000", range: "30", amount: "-100" }, [255, 0, 0, 255, 0, 255, 0, 128])).toEqual([54, 54, 54, 255, 0, 255, 0, 128]);
  const nearRed = run("selectiveSaturation", { color: "#ff0010", range: "30", amount: "-100" }, [255, 0, 0, 255]);
  expect(nearRed[0]).toBeLessThan(100);
});

test("gradient mapping uses all three stops and respects zero blend", () => {
  expect(run("gradientMap", { dark: "#ff0000", mid: "#00ff00", light: "#0000ff" }, [0, 0, 0, 255, 128, 128, 128, 128, 255, 255, 255, 255])).toEqual([255, 0, 0, 255, 0, 254, 1, 128, 0, 0, 255, 255]);
  expect(run("gradientMap", { amount: "0" }, pixel)).toEqual(pixel);
});

test("ordered dithering has a balanced Bayer screen and preserves alpha", () => {
  const values = Array.from({ length: 16 }, () => [128, 128, 128, 90]).flat();
  const result = run("dither", { size: "1" }, values, 4);
  expect(result.filter((_, i) => i % 4 === 0 && result[i] === 255)).toHaveLength(8);
  expect(result.filter((_, i) => i % 4 === 3)).toEqual(Array(16).fill(90));
});

test("halftone maps black/white cells to ink/paper even at partial edges", () => {
  const fields = { size: "2", dark: "#123456", light: "#abcdef" };
  expect(run("halftone", fields, [0, 0, 0, 128])).toEqual([18, 52, 86, 128]);
  expect(run("halftone", fields, [255, 255, 255, 255])).toEqual([171, 205, 239, 255]);
});

test("scanlines support both axes and reject a fully covered screen", () => {
  const values = Array.from({ length: 4 }, () => [100, 100, 100, 128]).flat();
  expect(run("scanlines", { spacing: "2", thickness: "1", amount: "100" }, values, 2)).toEqual([0, 0, 0, 128, 0, 0, 0, 128, 100, 100, 100, 128, 100, 100, 100, 128]);
  expect(run("scanlines", { direction: "vertical", spacing: "2", amount: "100" }, values, 2)).toEqual([0, 0, 0, 128, 100, 100, 100, 128, 0, 0, 0, 128, 100, 100, 100, 128]);
  expect(() => validateStudio("scanlines", { thickness: "6", spacing: "6" })).toThrow("smaller");
});

test("solarization inverts only channels reaching the threshold", () => {
  expect(run("solarize", { threshold: "128" }, [0, 128, 255, 100])).toEqual([0, 127, 0, 100]);
  expect(run("solarize", { amount: "0" }, pixel)).toEqual(pixel);
});

test("median denoise removes specks, samples immutable neighbors and excludes transparency", () => {
  const values = Array.from({ length: 9 }, (_, i) => i === 4 ? [255, 255, 255, 128] : [40, 60, 80, 255]).flat();
  expect(run("median", {}, values, 3).slice(16, 20)).toEqual([40, 60, 80, 128]);
  expect(run("median", {}, [255, 0, 0, 0, ...pixel, 0, 0, 255, 0]).slice(4, 8)).toEqual(pixel);
  expect(() => validateStudio("median", { size: "7" })).toThrow();
});

test("soft blur keeps constant colors and prevents transparent color halos", () => {
  expect(run("softBlur", { radius: "30" }, pixel)).toEqual(pixel);
  expect(run("softBlur", { amount: "0" }, [...pixel, 255, 0, 0, 255])).toEqual([...pixel, 255, 0, 0, 255]);
  const result = run("softBlur", { radius: "2" }, [255, 0, 0, 0, 0, 0, 255, 128, 255, 0, 0, 0]);
  expect(result).toEqual([255, 0, 0, 0, 0, 0, 255, 128, 255, 0, 0, 0]);
});

test("blur spreads an impulse symmetrically and focus retains a sharp center band", () => {
  const values = Array.from({ length: 7 }, (_, i) => [i === 3 ? 255 : 0, 0, 0, 255]).flat();
  const blurred = run("softBlur", { radius: "1" }, values);
  expect(blurred[8]).toBeGreaterThan(0); expect(blurred[8]).toBe(blurred[16]); expect(blurred[12]).toBeLessThan(255);
  const focused = run("tiltShift", { direction: "vertical", band: "0", position: "50", radius: "2" }, values);
  expect(focused.slice(12, 16)).toEqual([255, 0, 0, 255]); expect(focused[0]).toBeGreaterThan(0);
});

test("chromatic shifts channels independently and ignores hidden color", () => {
  const values = [10, 20, 30, 255, 40, 50, 60, 128, 70, 80, 90, 255];
  expect(run("chromatic", { x: "1", y: "0", amount: "100" }, values).slice(4, 8)).toEqual([70, 50, 30, 128]);
  expect(run("chromatic", { x: "0", y: "0" }, pixel)).toEqual(pixel);
  expect(run("chromatic", { x: "1" }, [...pixel, 255, 0, 0, 0]).slice(0, 4)).toEqual(pixel);
});
