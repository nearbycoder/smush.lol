import { decodeSource, canvasBlob } from "../local-image";
import { createArchive } from "../archive";
import { number, paragraph, download, yieldFrame, type ImageTool } from "./shared";
export function tileRects(width: number, height: number, rows: number, columns: number) {
  if (![rows, columns].every(n => Number.isInteger(n) && n >= 1 && n <= 10) || rows > height || columns > width) throw new Error("Use 1–10 rows and columns, with at least one pixel per tile.");
  return Array.from({ length: rows * columns }, (_, i) => { const row = Math.floor(i / columns), col = i % columns, x = Math.floor(col * width / columns), y = Math.floor(row * height / rows); return { row: row + 1, column: col + 1, x, y, width: Math.floor((col + 1) * width / columns) - x, height: Math.floor((row + 1) * height / rows) - y }; });
}
export const tilesTool: ImageTool = {
  title: "Split image into tiles", description: "Split the full-resolution image into a grid of PNG files without losing edge pixels. ZIP includes positions and dimensions in tiles.json. Up to 100 tiles and 100 MB of encoded data.",
  controls: '<label>Rows <input id="tile-rows" type="number" min="1" max="10" value="2" /></label><label>Columns <input id="tile-columns" type="number" min="1" max="10" value="3" /></label>',
  async run({ file, signal, output, progress }) {
    const { image, release } = await decodeSource(file);
    try { const tiles = tileRects(image.naturalWidth, image.naturalHeight, number("tile-rows", 1, 10), number("tile-columns", 1, 10)); const entries: Array<{ blob: Blob; filename: string }> = []; let bytes = 0;
      for (const tile of tiles) { signal.throwIfAborted(); progress(`Drawing tile ${entries.length + 1} / ${tiles.length}…`); if (tile.width > 12000 || tile.height > 12000) throw new Error("Add rows/columns to keep each tile under 12,000px per side."); const c = document.createElement("canvas"); c.width = tile.width; c.height = tile.height;
        try { c.getContext("2d")!.drawImage(image, tile.x, tile.y, tile.width, tile.height, 0, 0, tile.width, tile.height); const blob = await canvasBlob(c); bytes += blob.size; if (bytes > 100 * 1024 * 1024) throw new Error("Tiles exceed 100 MB. Convert to a smaller image first."); entries.push({ blob, filename: `tile-r${tile.row}-c${tile.column}.png` }); } finally { c.width = c.height = 0; } await yieldFrame(); }
      entries.push({ filename: "tiles.json", blob: new Blob([JSON.stringify({ width: image.naturalWidth, height: image.naturalHeight, tiles }, null, 2)], { type: "application/json" }) }); const zip = await createArchive(entries); signal.throwIfAborted(); paragraph(output, `${tiles.length} PNG tiles ready. Remainder pixels are distributed across the grid, preserving the full image.`); download(output, zip, "image-tiles.zip");
    } finally { release(); }
  },
};
