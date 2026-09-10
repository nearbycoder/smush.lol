import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import {
  agentError, capabilities, createImageUrl, imageUrlSchema, inspectImage, inspectSchema,
  PUBLIC_URL, readAgentJson, transformAgentImage, transformSchema,
} from "./agent-api";
import { usageGuide } from "./usage";

export function createMcpServer() {
  const server = new McpServer({ name: "smush.lol", version: "1.0.0" }, {
    instructions: "Inspect, resize, compress, and convert images. Read smush://usage or get_capabilities for limits. Hosted calls process images on this server; no files are stored. AVIF and advanced editor effects are browser-only.",
  });
  const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true };
  server.registerTool("get_capabilities", {
    title: "Image processing capabilities", description: "Discover server formats, defaults, supported operations, size limits, and documentation.",
    inputSchema: z.strictObject({}), annotations: { ...annotations, openWorldHint: false },
  }, async () => ({ content: [{ type: "text", text: JSON.stringify(capabilities) }], structuredContent: capabilities }));
  server.registerTool("inspect_image", {
    title: "Inspect an image", description: "Inspect image dimensions, detected format, filename and byte size from a public URL or up to 4 MiB of inline base64. Does not store the source.",
    inputSchema: inspectSchema, annotations,
  }, async (input) => {
    try {
      const result = await inspectImage(input);
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) { return toolError(error); }
  });
  server.registerTool("transform_image", {
    title: "Resize and convert an image", description: "Resize, compress, rotate, flip or adjust brightness/saturation. Outputs WebP, JPEG or PNG as MCP image content plus metadata. Inline input/output is limited to 4 MiB. Does not store images or provide a persistent result URL.",
    inputSchema: transformSchema, annotations,
  }, async (input) => {
    try {
      const { base64, ...metadata } = await transformAgentImage(input);
      return { content: [{ type: "text", text: JSON.stringify(metadata) }, { type: "image", data: base64, mimeType: metadata.mimeType }], structuredContent: metadata };
    } catch (error) { return toolError(error); }
  });
  server.registerTool("create_image_url", {
    title: "Create an image conversion URL", description: "Build a binary API URL for a public source and transform settings without fetching image bytes. Useful for large output. The source must remain available; this does not upload or store an image.",
    inputSchema: imageUrlSchema, annotations,
  }, async (input) => {
    try {
      const result = await createImageUrl(input);
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (error) { return toolError(error); }
  });
  server.registerResource("usage", "smush://usage", { title: "smush.lol usage guide", mimeType: "text/markdown" }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "text/markdown", text: usageGuide }] }));
  server.registerResource("capabilities", "smush://capabilities", { title: "Server capabilities", mimeType: "application/json" }, async (uri) => ({ contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(capabilities) }] }));
  return server;
}

function toolError(error: unknown) {
  return { isError: true, content: [{ type: "text" as const, text: agentError(error).error }] };
}

export async function handleMcp(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const publicHost = new URL(PUBLIC_URL).hostname;
  const hostAllowed = [publicHost, "localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  const origin = request.headers.get("origin");
  const originAllowed = !origin || origin === PUBLIC_URL || (hostAllowed && origin === url.origin);
  const headers = new Headers({ "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", Vary: "Origin" });
  const fail = (status: number, code: number, message: string) => Response.json({ jsonrpc: "2.0", id: null, error: { code, message } }, { status, headers });
  if (!hostAllowed || !originAllowed) return fail(403, -32000, "MCP host or Origin is not allowed.");
  if (origin) headers.set("Access-Control-Allow-Origin", origin);
  headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type, Accept, MCP-Protocol-Version, MCP-Session-Id");
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers });
  if (request.method !== "POST") {
    headers.set("Allow", "POST, OPTIONS");
    return fail(405, -32000, "Use Streamable HTTP POST. This stateless server has no GET event stream or DELETE session.");
  }
  let body: unknown;
  try { body = await readAgentJson(request); }
  catch (error) {
    const result = agentError(error);
    return fail(result.status, result.error.includes("valid JSON") ? -32700 : -32600, result.error);
  }
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody: body });
    headers.forEach((value, key) => response.headers.set(key, value));
    return response;
  } catch {
    return fail(500, -32603, "MCP request could not be processed.");
  } finally { await server.close(); }
}
