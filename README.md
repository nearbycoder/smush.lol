# smush.lol

A cheerful, no-account image workbench powered by [Bun.Image](https://bun.com/docs/runtime/image) and [Elysia](https://elysiajs.com/). Resize, rotate, flip, recolor, and convert images without Sharp or a native add-on.

## What it can do

- Drag, browse, paste, load a public image URL, or start with a generated demo image
- Resize up to 12,000px per side with Bun's native resampling kernels
- Rotate, flip horizontally or vertically, and adjust brightness/saturation
- Export WebP, progressive JPEG, or PNG
- Tune quality, lossless WebP, PNG compression, palette colors, and dithering
- Preview before/after size and dimensions, then download the result
- Copy a reusable transformation URL for remote images
- Process images only in memory; no files or metadata are stored

Uploads are capped at 15 MB and 48 megapixels. JPEG, PNG, and WebP are portable across Railway's Linux runtime. Bun can also decode the first frame of GIFs and handle BMP; HEIC, AVIF, and TIFF support depends on the host platform.

## Stack

- Bun 1.4 runtime, package manager, test runner, and browser bundler
- Elysia 1.4 for the HTTP server and typed multipart validation
- `Bun.Image` for metadata, transforms, and encoding
- Plain TypeScript and CSS in the browser
- Railway via a pinned Bun 1.4 Docker image

## Run locally

Install [Bun 1.4](https://bun.com/get), then:

```bash
bun install
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). To use another port:

```bash
PORT=4317 bun run dev
```

Quality checks:

```bash
bun run typecheck
bun test
bun run build
```

## API

### Transform a remote image

`GET /api/image` accepts a public HTTP(S) image URL and transform options as query parameters. The response is an inline image suitable for an `<img>` tag:

```text
https://smush.lol/api/image?url=https%3A%2F%2Fexample.com%2Fphoto.jpg&width=800&format=webp&quality=82
```

```html
<img src="https://smush.lol/api/image?url=https%3A%2F%2Fexample.com%2Fphoto.jpg&amp;width=800&amp;format=webp" alt="" />
```

Remote sources are limited to 15 MB, three redirects, and a ten-second fetch. Localhost, private-network addresses, credentials, non-web protocols, and nonstandard ports are rejected. Redirect destinations are checked again before they are fetched.

### Transform an upload

`POST /api/smush` accepts `multipart/form-data` with an `image` file and optional transform fields:

| Field | Values | Default |
| --- | --- | --- |
| `width`, `height` | `1`–`12000` | source size |
| `fit` | `inside`, `fill` | `inside` |
| `filter` | `lanczos3`, `mitchell`, `nearest`, and other Bun filters | `lanczos3` |
| `rotate` | `0`, `90`, `180`, `270` | `0` |
| `flip`, `flop` | boolean form values | `false` |
| `brightness`, `saturation` | `0`–`3` | `1` |
| `format` | `webp`, `jpeg`, `png` | `webp` |
| `quality` | `1`–`100` | `82` |

Both endpoints support the same transform fields. The response body is the transformed image. Headers include the output dimensions, format, Bun version, and a safe output filename.

## Deploy on Railway

Railway's current Bun guide recommends a Dockerfile because Railpack does not auto-detect Bun projects yet. This repo includes:

- a multi-stage `Dockerfile` pinned to `oven/bun:1.4.0-alpine`
- `railway.json` with Dockerfile build settings, `/health` checks, and restart/draining policy
- a server that listens on Railway's injected `PORT`

From the Railway dashboard, create a project from `nearbycoder/smush.lol`, then generate a Railway domain under **Settings → Networking**. Once it is healthy, add `smush.lol` as a custom domain.

Railway will provide two DNS records:

1. A CNAME/ALIAS target such as `example.up.railway.app`
2. A TXT ownership-verification record

Add both records at the DNS host. For an apex domain, the provider must support CNAME flattening, ALIAS, or ANAME; Railway does not publish a static IP for an A record. Requests will return 404 until the TXT verification succeeds.

## Privacy model

Image bytes are held only for the lifetime of the HTTP request. The server does not write uploads or remote images to disk, a database, object storage, analytics, or application logs. Upload responses use `Cache-Control: no-store`; remote transformation responses may be cached by clients for one hour.
