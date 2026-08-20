import { describe, expect, test } from "bun:test";
import { app } from "../src/app";

const onePixelPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
  (character) => character.charCodeAt(0),
);

describe("smush API", () => {
  test("reports Bun health", async () => {
    const response = await app.handle(new Request("http://localhost/health"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, runtime: "bun" });
  });

  test("transforms an uploaded PNG to WebP", async () => {
    const body = new FormData();
    body.set("image", new File([onePixelPng], "pixel.png", { type: "image/png" }));
    body.set("format", "webp");
    body.set("quality", "75");
    body.set("brightness", "1");
    body.set("saturation", "1");

    const response = await app.handle(
      new Request("http://localhost/api/smush", {
        method: "POST",
        body,
      }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("content-disposition")).toContain("smushed-pixel.webp");

    const output = await response.arrayBuffer();
    expect(output.byteLength).toBeGreaterThan(0);
    expect(await new Bun.Image(output).metadata()).toMatchObject({
      width: 1,
      height: 1,
      format: "webp",
    });
  });

  test("transforms a public image URL with query parameters", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => new Response(onePixelPng, {
      headers: {
        "Content-Length": String(onePixelPng.byteLength),
        "Content-Type": "image/png",
      },
    })) as unknown as typeof fetch;

    try {
      const params = new URLSearchParams({
        format: "jpeg",
        quality: "70",
        url: "https://8.8.8.8/pixel.png",
        width: "2",
      });
      const response = await app.handle(new Request(`http://localhost/api/image?${params}`));

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("image/jpeg");
      expect(response.headers.get("content-disposition")).toContain("inline");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("x-image-width")).toBe("2");

      const output = await response.arrayBuffer();
      expect(await new Bun.Image(output).metadata()).toMatchObject({
        width: 2,
        height: 2,
        format: "jpeg",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("rejects private source URLs", async () => {
    const params = new URLSearchParams({ url: "http://127.0.0.1/image.png" });
    const response = await app.handle(new Request(`http://localhost/api/image?${params}`));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Private network image URLs are not allowed." });
  });
});
