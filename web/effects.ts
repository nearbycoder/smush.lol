import { effectSettings, redactions } from "./effect-settings";
export async function paintEffects(canvas: HTMLCanvasElement, fields: Record<string, string>, signal: AbortSignal): Promise<void> {
  const values = effectSettings(fields);
  const ctx = canvas.getContext("2d")!;
  for (const region of redactions(values.redactions)) {
    const x = Math.floor(region.x * canvas.width), y = Math.floor(region.y * canvas.height);
    const width = Math.ceil(region.width * canvas.width), height = Math.ceil(region.height * canvas.height);
    if (region.mode === "black") { ctx.fillStyle = "#000000"; ctx.fillRect(x, y, width, height); }
    else {
      const copy = document.createElement("canvas"); copy.width = width; copy.height = height;
      const c = copy.getContext("2d")!; c.drawImage(canvas, x, y, width, height, 0, 0, width, height);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip(); ctx.filter = `blur(${Math.max(8, Math.min(width, height) / 8)}px)`;
      ctx.drawImage(copy, x, y); ctx.restore(); copy.width = copy.height = 0;
    }
  }
  let logo: HTMLImageElement | null = null;
  if (fields.watermarkLogo) {
    if (!/^data:image\/png;base64,/.test(fields.watermarkLogo) || fields.watermarkLogo.length > 750000) throw new Error("Re-add a logo under 500 KB.");
    logo = new Image(); logo.src = fields.watermarkLogo; await logo.decode(); signal.throwIfAborted();
  }
  const text = values.watermarkText!.trim();
  if (!text && !logo) return;
  ctx.save();
  try {
    ctx.globalAlpha = Number(values.watermarkOpacity) / 100;
    const maxWidth = canvas.width * Number(values.watermarkSize) / 100;
    let w = maxWidth, h: number;
    if (logo) { h = w * logo.naturalHeight / logo.naturalWidth; if (h > canvas.height * .8) { w *= canvas.height * .8 / h; h = canvas.height * .8; } }
    else { let font = Math.max(8, canvas.width * .04); ctx.font = `bold ${font}px sans-serif`; font *= Math.min(1, maxWidth / ctx.measureText(text).width); ctx.font = `bold ${font}px sans-serif`; w = ctx.measureText(text).width; h = font * 1.2; }
    const pad = Math.min(canvas.width, canvas.height) * .03;
    const pos = values.watermarkPosition!;
    const x = pos === "center" ? (canvas.width - w) / 2 : pos.endsWith("left") ? pad : canvas.width - w - pad;
    const y = pos === "center" ? (canvas.height - h) / 2 : pos.startsWith("top") ? pad : canvas.height - h - pad;
    if (logo) ctx.drawImage(logo, x, y, w, h);
    else { ctx.fillStyle = values.watermarkColor!; ctx.textBaseline = "top"; ctx.fillText(text, x, y); }
  } finally { ctx.restore(); logo?.removeAttribute("src"); }
}
