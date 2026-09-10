import { expect, test } from "bun:test";
import { app } from "../src/app";
import { MAX_AGENT_BODY_BYTES, MAX_INLINE_BYTES, readAgentJson } from "../src/agent-api";

export const pixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const post = (path: string, body: unknown) => app.handle(new Request(`http://localhost${path}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));

test("JSON inspect and transform return real image data and no-store metadata", async () => {
  const source = { base64: pixelBase64, filename: "pixel.png" };
  const inspect = await post("/api/inspect", { source });
  expect(inspect.status).toBe(200);
  expect(await inspect.json()).toMatchObject({ width: 1, height: 1, format: "png", bytes: 68, filename: "pixel.png" });
  for (const format of ["webp", "jpeg", "png"]) {
    const response = await post("/api/transform", { source, options: { width: 4, height: 3, fit: "fill", format } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    const result = await response.json();
    const bytes = Buffer.from(result.base64, "base64");
    expect(bytes.length).toBe(result.bytes);
    expect(result.mimeType).toBe(`image/${format}`);
    expect(result.originalBytes).toBe(68);
    expect(await new Bun.Image(bytes).metadata()).toMatchObject({ width: 4, height: 3, format });
  }
});

test("JSON options reject unsupported formats, unknown fields and ambiguous sources", async () => {
  for (const body of [
    { source: { base64: pixelBase64 }, options: { format: "avif" } },
    { source: { base64: pixelBase64 }, options: { width: "800" } },
    { source: { base64: pixelBase64 }, options: { watermark: "hi" } },
    { source: { base64: pixelBase64, url: "https://8.8.8.8/a.png" } },
    { source: { path: "/etc/passwd" } },
    { source: { base64: "%%%%" } },
    { source: { base64: "data:image/png;base64," + pixelBase64 } },
    { source: { base64: "AB==" } },
  ]) {
    const response = await post("/api/transform", body);
    expect(response.status).toBe(400);
    expect((await response.json()).error).toBeString();
  }
});

test("invalid image, private URL and impossible target return useful errors", async () => {
  expect((await post("/api/inspect", { source: { base64: "YWJjZA==" } })).status).toBe(422);
  expect((await post("/api/inspect", { source: { url: "http://127.0.0.1/private" } })).status).toBe(403);
  const response = await post("/api/transform", { source: { base64: pixelBase64 }, options: { format: "png", targetKB: 10 } });
  expect(response.status).toBe(422);
  expect((await response.json()).error).toContain("requires JPEG or lossy WebP");
});

test("JSON limits and content-type validation apply before processing", async () => {
  const wrongType = await app.handle(new Request("http://localhost/api/inspect", { method: "POST", body: "{}" }));
  expect(wrongType.status).toBe(415);
  const malformed = await app.handle(new Request("http://localhost/api/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{" }));
  expect(malformed.status).toBe(400);
  const tooLarge = Buffer.alloc(MAX_INLINE_BYTES + 1).toString("base64");
  expect((await post("/api/inspect", { source: { base64: tooLarge } })).status).toBe(413);
  let cancelled = false;
  const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(MAX_AGENT_BODY_BYTES + 1)); }, cancel() { cancelled = true; } });
  const request = new Request("http://localhost/api/inspect", { method: "POST", headers: { "Content-Type": "application/json" }, body: stream });
  await expect(readAgentJson(request)).rejects.toThrow("6 MiB");
  expect(cancelled).toBe(true);
});

test("capabilities, OpenAPI and usage are publicly discoverable", async () => {
  const capabilities = await (await app.handle(new Request("http://localhost/api/capabilities"))).json();
  expect(capabilities.outputFormats).toEqual(["webp", "jpeg", "png"]);
  const schema = await (await app.handle(new Request("http://localhost/openapi.json"))).json();
  expect(schema.openapi).toBe("3.1.0");
  expect(schema.paths["/api/transform"].post.requestBody.content["application/json"].schema.properties.options.properties.format.enum).toEqual(capabilities.outputFormats);
  const guide = await app.handle(new Request("http://localhost/llms.txt"));
  expect(guide.headers.get("content-type")).toContain("text/plain");
  expect(await guide.text()).toContain("transform_image");
  for (const alias of ["/llm.txt", "/LLM.txt"]) expect((await app.handle(new Request(`http://localhost${alias}`))).headers.get("location")).toBe("/llms.txt");
  expect((await app.handle(new Request("http://localhost/api/transform", { method: "OPTIONS" }))).status).toBe(204);
});
