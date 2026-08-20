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
});
