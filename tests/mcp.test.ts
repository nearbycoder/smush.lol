import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { Client as ModernClient, StreamableHTTPClientTransport as ModernHTTPTransport } from "@modelcontextprotocol/client";
import { StdioClientTransport as ModernStdioTransport } from "@modelcontextprotocol/client/stdio";
import { app } from "../src/app";

const pixelBase64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
let http: ReturnType<typeof Bun.serve>;
let base: string;
beforeAll(() => { http = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.handle }); base = `http://127.0.0.1:${http.port}`; });
afterAll(() => { http.stop(true); });

function modernRequest(method: string, params: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return fetch(`${base}/mcp`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json", Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2026-07-28", "Mcp-Method": method,
      ...(typeof params.name === "string" ? { "Mcp-Name": params.name } : {}), ...headers,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {
      _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28", "io.modelcontextprotocol/clientCapabilities": {} }, ...params,
    } }),
  });
}

async function connect(modern = false) {
  if (modern) {
    const client = new ModernClient({ name: "modern-test", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } });
    await client.connect(new ModernHTTPTransport(new URL(`${base}/mcp`)));
    expect(client.getDiscoverResult()).toMatchObject({ supportedVersions: ["2026-07-28"] });
    return client;
  }
  const client = new Client({ name: "smush-test", version: "1.0.0" });
  await client.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`)));
  return client;
}

for (const modern of [false, true]) test(`${modern ? "modern stateless" : "stable"} HTTP client discovers tools/resources and processes images`, async () => {
  const client = await connect(modern);
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
  const clients = await Promise.all([connect(false), connect(true)]);
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

test("stateless calls work without initialization or discovery and never mint sessions", async () => {
  const response = await modernRequest("tools/call", {
    name: "transform_image", arguments: { source: { base64: pixelBase64 }, options: { width: 4, format: "webp" } },
  }, { "MCP-Session-Id": "ignored-old-session" });
  expect(response.status).toBe(200);
  expect(response.headers.get("content-type")).toContain("application/json");
  expect(response.headers.get("mcp-session-id")).toBeNull();
  expect((await response.json()).result).toMatchObject({ resultType: "complete", structuredContent: { width: 4, format: "webp" } });

  const discovery = await modernRequest("server/discover");
  expect((await discovery.json()).result).toMatchObject({
    supportedVersions: ["2026-07-28"], ttlMs: 0, cacheScope: "private",
    capabilities: { tools: { listChanged: false }, resources: { listChanged: false, subscribe: false } },
  });
  const listing = await modernRequest("tools/list");
  expect((await listing.json()).result).toMatchObject({ ttlMs: 0, cacheScope: "private" });
});

test("modern envelope and header errors cannot silently fall back to stable MCP", async () => {
  for (const headers of [{ "Mcp-Method": "resources/list" }, { "MCP-Protocol-Version": "2025-11-25" }] as Record<string, string>[]) {
    const response = await modernRequest("tools/list", {}, headers);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe(-32020);
  }
  const missingCapabilities = await modernRequest("tools/list", { _meta: { "io.modelcontextprotocol/protocolVersion": "2026-07-28" } });
  expect(missingCapabilities.status).toBe(400);
  const unsupported = await modernRequest("tools/list", { _meta: {
    "io.modelcontextprotocol/protocolVersion": "2099-01-01", "io.modelcontextprotocol/clientCapabilities": {},
  } }, { "MCP-Protocol-Version": "2099-01-01" });
  expect((await unsupported.json()).error.code).toBe(-32022);
  expect((await modernRequest("tools/list", {}, { Origin: "https://evil.example" })).status).toBe(403);
  // This static tool catalog has no subscriptions or server-side session storage.
  const listen = await modernRequest("subscriptions/listen", {});
  expect((await listen.json()).error).toBeDefined();
});

test("stable protocol revisions retain initialize and JSON responses without sessions", async () => {
  for (const protocolVersion of ["2025-03-26", "2025-06-18", "2025-11-25"]) {
    const response = await fetch(`${base}/mcp`, {
      method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "initialize", params: {
        protocolVersion, capabilities: {}, clientInfo: { name: "stable-test", version: "1" },
      } }),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(response.headers.get("mcp-session-id")).toBeNull();
    const { result } = await response.json();
    expect(result.protocolVersion).toBe(protocolVersion);
    expect(result).not.toHaveProperty("resultType");
  }
});

test("both MCP eras enforce the body limit and modern browser preflight allows protocol headers", async () => {
  for (const modern of [false, true]) {
    const response = await fetch(`${base}/mcp`, {
      method: "POST", headers: { "Content-Type": "application/json", ...(modern ? { "MCP-Protocol-Version": "2026-07-28" } : {}) },
      body: JSON.stringify({ padding: "a".repeat(6 * 1024 * 1024) }),
    });
    expect(response.status).toBe(413);
  }
  const response = await fetch(`${base}/mcp`, {
    method: "OPTIONS", headers: { Origin: base, "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "mcp-method,mcp-name,mcp-protocol-version" },
  });
  expect(response.status).toBe(204);
  expect(response.headers.get("access-control-allow-origin")).toBe(base);
  expect(response.headers.get("access-control-allow-headers")?.toLowerCase()).toContain("mcp-method, mcp-name");
});

for (const modern of [false, true]) test(`${modern ? "modern stateless" : "stable"} stdio transforms without an HTTP server`, async () => {
  const params = { command: process.execPath, args: ["run", new URL("../src/mcp-stdio.ts", import.meta.url).pathname], stderr: "pipe" as const };
  const client = modern
    ? new ModernClient({ name: "stdio-test", version: "1.0.0" }, { versionNegotiation: { mode: { pin: "2026-07-28" } } })
    : new Client({ name: "stdio-test", version: "1.0.0" });
  const transport = modern ? new ModernStdioTransport(params) : new StdioClientTransport(params);
  try {
    await client.connect(transport);
    const result = await client.callTool({ name: "transform_image", arguments: { source: { base64: pixelBase64 }, options: { format: "jpeg" } } });
    expect(result.isError).not.toBe(true);
    expect(result.structuredContent).toMatchObject({ width: 1, height: 1, mimeType: "image/jpeg" });
  } finally { await client.close(); }
});
