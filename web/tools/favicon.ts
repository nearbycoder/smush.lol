import { decodeSource, canvasBlob } from "../local-image";
import { createArchive } from "../archive";
import { fittedImage, ico } from "./pack-image";
import { value, paragraph, download, yieldFrame, type ImageTool } from "./shared";
export const faviconTool: ImageTool = {
  title: "Favicon pack", description: "Create 16, 32, 48, 180, 192 and 512px PNGs, a multi-size ICO, and HTML link tags in one ZIP. Uses the selected image; choose the current export to include edits.",
  controls: '<label>Square fitting <select id="favicon-fit"><option value="contain">Fit entire image (transparent padding)</option><option value="cover">Fill square (center crop)</option></select></label>',
  async run({ file, signal, output, progress }) {
    const { image, release } = await decodeSource(file); const files: Array<{ blob: Blob; filename: string }> = [], icons: Array<{ size: number; png: Uint8Array }> = [];
    try { for (const size of [16,32,48,180,192,512]) { signal.throwIfAborted(); progress(`Drawing ${size}px icon…`); const c = fittedImage(image, image.naturalWidth, image.naturalHeight, size, size, value("favicon-fit") === "cover", ""); try { const blob = await canvasBlob(c); files.push({ blob, filename: `icon-${size}.png` }); if (size <= 48) icons.push({ size, png: new Uint8Array(await blob.arrayBuffer()) }); } finally { c.width = c.height = 0; } await yieldFrame(); }
      files.push({ blob: new Blob([ico(icons)], { type: "image/x-icon" }), filename: "favicon.ico" }, { blob: new Blob(['<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/icon-32.png">\n<link rel="apple-touch-icon" sizes="180x180" href="/icon-180.png">\n'], { type: "text/html" }), filename: "icon-links.html" });
      const zip = await createArchive(files); signal.throwIfAborted(); paragraph(output, "8 files ready: six PNG sizes, favicon.ico with three sizes, and HTML link tags. Copy the files into your site and add the tags to its head."); download(output, zip, "favicon-pack.zip");
    } finally { release(); }
  },
};
