import { cp, mkdir } from "node:fs/promises";
const result = await Bun.build({ entrypoints: ["web/index.html", "web/docs.html", "web/codec-worker.ts"], outdir: "public", target: "browser", minify: true, splitting: true });
if (!result.success) { console.error(result.logs); process.exit(1); }
for (const codec of ["avif", "webp"]) {
  await mkdir(`public/codecs/${codec}`, { recursive: true });
  await cp(`node_modules/@jsquash/${codec}/codec/enc`, `public/codecs/${codec}`, { recursive: true });
}
