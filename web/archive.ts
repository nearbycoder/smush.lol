import { Zip, ZipPassThrough } from "fflate";
import type { ExportResult } from "./queue";

export async function createArchive(results: ExportResult[]): Promise<Blob> {
  if (!results.length) throw new Error("Convert an image before downloading a ZIP.");
  const chunks: BlobPart[] = [];
  const used = new Set<string>();
  let failure: Error | null = null;
  const zip = new Zip((error, data) => {
    if (error) failure = error;
    else chunks.push(new Uint8Array(data));
  });
  for (const result of results) {
    const base = result.filename.replace(/[\\/\x00-\x1f]/g, "_").replace(/^\.+/, "_") || "image";
    let name = base;
    let index = 2;
    while (used.has(name.toLowerCase())) {
      const dot = base.lastIndexOf(".");
      name = dot > 0 ? `${base.slice(0, dot)}-${index++}${base.slice(dot)}` : `${base}-${index++}`;
    }
    used.add(name.toLowerCase());
    const entry = new ZipPassThrough(name);
    zip.add(entry);
    const reader = result.blob.stream().getReader();
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        entry.push(value);
      }
      entry.push(new Uint8Array(), true);
    } finally { reader.releaseLock(); }
    if (failure) throw failure;
    // Yield between images so queue controls remain responsive.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  zip.end();
  if (failure) throw failure;
  return new Blob(chunks, { type: "application/zip" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
