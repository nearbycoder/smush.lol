import { test, expect } from "bun:test";
import { palette } from "../web/tools/palette";
test("palette ranks colors and excludes transparent pixels", () => {
  const colors = palette(new Uint8ClampedArray([255,0,0,255,255,0,0,255,0,0,255,255,0,255,0,0]), 2);
  expect(colors.map(c => c.hex)).toEqual(["#ff0000", "#0000ff"]);
  expect(colors[0]!.percent).toBeCloseTo(200 / 3);
  expect(palette(new Uint8ClampedArray([0,0,0,0]), 6)).toEqual([]);
});
