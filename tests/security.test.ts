import { expect, test } from "bun:test";
import { app } from "../src/app";
import { INTERNAL_FETCH_HEADER } from "../src/remote-image";

const onePixelPng = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="),
  (character) => character.charCodeAt(0),
);

test("security headers cover JSON, binary errors and MCP responses", async () => {
  for (const path of ["/health", "/api/capabilities", "/api/source?url=http://127.0.0.1/private", "/mcp"]) {
    const response = await app.handle(new Request(`http://localhost${path}`));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("x-permitted-cross-domain-policies")).toBe("none");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("strict-transport-security")).toBeNull();
    const policy = response.headers.get("content-security-policy")!;
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  }
});

test("HTTPS requests receive HSTS and unknown routes return 404 instead of 500", async () => {
  const httpsResponse = await app.handle(new Request("http://localhost/health", {
    headers: { "X-Forwarded-Proto": "https" },
  }));
  expect(httpsResponse.status).toBe(200);
  expect(httpsResponse.headers.get("strict-transport-security")).toBe("max-age=31536000; includeSubDomains");

  const missing = await app.handle(new Request("http://localhost/no-such-route-here"));
  expect(missing.status).toBe(404);
  expect(missing.headers.get("x-content-type-options")).toBe("nosniff");
  expect(await missing.json()).toEqual({ error: "Not found." });
});

test("internal loop header blocks recursive /api/image and /api/source requests", async () => {
  for (const path of ["/api/image?url=https://8.8.8.8/a.png", "/api/source?url=https://8.8.8.8/a.png"]) {
    const response = await app.handle(new Request(`http://localhost${path}`, {
      headers: { [INTERNAL_FETCH_HEADER]: "1" },
    }));
    expect(response.status).toBe(403);
    expect((await response.json()).error).toContain("Recursive");
  }
});

test("/api/source isolates cross-origin access and sanitizes attachment filenames", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async () => new Response(onePixelPng, {
    headers: { "Content-Type": "image/png" },
  })) as unknown as typeof fetch;
  try {
    const response = await app.handle(new Request("http://localhost/api/source?url=https://8.8.8.8/...hidden.png"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="hidden.png"');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HTML uses short revalidating cache and hashed chunks use single immutable Cache-Control", async () => {
  const { readdirSync, existsSync } = await import("node:fs");
  if (!existsSync("public")) return;
  const chunk = readdirSync("public").find((name) => /^chunk-[a-z0-9]+\.js$/i.test(name));
  if (!chunk) return;
  const server = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: app.handle });
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(home.headers.get("cache-control")).toBe("public, max-age=60, stale-while-revalidate=300");

    const asset = await fetch(`${base}/${chunk}`);
    expect(asset.status).toBe(200);
    expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
  } finally {
    server.stop(true);
  }
});
