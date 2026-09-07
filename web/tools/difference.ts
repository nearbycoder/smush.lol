import { imageDifference } from "./difference-math";
import { decodeSource, canvasBlob } from "../local-image";
import { paragraph, download, number, value, yieldFrame, type ImageTool } from "./shared";
export const differenceTool: ImageTool = {
  title: "Image difference heatmap",
  description: "Compare the selected image with its original/export counterpart or another local file. Metrics use a sample up to 1024px and premultiplied RGBA; hidden RGB values are ignored. These are pixel differences, not a perceptual quality score.",
  controls: `<label>Optional comparison image <input id="diff-file" type="file" accept="image/*" /></label>
    <label>Alignment <select id="diff-alignment"><option value="strict">Require matching dimensions</option><option value="stretch">Stretch comparison to reference</option></select></label>
    <label>Changed-pixel threshold (0–255) <input id="diff-threshold" type="number" min="0" max="255" value="8" /></label>
    <label>Heatmap amplification <select id="diff-gain"><option value="1">1×</option><option value="4" selected>4×</option><option value="16">16×</option></select></label>`,
  async run({ file, other, signal, output, progress }) {
    const comparison = (document.getElementById("diff-file") as HTMLInputElement).files?.[0] ?? other;
    if (!comparison) throw new Error("Create an export first, or choose a comparison image above.");
    if (comparison.size > 15*1024*1024) throw new Error("Choose a comparison image under 15 MB.");
    const threshold = number("diff-threshold",0,255), gain = number("diff-gain",1,16), alignment = value("diff-alignment");
    const reference = await decodeSource(file); let second: Awaited<ReturnType<typeof decodeSource>> | undefined;
    const canvases: HTMLCanvasElement[] = [];
    try {
      signal.throwIfAborted(); second = await decodeSource(comparison); signal.throwIfAborted();
      const a = reference.image, b = second.image;
      if (alignment === "strict" && (a.naturalWidth !== b.naturalWidth || a.naturalHeight !== b.naturalHeight)) throw new Error(`Dimensions differ (${a.naturalWidth}×${a.naturalHeight} vs ${b.naturalWidth}×${b.naturalHeight}). Choose stretch alignment or use matching images.`);
      const scale = Math.min(1,1024/Math.max(a.naturalWidth,a.naturalHeight)), width = Math.max(1,Math.round(a.naturalWidth*scale)), height = Math.max(1,Math.round(a.naturalHeight*scale));
      const make = () => { const c=document.createElement("canvas");c.width=width;c.height=height;canvases.push(c);return c; };
      const left=make(), right=make(), heat=make();
      left.getContext("2d")!.drawImage(a,0,0,width,height); right.getContext("2d")!.drawImage(b,0,0,width,height);
      progress("Comparing sampled pixels…"); await yieldFrame(); signal.throwIfAborted();
      const { heat: pixels, ...metrics } = imageDifference(left.getContext("2d")!.getImageData(0,0,width,height).data, right.getContext("2d")!.getImageData(0,0,width,height).data, threshold,gain);
      heat.getContext("2d")!.putImageData(new ImageData(pixels,width,height),0,0);
      const png = await canvasBlob(heat); signal.throwIfAborted();
      const images=document.createElement("div");images.className="difference-images";
      for (const [index,label] of ["Reference","Comparison",`Difference (${gain}×)`].entries()) {
        const figure=document.createElement("figure"),caption=document.createElement("figcaption");caption.textContent=label;
        canvases[index]!.setAttribute("aria-label",label);figure.append(canvases[index]!,caption);images.append(figure);
      }
      output.append(images);
      paragraph(output,`${metrics.changedPercent.toFixed(2)}% changed (${metrics.changedPixels.toLocaleString()} of ${metrics.pixels.toLocaleString()} pixels above threshold ${threshold}). Mean absolute RGBA error: ${metrics.meanAbsoluteError.toFixed(2)} / 255; peak channel difference: ${metrics.maxChannelDelta.toFixed(2)}.`);
      paragraph(output,`Sample: ${width}×${height}. Black means identical; red through yellow shows increasing difference. Amplification changes only the heatmap, not metrics. ${alignment === "stretch" ? "Comparison was stretched to the reference; alignment and resizing affect these metrics." : "Image dimensions match."}`);
      download(output,png,"difference-heatmap.png");
      const report={version:1,reference:{name:file.name,width:a.naturalWidth,height:a.naturalHeight},comparison:{name:comparison.name,width:b.naturalWidth,height:b.naturalHeight},sample:{width,height},alignment,threshold,gain,metric:"premultiplied RGBA channel differences on a browser-resampled sample",...metrics};
      download(output,new Blob([JSON.stringify(report,null,2)],{type:"application/json"}),"difference-report.json");
    } finally { reference.release();second?.release();for(const c of canvases)if(!output.contains(c))c.width=c.height=0; }
  },
};
