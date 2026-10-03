import { copyImage } from "../clipboard";
import { decodeSource } from "../local-image";
import { downloadBlob } from "../archive";
export interface ToolContext { file: File; files: File[]; other: File | null; signal: AbortSignal; output: HTMLElement; progress: (text: string) => void; useResult?: (file: File) => void }
export interface ImageTool { title: string; group?: string; description: string; controls: string; run: (context: ToolContext) => Promise<void> }
export const value = (id: string) => (document.getElementById(id) as HTMLInputElement).value;
export function number(id: string, min: number, max: number) { const n = Number(value(id)); if (!Number.isFinite(n) || n < min || n > max) throw new Error(`Choose a value from ${min} to ${max}.`); return n; }
export async function sourceCanvas(file: File, maxEdge = 4096): Promise<HTMLCanvasElement> {
  const { image, release } = await decodeSource(file);
  try { const c = document.createElement("canvas"), scale = Math.min(1, maxEdge / Math.max(image.naturalWidth, image.naturalHeight)); c.width = Math.max(1, Math.round(image.naturalWidth * scale)); c.height = Math.max(1, Math.round(image.naturalHeight * scale)); c.getContext("2d")!.drawImage(image, 0, 0, c.width, c.height); return c; } finally { release(); }
}
export function paragraph(parent: HTMLElement, text: string) { const p = document.createElement("p"); p.textContent = text; parent.append(p); return p; }
export function download(parent: HTMLElement, blob: Blob, filename: string) {
  const actions = document.createElement("div"); actions.className = "tool-result-actions";
  const button = document.createElement("button"); button.type = "button"; button.className = "creative-action";
  button.textContent = `Download ${filename}`; button.onclick = () => downloadBlob(blob, filename); actions.append(button);
  if (blob.type === "image/png") {
    const copy = document.createElement("button"); copy.type = "button"; copy.className = "small-button"; copy.textContent = "Copy image";
    const status = document.createElement("span"); status.className = "tool-copy-status"; status.setAttribute("role", "status");
    copy.onclick = async () => {
      copy.disabled = true;
      try { await copyImage(blob); status.textContent = "Image copied."; }
      catch (error) { status.textContent = error instanceof Error ? error.message : "Could not copy image."; }
      finally { copy.disabled = false; }
    };
    actions.append(copy, status);
  }
  parent.append(actions);
}
export const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));
