import { usesBrowser, localResponse } from "./local-image";
import { prepareImage } from "./prepare-image";
export type ExportFields = Record<string, string>;
export interface ExportResult { blob: Blob; filename: string }
export interface QueueJob {
  id: number;
  name: string;
  suffix?: string;
  file: File;
  fields?: ExportFields;
  status: "ready" | "queued" | "processing" | "done" | "error" | "cancelled";
  result?: ExportResult;
  error?: string;
  controller?: AbortController;
}
export const MAX_QUEUE_FILES = 50;
export const MAX_QUEUE_BYTES = 150 * 1024 * 1024;
export type Processor = (file: File, fields: ExportFields, signal: AbortSignal) => Promise<ExportResult>;

export class ConversionQueue {
  jobs: QueueJob[] = [];
  private nextId = 1;
  private running: Promise<void> | null = null;
  constructor(private process: Processor, private changed: () => void = () => {}) {}

  add(files: File[], fields?: ExportFields, label?: string): void {
    this.addMany(files.map(file => ({ file, fields, label })));
  }

  addMany(entries: Array<{ file: File; fields?: ExportFields; label?: string }>): void {
    if (this.jobs.length + entries.length > MAX_QUEUE_FILES) throw new Error("Keep the queue to 50 exports or fewer.");
    const bytes = [...this.jobs.map(job => job.file), ...entries.map(entry => entry.file)].reduce((sum, file) => sum + file.size, 0);
    if (bytes > MAX_QUEUE_BYTES) throw new Error("Keep queued source images under 150 MB total.");
    for (const { file, fields, label } of entries) this.jobs.push({
      id: this.nextId++, name: label ? `${file.name} · ${label}` : file.name, file,
      suffix: label?.replace(/[^a-zA-Z0-9_-]/g, "-"),
      fields: fields ? { ...fields } : undefined, status: "ready",
    });
    this.changed();
  }

  get canReorder(): boolean { return !this.running && !this.jobs.some(job => ["queued", "processing"].includes(job.status)); }

  move(id: number, direction: -1 | 1): boolean {
    if (!this.canReorder) return false;
    const index = this.jobs.findIndex(job => job.id === id), target = index + direction;
    if (index < 0 || target < 0 || target >= this.jobs.length) return false;
    [this.jobs[index], this.jobs[target]] = [this.jobs[target]!, this.jobs[index]!];
    this.changed(); return true;
  }

  sort(order: string): boolean {
    if (!this.canReorder || !["added", "name-asc", "name-desc", "size-asc", "size-desc"].includes(order)) return false;
    const sign = order.endsWith("desc") ? -1 : 1;
    this.jobs.sort((a, b) => (order === "added" ? a.id-b.id : order.startsWith("size") ? (a.file.size-b.file.size)*sign : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })*sign) || a.id-b.id);
    this.changed(); return true;
  }

  start(fields: ExportFields): Promise<void> {
    for (const job of this.jobs) if (job.status === "ready") {
      job.fields ??= { ...fields };
      job.status = "queued";
    }
    this.changed();
    return this.drain();
  }

  retry(id: number): Promise<void> {
    const job = this.jobs.find(job => job.id === id);
    if (job && (job.status === "error" || job.status === "cancelled")) {
      job.status = job.fields ? "queued" : "ready";
      job.error = undefined;
      this.changed();
    }
    return this.drain();
  }

  cancel(id: number): void {
    const job = this.jobs.find(job => job.id === id);
    if (!job || !["ready", "queued", "processing"].includes(job.status)) return;
    job.controller?.abort();
    job.status = "cancelled";
    this.changed();
  }

  cancelAll(): void {
    for (const job of this.jobs) this.cancel(job.id);
  }

  remove(id: number): void {
    this.cancel(id);
    this.jobs = this.jobs.filter(job => job.id !== id);
    this.changed();
  }

  clear(): void {
    this.cancelAll();
    this.jobs = [];
    this.changed();
  }

  private drain(): Promise<void> {
    if (this.running) return this.running;
    this.running = this.work().finally(() => { this.running = null; this.changed(); });
    return this.running;
  }

  private async work(): Promise<void> {
    let job: QueueJob | undefined;
    while ((job = this.jobs.find(job => job.status === "queued"))) {
      const controller = new AbortController();
      job.controller = controller;
      job.status = "processing";
      this.changed();
      try {
        const result = await this.process(job.file, { ...job.fields }, controller.signal);
        if (controller.signal.aborted || !this.jobs.includes(job)) continue;
        const total = this.jobs.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0);
        if (total + result.blob.size > MAX_QUEUE_BYTES) throw new Error("Results exceed 150 MB. Download and remove completed items, then retry.");
        if (job.suffix) {
          const dot = result.filename.lastIndexOf(".");
          result.filename = dot > 0 ? `${result.filename.slice(0, dot)}-${job.suffix}${result.filename.slice(dot)}` : `${result.filename}-${job.suffix}`;
        }
        job.result = result;
        job.status = "done";
      } catch (error) {
        if (!controller.signal.aborted) {
          job.status = "error";
          job.error = error instanceof Error ? error.message : "Conversion failed.";
        }
      } finally {
        job.controller = undefined;
        this.changed();
      }
    }
  }
}

export function formFields(form: HTMLFormElement): ExportFields {
  return Object.fromEntries(Array.from(new FormData(form).entries())
    .filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

export async function convertFile(file: File, fields: ExportFields, signal: AbortSignal): Promise<ExportResult> {
  if (usesBrowser(file, fields)) {
    const response = await localResponse(file, fields, signal);
    return { blob: await response.blob(), filename: response.headers.get("content-disposition")!.match(/filename="([^"]+)"/)![1]! };
  }
  file = await prepareImage(file, fields, signal);
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set("image", file, file.name);
  const response = await fetch("/api/smush", { method: "POST", body, signal });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? "The image could not be converted.");
  }
  return {
    blob: await response.blob(),
    filename: response.headers.get("content-disposition")?.match(/filename="([^"]+)"/)?.[1] ?? "smushed-image.webp",
  };
}
