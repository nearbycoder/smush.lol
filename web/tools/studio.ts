import { canvasBlob, decodeSource } from "../local-image";
import { runPixelTask } from "../pixel-effects";
import { studioCanvas } from "./studio-canvas";
import { studioLayout } from "./studio-layout";
import { studioSize, studioSpecs, validateStudio, type StudioControl, type StudioKind, type StudioSpec } from "./studio-settings";
import { download, paragraph, value, yieldFrame, type ImageTool } from "./shared";

function controlsHTML(controls: StudioControl[]) {
  return controls.map(control => {
    const id = `studio-${control.key}`;
    if (control.kind === "select") return `<label>${control.label}<select id="${id}">${Object.entries(control.options).map(([key, label]) => `<option value="${key}"${key === control.initial ? " selected" : ""}>${label}</option>`).join("")}</select></label>`;
    return `<label>${control.label}<input id="${id}" type="${control.kind}" value="${control.initial}"${control.kind === "number" ? ` min="${control.min}" max="${control.max}" step="${control.step}"` : ""} /></label>`;
  }).join("");
}
function createStudioTool(kind: StudioKind, spec: StudioSpec): ImageTool {
  return {
    title: spec.title, group: spec.group,
    description: `${spec.description} Full resolution, up to 12 MP and 12,000px per side. Runs locally; download a PNG or use it in the next toolbox step.`,
    controls: controlsHTML(spec.controls),
    async run({ file, output, signal, progress, useResult }) {
      const fields = validateStudio(kind, Object.fromEntries(spec.controls.map(control => [control.key, value(`studio-${control.key}`)])));
      const source = await decodeSource(file);
      const before = document.createElement("canvas"); let after: HTMLCanvasElement | undefined;
      try {
        signal.throwIfAborted();
        const { width, height } = studioSize(source.image.naturalWidth, source.image.naturalHeight);
        // Check expanded geometry before allocating either raster.
        if (spec.geometry) studioLayout(width, height, kind, fields);
        before.width = width; before.height = height; before.getContext("2d")!.drawImage(source.image, 0, 0);
        progress(`Applying ${spec.title.toLowerCase()} to ${width}×${height} pixels…`);
        await yieldFrame(); signal.throwIfAborted();
        if (spec.geometry) after = studioCanvas(before, kind, fields);
        else {
          const pixels = before.getContext("2d")!.getImageData(0, 0, width, height);
          const result = await runPixelTask(pixels, fields, signal, `studio:${kind}`);
          after = document.createElement("canvas"); after.width = width; after.height = height;
          after.getContext("2d")!.putImageData(result.pixels, 0, 0);
        }
        signal.throwIfAborted();
        const png = await canvasBlob(after); signal.throwIfAborted();
        const figures = document.createElement("div"); figures.className = "studio-comparison";
        for (const [label, canvas] of [["Before", before], [spec.title, after]] as const) {
          const figure = document.createElement("figure"), caption = document.createElement("figcaption");
          caption.textContent = `${label} · ${canvas.width}×${canvas.height}`; canvas.setAttribute("aria-label", caption.textContent);
          figure.append(canvas, caption); figures.append(figure);
        }
        output.append(figures);
        paragraph(output, `${after.width}×${after.height} · PNG · ${(png.size / 1024).toFixed(1)} KB. Transparency is shown on a checkerboard. Toolbox changes are separate from editor recipes and batch settings.`);
        const name = file.name.replace(/\.[^.]+$/, "").replace(/[^a-z\d_-]+/gi, "-").slice(0, 80) || "image";
        const filename = `${name}-${kind}.png`;
        download(output, png, filename);
        if (useResult) {
          const button = document.createElement("button"); button.type = "button"; button.className = "small-button";
          button.textContent = "Use result in next toolbox step";
          button.onclick = () => useResult(new File([png], filename, { type: "image/png" })); output.append(button);
        }
      } finally {
        source.release();
        for (const canvas of [before, after]) if (canvas && !output.contains(canvas)) canvas.width = canvas.height = 0;
      }
    },
  };
}
export const studioTools: Record<string, ImageTool> = Object.fromEntries(Object.entries(studioSpecs).map(([key, spec]) => [`studio-${key}`, createStudioTool(key as StudioKind, spec)]));
