import { expect, test } from "bun:test";
import { browserFields, cropRect } from "../web/crop-geometry";
import { savedSettings, readSavedSettings } from "../web/settings";

test("square crops remain square across landscape and portrait queue images", () => {
  const fields = { cropRatio: "1", cropScale: "100", cropX: "50", cropY: "50" };
  expect(cropRect(1400, 900, fields)).toEqual({ x: 250, y: 0, width: 900, height: 900 });
  expect(cropRect(900, 1400, fields)).toEqual({ x: 0, y: 250, width: 900, height: 900 });
});

test("crop scale and focal positions stay within source bounds", () => {
  for (const width of [1, 50, 1400]) for (const height of [1, 900]) {
    for (const cropRatio of ["original", "0.01", "1", "100"]) for (const position of ["0", "50", "100"]) {
      const rect = cropRect(width, height, { cropRatio, cropScale: "50", cropX: position, cropY: position });
      expect(rect.width).toBeGreaterThanOrEqual(1);
      expect(rect.height).toBeGreaterThanOrEqual(1);
      expect(rect.x + rect.width).toBeLessThanOrEqual(width);
      expect(rect.y + rect.height).toBeLessThanOrEqual(height);
    }
  }
});

test("saved settings preserve browser edits but reject invalid values", () => {
  const saved = savedSettings({ cropRatio: "0.8", cropScale: "75", cropX: "0", background: "#ff9b70" }, true);
  expect(readSavedSettings(JSON.stringify(saved))?.fields).toMatchObject({ cropRatio: "0.8", cropScale: "75", cropX: "0", background: "#ff9b70" });
  for (const fields of ([{ cropRatio: "NaN" }, { cropRatio: "0" }, { cropX: "-1" }, { background: "url(x)" }] as Record<string, string>[])) {
    expect(() => browserFields(fields)).toThrow();
  }
});
