import { PUBLIC_URL } from "./agent-api";

export const usageGuide = `# smush.lol

> Resize, inspect, compress, and convert images through an HTTP API or MCP server. No account, API key, or external storage service is required.

## Entry points

- [API and MCP documentation](${PUBLIC_URL}/docs): parameters, examples, connection setup, and error codes.
- [OpenAPI 3.1 schema](${PUBLIC_URL}/openapi.json): machine-readable REST request and response contracts.
- [Capabilities](${PUBLIC_URL}/api/capabilities): supported operations, defaults, and limits.
- [Image editor](${PUBLIC_URL}/): interactive tools, including additional browser-only features.

## MCP connection

Connect a Streamable HTTP MCP client to ${PUBLIC_URL}/mcp with no authentication. This is a stateless, JSON-response transport: POST requests only, no session IDs, no legacy SSE endpoint. Standard MCP clients handle initialization and headers automatically. Raw requests must accept both application/json and text/event-stream and send Content-Type: application/json.

Typical remote client configuration (client-specific configuration may vary):

\`\`\`json
{"mcpServers":{"smush":{"url":"${PUBLIC_URL}/mcp"}}}
\`\`\`

For local processing, clone https://github.com/nearbycoder/smush.lol, install Bun 1.4 or newer, run bun install --frozen-lockfile, and launch bun run mcp. For a process-spawning client, use command "bun" with args ["run", "/absolute/path/to/smush.lol/src/mcp-stdio.ts"]. Only JSON-RPC is written to stdout. Local stdio handles inline images locally; URL sources are fetched from their public hosts. The hosted MCP endpoint processes images on the smush.lol server.

Tools:
- get_capabilities: no arguments; returns server formats, options, limits, and documentation URLs.
- inspect_image: {"source":{"url":"https://example.com/photo.jpg"}}; returns detected format, dimensions, byte size, and filename.
- transform_image: {"source":{"url":"https://example.com/photo.jpg"},"options":{"width":800,"format":"webp","quality":82}}; returns metadata plus an MCP image content block containing the actual converted image. Decode/save the returned image data to keep the result.
- create_image_url: {"url":"https://example.com/photo.jpg","options":{"width":800,"format":"webp"}}; returns a reusable binary API URL. This validates the source URL but does not fetch or store it. The public source must remain available.

The same source can instead be {"base64":"STANDARD_PADDED_BASE64","filename":"photo.png"}. Supply exactly one source form. Do not send local filesystem paths or a data-URL prefix. MCP exposes this guide at smush://usage and capabilities at smush://capabilities. Tool failures return isError: true with a readable message.

## REST API

GET /api/capabilities returns JSON. GET /openapi.json returns the REST schema.
POST /api/inspect accepts {"source":{"url":"https://example.com/photo.jpg"}} as JSON and returns {filename,width,height,format,bytes}.
POST /api/transform accepts the same source plus optional options and returns {filename,mimeType,width,height,bytes,originalBytes,format,quality,base64}. Base64 is standard padded encoding with no data-URL prefix. No download URL is created or stored.

\`\`\`sh
curl '${PUBLIC_URL}/api/transform' \\
  -H 'Content-Type: application/json' \\
  -d '{"source":{"url":"${PUBLIC_URL}/social/smush-social-card-v2.jpg"},"options":{"width":600,"format":"webp"}}'

curl '${PUBLIC_URL}/api/smush' \\
  -F 'image=@photo.png' -F 'width=800' -F 'format=webp' --output photo.webp

curl --get '${PUBLIC_URL}/api/image' \\
  --data-urlencode 'url=${PUBLIC_URL}/social/smush-social-card-v2.jpg' \\
  --data 'width=600' --data 'format=webp' --output photo.webp
\`\`\`

GET /api/image takes a public url and transform query parameters and returns image bytes, cacheable for one hour. POST /api/smush accepts multipart image and string-valued transform fields and returns image bytes with no-store. GET /api/source?url=... returns original image bytes after validation. Prefer these binary routes for large images. JSON endpoints return no-store and allow cross-origin API calls. GET /health reports server health.

JSON/MCP options use actual numbers and booleans: width/height 1–12000, fit inside|fill, filter lanczos3|lanczos2|mitchell|cubic|mks2013|mks2021|bilinear|linear|box|nearest, withoutEnlargement, rotate 0|90|180|270, flip (vertical), flop (horizontal), brightness/saturation 0–3, format webp|jpeg|png, quality 1–100, targetKB 1–15360, progressive, lossless, compressionLevel 0–9, palette, colors 2–256, and dither. Defaults are WebP, quality 82, fit inside, Lanczos3, neutral brightness/saturation, and no rotation/flips. One dimension preserves aspect ratio; fill with both dimensions stretches. Target size is in KiB and only supports JPEG or lossy WebP; unreachable targets fail rather than returning oversized output. PNG ignores quality.

## Limits and behavior

Remote sources and multipart uploads: 15 MiB. Inline base64 input and inline output: 4 MiB each, decoded. JSON/MCP HTTP request body: 6 MiB. Decoded images/output: 48 megapixels; output: 12000 pixels per side. Source fetches time out after 10 seconds, with at most 3 redirects. Only public HTTP(S) sources on standard ports; credentials and private-network URLs are rejected. JSON/MCP rejects unknown fields and invalid option types instead of silently accepting them.

REST failures use {"error":"message"}: 400 invalid input, 403 blocked source/origin, 413 size limit, 415 non-image source or wrong content type, 422 decode/transform failure, 502 remote fetch failure. MCP transport errors use JSON-RPC errors; tool failures use isError. GET and DELETE /mcp return 405 because this transport has no persistent sessions or event stream.

Files are processed in memory and not stored by the app. The hosted API/MCP sends image bytes to the server; it is not browser-only processing. AVIF encoding, interactive cropping, background removal, watermarks, redaction, finishing effects, batch ZIPs, and recipes belong to the browser editor and are not server API/MCP operations. No animation-preservation guarantee is provided. Choose PNG or WebP when transparency is needed.
`;
