import { decodeSource, canvasBlob } from "../local-image";
import { createArchive } from "../archive";
import { fitRect } from "./pack-image";
import { number, paragraph, download, yieldFrame, type ImageTool } from "./shared";
export function spriteLayout(count: number, columns: number, cell: number, gap: number) {
  if (!Number.isInteger(count) || count < 1 || count > 50 || !Number.isInteger(columns) || columns < 1 || columns > 10 || !Number.isInteger(cell) || cell < 16 || cell > 1024 || !Number.isInteger(gap) || gap < 0 || gap > 64) throw new Error("Use up to 50 images, 1–10 columns, 16–1024px cells and 0–64px spacing.");
  columns = Math.min(count, columns); const width = columns * (cell + gap) + gap, height = Math.ceil(count / columns) * (cell + gap) + gap;
  if (width > 12000 || height > 12000 || width * height > 48000000) throw new Error("Sprite sheet too large. Reduce cell size or adjust columns.");
  return { width, height, frames: Array.from({ length: count }, (_, i) => ({ x: gap + i % columns * (cell + gap), y: gap + Math.floor(i / columns) * (cell + gap), width: cell, height: cell })) };
}
export const spritesTool: ImageTool = {
  title: "Sprite sheet", description: "Combine queued sources or completed exports into a transparent PNG atlas, with CSS classes and a JSON map. Uses the current image when the queue is empty. Images fit within square cells without cropping.",
  controls: '<label>Columns <input id="sprite-columns" type="number" min="1" max="10" value="4" /></label><label>Cell size (px) <input id="sprite-cell" type="number" min="16" max="1024" value="256" /></label><label>Spacing (px) <input id="sprite-gap" type="number" min="0" max="64" value="2" /></label>',
  async run({ files, output, signal, progress }) {
    const cell = number("sprite-cell", 16, 1024), layout = spriteLayout(files.length, number("sprite-columns", 1, 10), cell, number("sprite-gap", 0, 64)); const canvas = document.createElement("canvas"); canvas.width = layout.width; canvas.height = layout.height;
    try { const ctx = canvas.getContext("2d")!;
      for (const [i, file] of files.entries()) { signal.throwIfAborted(); progress(`Drawing sprite ${i + 1} of ${files.length}…`); const { image, release } = await decodeSource(file); try { const frame = layout.frames[i]!, rect = fitRect(image.naturalWidth, image.naturalHeight, cell, cell, false); ctx.drawImage(image, frame.x + rect.x, frame.y + rect.y, rect.width, rect.height); } finally { release(); } await yieldFrame(); }
      const png = await canvasBlob(canvas); if (png.size > 100 * 1024 * 1024) throw new Error("Sprite PNG exceeds 100 MB. Use smaller cells.");
      const frames = layout.frames.map((frame, i) => ({ ...frame, name: files[i]!.name, className: `sprite-${i + 1}` }));
      const css = `.sprite { display: inline-block; width: ${cell}px; height: ${cell}px; background-image: url("sprites.png"); background-repeat: no-repeat; }\n` + frames.map(frame => `.sprite.${frame.className} { background-position: -${frame.x}px -${frame.y}px; }`).join("\n");
      const zip = await createArchive([{ filename: "sprites.png", blob: png }, { filename: "sprites.css", blob: new Blob([css], { type: "text/css" }) }, { filename: "sprites.json", blob: new Blob([JSON.stringify({ width: layout.width, height: layout.height, frames }, null, 2)], { type: "application/json" }) }]); signal.throwIfAborted();
      paragraph(output, `${frames.length} sprites · ${layout.width} × ${layout.height}px. Use class="sprite sprite-1", etc.; JSON maps each class to its source filename.`); download(output, zip, "sprite-sheet.zip");
    } finally { canvas.width = canvas.height = 0; }
  },
};
