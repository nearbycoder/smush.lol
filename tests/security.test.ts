import { expect, test } from "bun:test";
import { app } from "../src/app";

test("security headers cover JSON, binary errors and MCP responses", async () => {
  for (const path of ["/health", "/api/capabilities", "/api/source?url=http://127.0.0.1/private", "/mcp"]) {
    const response = await app.handle(new Request(`http://localhost${path}`));
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const policy = response.headers.get("content-security-policy")!;
    expect(policy).toContain("frame-ancestors 'none'");
    expect(policy).toContain("object-src 'none'");
    expect(policy).toContain("script-src 'self' 'wasm-unsafe-eval';");
    expect(policy).not.toContain("script-src 'self' 'unsafe-inline'");
  }
});
