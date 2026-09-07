import { test, expect } from "bun:test";
import { outputSize, usesBrowser } from "../web/local-image";
import { readSavedSettings, savedSettings } from "../web/settings";
test("local output bounds account for rotation, fill and no enlargement", () => {
  expect(outputSize(400, 200, { width: "100", rotate: "90" })).toMatchObject({ width: 100, height: 200 });
  expect(outputSize(400, 200, { width: "100", height: "100", fit: "fill" })).toMatchObject({ width: 100, height: 100 });
  expect(outputSize(400, 200, { width: "800", withoutEnlargement: "true" })).toMatchObject({ width: 400, height: 200 });
  expect(() => outputSize(8000, 8000, {})).toThrow("48 megapixels");
});
test("privacy and unsupported server formats route to browser, including saved recipes", () => {
  expect(usesBrowser(null, { localOnly: "true" })).toBe(true);
  expect(usesBrowser(null, { format: "avif" })).toBe(true);
  expect(usesBrowser(new File(["<svg/>"], "shape.svg"), {})).toBe(true);
  expect(usesBrowser(null, { format: "jpeg" })).toBe(false);
  const saved = savedSettings({ localOnly: "true", format: "avif", targetKB: "100" }, true);
  expect(readSavedSettings(JSON.stringify(saved))?.fields).toMatchObject({ localOnly: "true", format: "avif", targetKB: "100" });
});
