import { studioSize, validateStudio, type StudioKind, type StudioValues } from "./studio-settings";

export function studioLayout(width: number, height: number, kind: StudioKind, fields: StudioValues) {
  studioSize(width, height);
  const f = validateStudio(kind, fields);
  let w = width, h = height, x = 0, y = 0;
  if (kind === "straighten" && f.canvas === "expand") {
    const angle = Number(f.angle) * Math.PI / 180;
    w = Math.ceil(Math.abs(width * Math.cos(angle)) + Math.abs(height * Math.sin(angle)));
    h = Math.ceil(Math.abs(height * Math.cos(angle)) + Math.abs(width * Math.sin(angle)));
  } else if (kind === "reflection") {
    if (f.direction === "right") w = width * 2 + Number(f.gap);
    else h = height * 2 + Number(f.gap);
  } else if (kind === "pattern") { w *= Number(f.columns); h *= Number(f.rows); }
  else if (kind === "shadow") {
    const padding = Math.ceil(Number(f.blur) * 3), dx = Number(f.x), dy = Number(f.y);
    x = padding + Math.max(0, -dx); y = padding + Math.max(0, -dy);
    w += padding * 2 + Math.abs(dx); h += padding * 2 + Math.abs(dy);
  }
  return { ...studioSize(w, h), x, y };
}
