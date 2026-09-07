import { decodeSource, canvasBlob } from "../local-image";
import { createArchive } from "../archive";
import { fittedImage } from "./pack-image";
import { value, paragraph, download, yieldFrame, type ImageTool } from "./shared";
export const socialSizes = [{ name: "square", width: 1080, height: 1080 }, { name: "portrait", width: 1080, height: 1350 }, { name: "story", width: 1080, height: 1920 }, { name: "landscape", width: 1200, height: 630 }];
export const socialTool: ImageTool = {
  title: "Social image pack", description: "Export square (1080×1080), portrait (1080×1350), story (1080×1920), and landscape (1200×630) images. Pick centered cropping or fit the whole image with a background.",
  controls: '<label>Pack <select id="social-pack"><option value="all">All four sizes</option><option value="square">Square only</option><option value="portrait">Portrait only</option><option value="story">Story only</option><option value="landscape">Landscape only</option></select></label><label>Fitting <select id="social-fit"><option value="contain">Fit entire image</option><option value="cover">Fill frame (center crop)</option></select></label><label>Background <input id="social-background" type="color" value="#ffffff" /></label><label>Format <select id="social-format"><option value="jpeg">JPEG (quality 90)</option><option value="png">PNG</option></select></label>',
  async run({ file, output, signal, progress }) {
    const { image, release } = await decodeSource(file); const entries: Array<{ blob: Blob; filename: string }> = [], format = value("social-format"), sizes = socialSizes.filter(size => value("social-pack") === "all" || size.name === value("social-pack"));
    try { for (const size of sizes) { signal.throwIfAborted(); progress(`Preparing ${size.name}…`); const c = fittedImage(image, image.naturalWidth, image.naturalHeight, size.width, size.height, value("social-fit") === "cover", value("social-background")); try { entries.push({ blob: await canvasBlob(c, `image/${format}`, .9), filename: `${size.name}-${size.width}x${size.height}.${format === "jpeg" ? "jpg" : "png"}` }); } finally { c.width = c.height = 0; } await yieldFrame(); }
      const zip = await createArchive(entries); signal.throwIfAborted(); sizes.forEach(size => paragraph(output, `${size.name}: ${size.width} × ${size.height}px`)); download(output, zip, "social-images.zip");
    } finally { release(); }
  },
};
