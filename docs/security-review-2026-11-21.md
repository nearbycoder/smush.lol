# Dependency, security, and performance review — 2026-11-21

Scope: runtime and npm dependency graph, server HTTP/API/MCP handlers, remote-image retrieval, static asset caching, browser SVG handling, build artifacts, and client/server image processing pipelines.

## Dependency updates

| Dependency | Previous version | Updated version |
| --- | --- | --- |
| Bun runtime / container / CI | 1.4.2 | 1.4.5 |
| `@elysiajs/static` | 1.4.10 | 1.4.12 |
| `elysia` | 1.4.30 | 1.4.32 |
| `@modelcontextprotocol/server` | 2.0.0 | 2.4.0 |
| `@modelcontextprotocol/client` | 2.0.0 | 2.4.0 |
| `@modelcontextprotocol/sdk` | 1.30.0 | 1.32.2 |
| `zod` | 4.6.5 | 4.6.7 |
| `@huggingface/transformers` | 4.3.0 | 4.3.2 |
| `@types/bun` | 1.4.2 | 1.4.5 |
| `exifreader` | 4.45.1 | 4.54.0 |

Transitive updates include `sharp` 0.35.5, `hono` 4.13.19, `@hono/node-server` 2.1.11, `body-parser` 2.4.0, `fast-uri` 3.1.9, `ip-address` 10.7.6, and `qs` 6.17.1. Both `bun audit` and `bun audit --prod` went from 30 advisories (11 high, 16 moderate, 3 low) to 0 known vulnerabilities without overrides, and `bun outdated` reports no outdated packages.

## Security hardening

- **Recursive SSRF / loop protection:** Outbound remote fetches tag requests with `X-Smush-Fetch: 1` and block recursive `smush.lol` `/api/*` targets (while keeping static assets such as `/social/*` reachable). `/api/image` and `/api/source` also reject incoming requests carrying `X-Smush-Fetch`.
- **Remote URL & stream hardening:** Normalized hostnames strip multiple trailing dots, reject empty labels (`..`) and `.localdomain`, cap resolved DNS candidates to 8 unique addresses, reject remote `image/svg+xml` responses before downloading, and wire the request abort signal directly to the body stream reader so stalled bodies always cancel on deadline.
- **`/api/source` & HTTP hardening:** Allowlisted safe raster formats for `/api/source` `Content-Type`, added `Cross-Origin-Resource-Policy: same-origin`, sanitized attachment filenames against leading dots, set `idleTimeout: 30` on the Bun server, fixed unknown routes returning HTTP 404 instead of HTTP 500 with `console.error` spam, and added `Cross-Origin-Opener-Policy: same-origin`, `X-Permitted-Cross-Domain-Policies: none`, expanded `Permissions-Policy`, and `Strict-Transport-Security` for HTTPS requests.
- **MCP transport hardening:** Restricted HTTP origin matching to loopback hosts (blocking HTTP origin downgrade against the production HTTPS host), configured `maxRequestBodySize` on both modern and legacy transports, and rejected empty or oversized (>10) JSON-RPC batches.
- **Browser SVG sanitization:** Checked `<!DOCTYPE`, `<!ENTITY`, and `<?xml-stylesheet` before `DOMParser`, enforced the SVG namespace and case-insensitive tag blocking (including `feImage`, `iframe`, `object`, `embed`, `a`, `handler`, `listener`), restricted `url(...)` values to clean local fragment identifiers, blocked `javascript:`/`vbscript:`/`data:` attribute schemes, and routed queued SVG thumbnails in the contact-sheet/PDF dialog through `safeSource`.

## Performance optimizations

- **Server image pipeline (`src/image.ts`, `src/app.ts`, `src/agent-api.ts`):**
  - Reused the initial `Bun.Image` instance after `.metadata()` and lazily materialized a single lossless intermediate PNG (up to 8 MP) during transformed `targetKB` binary searches, cutting multi-pass search latency ~4×.
  - Removed the redundant up-to-15 MiB buffer copy in `/api/source` and single-chunk copy in `readLimitedBody`.
  - Replaced full 4 MiB base64 re-encoding validation in `loadSource` with O(1) canonical padding-bit verification and pre-allocation size checks.
  - Pre-serialized `/openapi.json` and `/api/capabilities` JSON payloads once at startup.
  - Fixed duplicate `Cache-Control` headers on static routes; hashed JS/CSS/SVG chunks now serve `public, max-age=31536000, immutable` while HTML entrypoints use `public, max-age=60, stale-while-revalidate=300`.
- **Build footprint (`web/build.ts`):** Copied only runtime WASM/JS files for codecs and ONNX (`ort-wasm-*.{wasm,mjs}`), reducing generated `public/` size by ~17 MB.
- **Browser image processing & workers (`web/`):**
  - Eliminated per-pixel array/object/closure allocations across `pixel-operations.ts`, `studio-pixels.ts`, `studio-advanced.ts`, `histogram.ts`, `palette.ts`, `difference-math.ts`, and `trim-geometry.ts`.
  - Added 256-entry LUTs for `gamma`, `levels`, `posterize`, `autoLevels`, `autoBalance`, `channelMixer`, and `solarize`; fused 4-channel sliding-box blur passes (skipping blur when `amount === 0`); precomputed luminance/alpha buffers for `edges`/`emboss`/`median`; and replaced object-allocating `median` sorting with fixed typed-array insertion sort (1.8×–33× faster on 1 MP images with bit-exact output).
  - Reused idle `codec-worker.js` (with memoized WASM encoder init) and `pixel-worker.js` instances across sequential conversions while keeping immediate `worker.terminate()` cancellation on abort or error.
  - Guarded queue panel form click/change re-renders when the queue is empty.
