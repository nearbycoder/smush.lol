import { renderImage, decodeSource, canvasBlob } from "./local-image";
import { paintEffects } from "./effects";
import { redactions, type Redaction } from "./effect-settings";
import { formFields } from "./queue";
export function mountEffects(form: HTMLFormElement, source: () => File | null, notify: (text: string, error?: boolean) => void) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const field = (name: string) => form.querySelector<HTMLInputElement>(`[name="${name}"]`)!;
  const dialog = el<HTMLDialogElement>("redact-dialog");
  const canvas = el<HTMLCanvasElement>("redact-canvas");
  let base: HTMLCanvasElement | null = null, draft: Redaction[] = [], controller = new AbortController();
  let origin: { x: number; y: number } | null = null;
  async function draw() {
    if (!base) return;
    canvas.width = base.width; canvas.height = base.height;
    canvas.getContext("2d")!.drawImage(base, 0, 0);
    await paintEffects(canvas, { redactions: JSON.stringify(draft) }, controller.signal);
    el("redact-count").textContent = `${draft.length} regions · Applied after crop, rotation and resize. Queue images use the same relative regions.`;
  }
  el("redact-open").addEventListener("click", async () => {
    const file = source(); if (!file) { notify("Choose an image first."); return; }
    controller.abort(); controller = new AbortController(); const signal = controller.signal;
    try {
      base = await renderImage(file, { ...formFields(form), removeBackground: "false", redactions: "[]", watermarkText: "", watermarkLogo: "", width: "1000", height: "650", fit: "inside", withoutEnlargement: "true" }, signal);
      if (signal.aborted || source() !== file) return;
      draft = redactions(field("redactions").value); await draw(); dialog.showModal();
    } catch (error) { if (!signal.aborted) notify((error as Error).message, true); }
  });
  const point = (event: PointerEvent) => { const bounds = canvas.getBoundingClientRect(); return { x: Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)), y: Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)) }; };
  canvas.addEventListener("pointerdown", event => { origin = point(event); canvas.setPointerCapture(event.pointerId); });
  canvas.addEventListener("pointerup", event => {
    if (!origin) return;
    const end = point(event), start = origin; origin = null;
    add({ x: Math.min(start.x, end.x), y: Math.min(start.y, end.y), width: Math.abs(start.x - end.x), height: Math.abs(start.y - end.y), mode: el<HTMLSelectElement>("redact-mode").value as "black" | "blur" });
  });
  canvas.addEventListener("pointercancel", () => { origin = null; });
  function add(region: Redaction) {
    if (region.width < .002 || region.height < .002) return;
    try { draft = redactions(JSON.stringify([...draft, region])); void draw(); }
    catch (error) { notify((error as Error).message, true); }
  }
  el("redact-add").addEventListener("click", () => add({ x: Number(el<HTMLInputElement>("redact-x").value) / 100, y: Number(el<HTMLInputElement>("redact-y").value) / 100, width: Number(el<HTMLInputElement>("redact-w").value) / 100, height: Number(el<HTMLInputElement>("redact-h").value) / 100, mode: el<HTMLSelectElement>("redact-mode").value as "black" | "blur" }));
  el("redact-undo").addEventListener("click", () => { draft.pop(); void draw(); });
  el("redact-clear").addEventListener("click", () => { draft = []; void draw(); });
  el("redact-cancel").addEventListener("click", () => dialog.close());
  el("redact-apply").addEventListener("click", () => { field("redactions").value = JSON.stringify(draft); field("redactions").dispatchEvent(new Event("change", { bubbles: true })); dialog.close(); notify(`${draft.length} redaction regions applied. Convert to see the result.`); });
  dialog.addEventListener("close", () => { controller.abort(); if (base) base.width = base.height = 0; base = null; canvas.width = canvas.height = 0; });
  el<HTMLInputElement>("watermark-upload").addEventListener("change", async event => {
    const file = (event.target as HTMLInputElement).files?.[0]; if (!file) return;
    try {
      if (file.size > 500 * 1024) throw new Error("Choose a logo under 500 KB.");
      const { image, release } = await decodeSource(file);
      const logo = document.createElement("canvas");
      try {
        const scale = Math.min(1, 1024 / Math.max(image.naturalWidth, image.naturalHeight)); logo.width = Math.max(1, Math.round(image.naturalWidth * scale)); logo.height = Math.max(1, Math.round(image.naturalHeight * scale)); logo.getContext("2d")!.drawImage(image, 0, 0, logo.width, logo.height);
        const blob = await canvasBlob(logo); if (blob.size > 500 * 1024) throw new Error("The prepared logo exceeds 500 KB. Use a smaller logo.");
        field("watermarkLogo").value = logo.toDataURL("image/png"); field("watermarkLogo").dispatchEvent(new Event("change", { bubbles: true }));
        el("watermark-logo-note").textContent = `Logo: ${file.name}. Logo takes precedence over text. Logos are not saved in recipes.`;
      } finally { release(); logo.width = logo.height = 0; }
    } catch (error) { notify((error as Error).message, true); }
  });
  el("watermark-remove").addEventListener("click", () => { field("watermarkLogo").value = ""; field("watermarkLogo").dispatchEvent(new Event("change", { bubbles: true })); el<HTMLInputElement>("watermark-upload").value = ""; el("watermark-logo-note").textContent = "No logo. Text is used when no logo is selected."; });
  return { sourceChanged() { controller.abort(); dialog.close(); } };
}
