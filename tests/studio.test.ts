import { expect, test } from "bun:test";
import { studioPixels } from "../web/tools/studio-pixels";
import { studioLayout } from "../web/tools/studio-layout";
import { studioSize, studioSpecs, validateStudio, type StudioKind, type StudioValues } from "../web/tools/studio-settings";
const pixel = (kind: StudioKind, fields: StudioValues, input = [60, 120, 180, 128]) => [...studioPixels(new Uint8ClampedArray(input), 1, 1, kind, fields)];

test("all 20 tools have valid defaults, and invalid inputs fail before allocation", () => {
  expect(Object.keys(studioSpecs)).toHaveLength(20);
  for (const kind of Object.keys(studioSpecs) as StudioKind[]) expect(() => validateStudio(kind, {})).not.toThrow();
  for (const fields of [{ gamma: "" }, { gamma: "NaN" }, { gamma: "Infinity" }, { gamma: "0" }, { gamma: "6" }]) expect(() => validateStudio("gamma", fields)).toThrow();
  expect(() => validateStudio("levels", { black: "200", white: "100" })).toThrow("black point");
  expect(() => validateStudio("pixelate", { size: "1.2" })).toThrow("whole number");
  expect(() => validateStudio("replace", { from: "red" })).toThrow();
  expect(() => validateStudio("pattern", { mirror: "invalid" })).toThrow();
  expect(() => validateStudio("constructor" as StudioKind, {})).toThrow();
  for (const size of [[0, 1], [1.5, 1], [Infinity, 1], [NaN, 1], [12001, 1], [4000, 3001]]) expect(() => studioSize(size[0]!, size[1]!)).toThrow();
  expect(studioSize(4000, 3000)).toEqual({ width: 4000, height: 3000 });
  expect(() => studioPixels(new Uint8ClampedArray(3), 1, 1, "gamma", {})).toThrow("buffer");
});

test("neutral controls preserve RGB and alpha exactly", () => {
  const cases: Array<[StudioKind, StudioValues]> = [
    ["balance", { temperature: "0", tint: "0" }], ["gamma", { gamma: "1" }], ["tones", { shadows: "0", highlights: "0" }],
    ["levels", { black: "0", white: "255", gamma: "1" }], ["vibrance", { amount: "0" }], ["hue", { angle: "0" }],
    ["opacity", { amount: "100" }], ["vignette", { amount: "0" }], ["grain", { amount: "0" }], ["pixelate", { size: "1" }],
  ];
  for (const [kind, fields] of cases) expect(pixel(kind, fields)).toEqual([60, 120, 180, 128]);
});

test("color corrections have known endpoints and directional behavior", () => {
  expect(pixel("balance", { temperature: "50", tint: "0" })).toEqual([90, 120, 150, 128]);
  expect(pixel("balance", { temperature: "0", tint: "50" })).toEqual([70, 100, 190, 128]);
  expect(pixel("gamma", { gamma: "2" }, [0, 64, 255, 255])).toEqual([0, 128, 255, 255]);
  expect(pixel("levels", { black: "50", white: "200", gamma: "1" }, [50, 125, 200, 77])).toEqual([0, 128, 255, 77]);
  expect(pixel("tones", { shadows: "100", highlights: "0" }, [0, 0, 0, 255])).toEqual([80, 80, 80, 255]);
  expect(pixel("tones", { shadows: "0", highlights: "-100" }, [255, 255, 255, 255])).toEqual([175, 175, 175, 255]);
  expect(pixel("vibrance", { amount: "100" }, [100, 100, 100, 80])).toEqual([100, 100, 100, 80]);
  const vivid = pixel("vibrance", { amount: "100" }); expect(vivid[0]).toBeLessThan(60); expect(vivid[2]).toBeGreaterThan(180);
  expect(pixel("hue", { angle: "120" }, [255, 0, 0, 255])).toEqual([0, 255, 0, 255]);
  expect(pixel("hue", { angle: "-120" }, [255, 0, 0, 255])).toEqual([0, 0, 255, 255]);
});

test("color matching includes exact matches, feathering and original alpha", () => {
  expect(pixel("replace", { from: "#3c78b4", to: "#ff0000", tolerance: "0", softness: "0" })).toEqual([255, 0, 0, 128]);
  expect(pixel("replace", { from: "#000000", to: "#ff0000", tolerance: "0", softness: "0" })).toEqual([60, 120, 180, 128]);
  expect(pixel("key", { from: "#3c78b4", tolerance: "0", softness: "0" })[3]).toBe(0);
  const feathered = pixel("key", { from: "#000000", tolerance: "0", softness: "100" }, [128, 128, 128, 128]);
  expect(feathered[3]).toBe(64);
  expect(pixel("opacity", { amount: "50" })[3]).toBe(64);
  expect(pixel("opacity", { amount: "0" })[3]).toBe(0);
});

