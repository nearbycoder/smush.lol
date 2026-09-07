import { test, expect } from "bun:test";
import { effectSettings, redactions } from "../web/effect-settings";
import { savedSettings } from "../web/settings";
import { usesBrowser } from "../web/local-image";
test("redactions reject invalid bounds and retain relative regions across export sizes", () => {
  expect(redactions('[{"x":0.1,"y":0.2,"width":0.4,"height":0.3,"mode":"black"}]')[0]?.mode).toBe("black");
  for (const value of ['null', '[{"x":0.9,"y":0,"width":0.2,"height":0.1,"mode":"black"}]', '[{"x":0,"y":0,"width":1,"height":1,"mode":"unknown"}]']) expect(() => redactions(value)).toThrow();
});
test("effect recipes preserve edits without storing logo pixels", () => {
  const fields = savedSettings({ watermarkText: "© Studio", watermarkPosition: "center", watermarkOpacity: "35", watermarkLogo: "data:image/png;base64,pixels", removeBackground: "true" }, true).fields;
  expect(fields).toMatchObject({ watermarkText: "© Studio", watermarkPosition: "center", watermarkOpacity: "35", removeBackground: "true" });
  expect(fields.watermarkLogo).toBeUndefined();
  expect(usesBrowser(null, fields)).toBe(true);
  expect(() => effectSettings({ watermarkSize: "1000" })).toThrow();
});
