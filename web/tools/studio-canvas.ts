import { studioLayout } from "./studio-layout";
import { validateStudio, type StudioKind, type StudioValues } from "./studio-settings";
export function studioCanvas(source: HTMLCanvasElement, kind: StudioKind, fields: StudioValues) {
  const f = validateStudio(kind, fields), { width, height, x, y } = studioLayout(source.width, source.height, kind, f);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  try {
    const ctx = canvas.getContext("2d")!;
    if (kind === "straighten") {
      ctx.translate(width / 2, height / 2); ctx.rotate(Number(f.angle) * Math.PI / 180);
      ctx.drawImage(source, -source.width / 2, -source.height / 2);
    } else if (kind === "pattern") {
      for (let row = 0; row < Number(f.rows); row++) for (let column = 0; column < Number(f.columns); column++) {
        const flipX = f.mirror === "yes" && column % 2 === 1, flipY = f.mirror === "yes" && row % 2 === 1;
        ctx.save(); ctx.translate((column + Number(flipX)) * source.width, (row + Number(flipY)) * source.height);
        ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1); ctx.drawImage(source, 0, 0); ctx.restore();
      }
    } else if (kind === "reflection") {
      const right = f.direction === "right", start = (right ? source.width : source.height) + Number(f.gap);
      ctx.save();
      ctx.translate(right ? start + source.width : 0, right ? 0 : start + source.height);
      ctx.scale(right ? -1 : 1, right ? 1 : -1); ctx.drawImage(source, 0, 0); ctx.restore();
      const gradient = ctx.createLinearGradient(right ? start : 0, right ? 0 : start, right ? width : 0, right ? 0 : height);
      const opacity = Number(f.opacity) / 100;
      gradient.addColorStop(0, `rgba(0,0,0,${opacity})`); gradient.addColorStop(1, `rgba(0,0,0,${opacity * (1 - Number(f.fade) / 100)})`);
      ctx.globalCompositeOperation = "destination-in"; ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over"; ctx.drawImage(source, 0, 0);
    } else if (kind === "shadow") {
      ctx.shadowColor = `${f.color}${Math.round(Number(f.opacity) / 100 * 255).toString(16).padStart(2, "0")}`;
      ctx.shadowBlur = Number(f.blur); ctx.shadowOffsetX = Number(f.x); ctx.shadowOffsetY = Number(f.y);
      ctx.drawImage(source, x, y);
    } else throw new Error("Unknown layout tool.");
    return canvas;
  } catch (error) { canvas.width = canvas.height = 0; throw error; }
}
