import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { app } from "../src/app";

const pixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let http: ReturnType<typeof Bun.serve>;
let base: string;
beforeAll(() => { http = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.handle }); base = `http://127.0.0.1:${http.port}`; });
afterAll(() => { http.stop(true); });

async function connect() {
  const client = new Client({ name: "smush-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
}

test("real Streamable HTTP client discovers tools/resources and processes images", async () => {
  const client = await connect();
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(["create_image_url", "get_capabilities", "inspect_image", "transform_image"]);
    expect((await client.listResources()).resources.map((resource) => resource.uri)).toContain("smush://usage");
    expect((await client.readResource({ uri: "smush://usage" })).contents[0]).toHaveProperty("text");
    const source = { base64: pixelBase64, filename: "pixel.png" };
    const inspected = await client.callTool({ name: "inspect_image", arguments: { source } });
    expect(inspected.isError).not.toBe(true);
    expect(inspected.structuredContent).toMatchObject({ width: 1, height: 1, format: "png" });
    const transformed = await client.callTool({ name: "transform_image", arguments: { source, options: { width: 3, format: "png" } } });
    expect(transformed.isError).not.toBe(true);
    const image = (transformed.content as Array<{ type: string; data: string; mimeType: string }>).find((item) => item.type === "image")!;
    expect(image.mimeType).toBe("image/png");
    expect(await new Bun.Image(Buffer.from(image.data, "base64")).metadata()).toMatchObject({ width: 3, height: 3, format: "png" });
    const url = await client.callTool({ name: "create_image_url", arguments: { url: "https://8.8.8.8/photo.png", options: { width: 800, format: "webp" } } });
    expect(url.structuredContent).toMatchObject({ url: "https://smush.lol/api/image?url=https%3A%2F%2F8.8.8.8%2Fphoto.png&width=800&format=webp" });
    const blocked = await client.callTool({ name: "inspect_image", arguments: { source: { url: "http://localhost/private" } } });
    expect(blocked.isError).toBe(true);
    const invalid = await client.callTool({ name: "transform_image", arguments: { source, options: { format: "avif" } } });
    expect(invalid.isError).toBe(true);
  } finally { await client.close(); }
});

test("independent concurrent MCP clients do not share request state", async () => {
  const clients = await Promise.all([connect(), connect()]);
  try {
    const results = await Promise.all(clients.map((client, i) => client.callTool({ name: "transform_image", arguments: { source: { base64: pixelBase64 }, options: { width: i + 2 } } })));
    results.forEach((result, i) => expect(result.structuredContent).toMatchObject({ width: i + 2 }));
  } finally { await Promise.all(clients.map((client) => client.close())); }
});

test("MCP validates origin, host, methods, JSON and protocol envelopes", async () => {
  const post = (body: string, extra: Record<string, string> = {}) => fetch(`${base}/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", ...extra }, body });
  expect((await post("{}", { Origin: "https://evil.example" })).status).toBe(403);
  expect((await app.handle(new Request("http://evil.example/mcp", { method: "POST", body: "{}" }))).status).toBe(403);
  const badJson = await post("{");
  expect(badJson.status).toBe(400);
  expect((await badJson.json()).error.code).toBe(-32700);
  expect((await post("{}")).status).toBe(400);
  expect((await post('{"jsonrpc":"2.0","id":1,"method":"tools/list"}', { Accept: "application/json" })).status).toBe(406);
  for (const method of ["GET", "DELETE"]) expect((await fetch(`${base}/mcp`, { method })).status).toBe(405);
  expect((await fetch(`${base}/mcp`, { method: "OPTIONS", headers: { Origin: base } })).headers.get("access-control-allow-origin")).toBe(base);
});

test("local stdio transport initializes and transforms without an HTTP server", async () => {
  const client = new Client({ name: "stdio-test", version: "1.0.0" });
  const transport = new StdioClientTransport({ command: process.execPath, args: ["run", new URL("../src/mcp-stdio.ts", import.meta.url).pathname], stderr: "pipe" });
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "transform_image", arguments: { source: { base64: pixelBase64 }, options: { format: "jpeg" } } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ width: 1, height: 1, mimeType: "image/jpeg" });
  } finally { await client.close(); }
});