test("vignette leaves the center and darkens corners; grain is deterministic", () => {
  const image = new Uint8ClampedArray(3 * 3 * 4).fill(200);
  studioPixels(image, 3, 3, "vignette", { amount: "100", radius: "0" });
  expect([...image.slice(0, 4)]).toEqual([0, 0, 0, 200]);
  expect([...image.slice(16, 20)]).toEqual([200, 200, 200, 200]);
  const noise = new Uint8ClampedArray(100 * 4).fill(128);
  const a = studioPixels(noise.slice(), 10, 10, "grain", { seed: "42" });
  expect(a).toEqual(studioPixels(noise.slice(), 10, 10, "grain", { seed: "42" }));
  expect(a).not.toEqual(studioPixels(noise.slice(), 10, 10, "grain", { seed: "43" }));
  for (let i = 0; i < a.length; i += 4) { expect(a[i]).toBe(a[i + 1]); expect(a[i + 3]).toBe(128); }
});

test("pixelation averages partial blocks without hidden-color halos or alpha loss", () => {
  const data = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 128]);
  expect([...studioPixels(data, 3, 1, "pixelate", { size: "2" })]).toEqual([255, 0, 0, 255, 0, 0, 255, 0, 0, 255, 0, 128]);
  expect([...studioPixels(new Uint8ClampedArray([0, 0, 0, 255, 100, 200, 50, 255]), 2, 1, "pixelate", { size: "2" })]).toEqual([50, 100, 25, 255, 50, 100, 25, 255]);
});

test("graphic effects use luminance, quantization, and stable neighborhood samples", () => {
  expect(pixel("posterize", { levels: "2" })).toEqual([0, 0, 255, 128]);
  expect(pixel("threshold", { threshold: "128" }, [0, 255, 0, 80])).toEqual([255, 255, 255, 80]);
  expect(pixel("threshold", { threshold: "128" }, [255, 0, 0, 80])).toEqual([0, 0, 0, 80]);
  expect(pixel("edges", {})).toEqual([0, 0, 0, 128]);
  expect(pixel("emboss", {})).toEqual([128, 128, 128, 128]);
  const edge = new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 255, 255, 255, 255]);
  expect([...studioPixels(edge, 3, 1, "edges", { amount: "1" })]).toEqual([255, 255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
  const alphaEdge = new Uint8ClampedArray([100, 100, 100, 255, 0, 0, 0, 0]);
  expect(studioPixels(alphaEdge, 2, 1, "edges", {})[0]).toBe(0);
});

test("all pixel tools retain fully transparent pixels and do not change alpha except key/opacity", () => {
  for (const [key, spec] of Object.entries(studioSpecs)) {
    if ("geometry" in spec) continue;
    const kind = key as StudioKind;
    expect(pixel(kind, {}, [17, 39, 81, 0])).toEqual([17, 39, 81, 0]);
    if (kind !== "key" && kind !== "opacity") expect(pixel(kind, {})[3]).toBe(128);
  }
});

test("layouts account for rotation, reflection direction, repeat counts and signed shadow offsets", () => {
  expect(studioLayout(100, 50, "straighten", { angle: "0" })).toEqual({ width: 100, height: 50, x: 0, y: 0 });
  expect(studioLayout(100, 50, "straighten", { angle: "45" }).width).toBe(107);
  expect(studioLayout(100, 50, "straighten", { angle: "45", canvas: "keep" }).width).toBe(100);
  expect(studioLayout(100, 50, "reflection", { gap: "10", direction: "bottom" }).height).toBe(110);
  expect(studioLayout(100, 50, "reflection", { gap: "10", direction: "right" }).width).toBe(210);
  expect(studioLayout(100, 50, "pattern", { columns: "3", rows: "4" })).toEqual({ width: 300, height: 200, x: 0, y: 0 });
  expect(studioLayout(100, 50, "shadow", { blur: "10", x: "-20", y: "30" })).toEqual({ width: 180, height: 140, x: 50, y: 30 });
  expect(() => studioLayout(4000, 3000, "pattern", {})).toThrow("12 megapixels");
  expect(() => studioLayout(4000, 3000, "reflection", {})).toThrow("12 megapixels");
  expect(() => studioLayout(12000, 1, "shadow", {})).toThrow("12,000px");
});
