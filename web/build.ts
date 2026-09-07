import { cp, mkdir } from "node:fs/promises";
const result = await Bun.build({ entrypoints: ["web/index.html", "web/docs.html", "web/codec-worker.ts", "web/background-worker.ts"], outdir: "public", target: "browser", minify: true, splitting: true });
if (!result.success) { console.error(result.logs); process.exit(1); }
for (const codec of ["avif", "webp"]) {
  await mkdir(`public/codecs/${codec}`, { recursive: true });
  await cp(`node_modules/@jsquash/${codec}/codec/enc`, `public/codecs/${codec}`, { recursive: true });
}

await mkdir("public/models/runtime", { recursive: true });
for await (const name of new Bun.Glob("*.{wasm,mjs}").scan("node_modules/onnxruntime-web/dist")) await cp(`node_modules/onnxruntime-web/dist/${name}`, `public/models/runtime/${name}`);
