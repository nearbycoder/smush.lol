import { describe, expect, test } from "bun:test";
import { readSavedSettings, savedSettings } from "../web/settings";

describe("saved export settings", () => {
  test("restores dimensions, transformations, and explicitly unchecked options", () => {
    const saved = savedSettings({
      width: "800", height: "600", fit: "fill", rotate: "90", flop: "true", flip: "false",
      format: "jpeg", quality: "75", progressive: "false", withoutEnlargement: "false",
      brightness: "1.2", saturation: "0.5",
    }, false);
    expect(readSavedSettings(JSON.stringify(saved))).toEqual(saved);
    expect(saved.fields).toMatchObject({ width: "800", height: "600", rotate: "90",
      flop: "true", flip: "false", progressive: "false", withoutEnlargement: "false" });
    expect(saved.ratioLocked).toBe(false);
  });

  test("saves only transform preferences, never source URLs or image information", () => {
    const saved = savedSettings({ url: "https://example.com/private.png", image: "private.png", format: "png" }, true);
    expect(saved.fields).not.toHaveProperty("url");
    expect(saved.fields).not.toHaveProperty("image");
    expect(saved.fields.width).toBe("");
    expect(saved.fields.height).toBe("");
    expect(readSavedSettings(JSON.stringify(saved))?.fields.format).toBe("png");
  });

  test("rejects corrupt, incompatible, and oversized settings safely", () => {
    for (const value of [null, "", "{", "null", "[]", '{"version":2}',
      JSON.stringify({ version: 1, ratioLocked: true, fields: { width: "12001" } }),
      JSON.stringify({ version: 1, ratioLocked: true, fields: { quality: {} } }),
      JSON.stringify({ version: 1, ratioLocked: "true", fields: {} }),
    ]) expect(readSavedSettings(value)).toBeNull();
  });

  test("normalizes hand-edited settings before applying them", () => {
    const saved = readSavedSettings(JSON.stringify({ version: 1, ratioLocked: true,
      fields: { format: "bogus", quality: "500", rotate: "91", filter: "bogus" },
    }));
    expect(saved?.fields).toMatchObject({ format: "webp", quality: "100", rotate: "0", filter: "lanczos3" });
  });
});
