import { test, expect } from "bun:test";
import { outputSize, safeSource, usesBrowser } from "../web/local-image";
import { readSavedSettings, savedSettings } from "../web/settings";
test("local output bounds account for rotation, fill and no enlargement", () => {
  expect(outputSize(400, 200, { width: "100", rotate: "90" })).toMatchObject({ width: 100, height: 200 });
  expect(outputSize(400, 200, { width: "100", height: "100", fit: "fill" })).toMatchObject({ width: 100, height: 100 });
  expect(outputSize(400, 200, { width: "800", withoutEnlargement: "true" })).toMatchObject({ width: 400, height: 200 });
  expect(outputSize(400, 200, { format: "avif", lossless: "true", targetKB: "100" })).toMatchObject({ width: 400, height: 200 });
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

test("safeSource rejects SVG entities, external stylesheets, foreign namespaces, and external url() references", async () => {
  for (const content of [
    '<!DOCTYPE svg [<!ENTITY xxe "boom">]><svg xmlns="http://www.w3.org/2000/svg"/>',
    '<?xml-stylesheet type="text/css" href="https://evil.example/a.css"?><svg xmlns="http://www.w3.org/2000/svg"/>',
  ]) {
    await expect(safeSource(new File([content], "bad.svg", { type: "image/svg+xml" }))).rejects.toThrow("entities and external stylesheets");
  }

  const originalDOMParser = globalThis.DOMParser;
  const originalXMLSerializer = globalThis.XMLSerializer;
  const makeDoc = (nodes: Array<{ localName: string; namespaceURI: string | null; attributes: Array<{ name: string; value: string }> }>) => ({
    querySelector: () => null,
    documentElement: nodes[0]!,
    querySelectorAll: () => nodes,
  });
  let nextDoc = makeDoc([]);
  globalThis.DOMParser = class { parseFromString() { return nextDoc; } } as unknown as typeof DOMParser;
  globalThis.XMLSerializer = class { serializeToString() { return "<svg/>"; } } as unknown as typeof XMLSerializer;
  try {
    const svgFile = new File(["<svg/>"], "test.svg", { type: "image/svg+xml" });
    // Allowed: SVG namespace with local fragment url() references (quoted or unquoted).
    nextDoc = makeDoc([
      { localName: "svg", namespaceURI: "http://www.w3.org/2000/svg", attributes: [] },
      { localName: "rect", namespaceURI: "http://www.w3.org/2000/svg", attributes: [{ name: "fill", value: 'url("#grad-1")' }, { name: "clip-path", value: "url(#clip_0)" }] },
    ]);
    expect((await safeSource(svgFile)).type).toBe("image/svg+xml");

    // Blocked: foreign XHTML namespace, uppercase SCRIPT, feImage.
    for (const badNode of [
      { localName: "div", namespaceURI: "http://www.w3.org/1999/xhtml", attributes: [] },
      { localName: "SCRIPT", namespaceURI: "http://www.w3.org/2000/svg", attributes: [] },
      { localName: "feImage", namespaceURI: "http://www.w3.org/2000/svg", attributes: [] },
    ]) {
      nextDoc = makeDoc([{ localName: "svg", namespaceURI: "http://www.w3.org/2000/svg", attributes: [] }, badNode]);
      await expect(safeSource(svgFile)).rejects.toThrow("self-contained SVG");
    }

    // Blocked: external url(), javascript:, data: attributes.
    for (const attr of [
      { name: "fill", value: 'url("https://evil.example/x.svg#a")' },
      { name: "fill", value: "url(#ok) url(https://evil.example/x)" },
      { name: "values", value: "javascript:alert(1)" },
      { name: "style", value: "background:url(data:image/png;base64,AA==)" },
    ]) {
      nextDoc = makeDoc([{ localName: "svg", namespaceURI: "http://www.w3.org/2000/svg", attributes: [attr] }]);
      await expect(safeSource(svgFile)).rejects.toThrow("active content");
    }
  } finally {
    globalThis.DOMParser = originalDOMParser;
    globalThis.XMLSerializer = originalXMLSerializer;
  }
});
