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
export function download(parent: HTMLElement, blob: Blob, filename: string) { const b = document.createElement("button"); b.type = "button"; b.className = "creative-action"; b.textContent = `Download ${filename}`; b.onclick = () => downloadBlob(blob, filename); parent.append(b); }
export const yieldFrame = () => new Promise(resolve => setTimeout(resolve, 0));
