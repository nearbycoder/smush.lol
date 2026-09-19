# Security and dependency review — 2026-09-19

Scope: server image transforms, remote-image retrieval, JSON API, HTTP/stdio MCP, browser image loading and exports, dependency graph, generated assets, and CI/container configuration.

## Findings addressed

- **DNS rebinding / SSRF:** the prior DNS check and subsequent fetch could resolve a hostname independently. Connections now target the checked address, preserve Host and TLS certificate verification, disable environment proxies, revalidate every redirect, and include DNS in the request deadline. IPv4 alternative representations and IPv6 mapped, transition, and special-use destinations are blocked. This follows [Bun's documented address-pinning API](https://bun.com/docs/runtime/networking/fetch#connecting-to-a-specific-address).
- **Output allocation bounds:** validation previously calculated resize dimensions before rotation, whereas Bun rotates first. Thin images could therefore produce much larger output than the validator predicted. Bounds now use the rotated aspect ratio before encoding; height-only resizing uses that ratio too. Regression tests reject oversized rotated images without allocating the output.
- **Slow JSON uploads:** JSON API and MCP readers now cancel stalled or abandoned request bodies, with a 30-second deadline as well as the existing 6 MiB bound.
- **Browser hardening:** Content Security Policy blocks inline script execution, object embedding, and framing while supporting same-origin workers, WASM encoders, image blobs, and opt-in model downloads. Referrer and permissions policies reduce incidental data exposure. Existing public image API CORS behavior is preserved.
- **Obsolete assets:** builds clear generated output so previous JS bundles and codec/model runtimes are no longer served after updates.
- **Dependency advisories:** the initial audit reported six advisories across fflate, adm-zip, and sharp. Updating the dependency graph removed them without overrides. Both full and production-only audits now report zero known vulnerabilities.

## Dependency changes

| Dependency | Previous installed version | Updated version |
| --- | --- | --- |
| Bun runtime / container / CI | 1.4.0 | 1.4.2 |
| Elysia | 1.4.29 | 1.4.30 |
| Zod | 4.6.1 | 4.6.5 |
| Transformers.js | 4.2.0 | 4.3.0 |
| Bun types | 1.4.0 | 1.4.2 |
| TypeScript | 5.9.3 | 7.0.2 |
| ExifReader | 4.44.1 | 4.45.1 |
| fflate | 0.8.2 | 0.8.3 |

Other direct packages were already at the registry's latest stable versions. Compatible transitive updates include sharp 0.35.4, adm-zip 0.6.1, and ONNX runtimes supplied by Transformers 4.3. CI uses checkout 7.0.1 and setup-bun 2.2.0, pinned to immutable commit SHAs. `bun outdated` reports no outdated direct packages.

## Validation

- Frozen-lockfile install, typecheck, clean build, and 101 automated tests pass on Bun 1.4.2, including real HTTP and stdio MCP clients.
- Security regressions cover DNS pinning, redirect rebinding, mixed DNS answers, IP encodings, DNS/body timeouts, chunked size limits, rotation allocation bounds, and response headers.
- A real HTTPS remote image fetched and decoded successfully using a pinned address.
- Desktop and mobile browser checks cover editor conversion, comparison, recipes, undo/redo, custom dropdowns, batch exports, and toolbox access.
- Browser dependency smoke tests cover hostile SVG rejection, safe SVG conversion, PNG, WebP/AVIF WASM encoding, cropping, metadata JSON, contact sheets, PDF, and ZIP downloads under the CSP.
- All 20 studio tools pass browser tests, including download decoding, chained edits, cancellation, and keeping image bytes local.
- Background removal completed a real model download/inference and produced a 64 × 64 result without CSP violations. The documentation page loads normally.
- CI also builds the production Docker image and checks its health endpoint, homepage, and JSON image transform. No local Docker daemon was available, so container verification runs in GitHub Actions.

## Scope limits

This is a code and dependency review with targeted regression tests, not a penetration-test certification. Audits cover known registry advisories. Service-wide traffic limits, infrastructure egress policy, production host configuration, load testing, and exhaustive image-codec fuzzing were not assessed. The public API remains unauthenticated by design; per-request bounds do not replace deployment-level capacity controls.
