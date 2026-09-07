import { copyImage } from "./clipboard";
import { ConversionQueue, convertFile, formFields, type Processor, type QueueJob } from "./queue";
import { createArchive, downloadBlob } from "./archive";

export function mountQueue(form: HTMLFormElement, notify: (message: string, error?: boolean) => void, process: Processor = convertFile) {
  const panel = document.querySelector<HTMLElement>("#queue-panel")!;
  const list = document.querySelector<HTMLOListElement>("#queue-list")!;
  const summary = document.querySelector<HTMLElement>("#queue-summary")!;
  const progress = document.querySelector<HTMLProgressElement>("#queue-progress")!;
  const start = document.querySelector<HTMLButtonElement>("#queue-start")!;
  const cancel = document.querySelector<HTMLButtonElement>("#queue-cancel")!;
  const archive = document.querySelector<HTMLButtonElement>("#queue-zip")!;
  const sort = document.querySelector<HTMLButtonElement>("#queue-sort")!;
  const order = document.querySelector<HTMLSelectElement>("#queue-order")!;
  let archiving = false;
  const queue = new ConversionQueue((file, fields, signal) => process(file, formFields(form).localOnly ? { ...fields, localOnly: "true" } : fields, signal), render);
  function render() {
    panel.hidden = queue.jobs.length === 0;
    const done = queue.jobs.filter(job => job.status === "done");
    const active = queue.jobs.some(job => job.status === "processing" || job.status === "queued");
    const failed = queue.jobs.filter(job => job.status === "error").length;
    summary.textContent = `${done.length} of ${queue.jobs.length} ready to download${failed ? ` · ${failed} failed` : ""}${active ? " · Converting…" : ""}`;
    progress.max = Math.max(1, queue.jobs.length);
    progress.value = queue.jobs.filter(job => ["done", "error", "cancelled"].includes(job.status)).length;
    start.disabled = !queue.jobs.some(job => job.status === "ready");
    cancel.disabled = !queue.jobs.some(job => ["ready", "queued", "processing"].includes(job.status));
    archive.disabled = !done.length || archiving;
    sort.disabled = order.disabled = !queue.canReorder || queue.jobs.length < 2;
    list.replaceChildren(...queue.jobs.map(row));
  }
  function row(job: QueueJob) {
    const item = document.createElement("li"); item.dataset.jobId = String(job.id); item.tabIndex = -1;
    const info = document.createElement("div");
    const name = document.createElement("strong");
    name.textContent = job.name;
    const status = document.createElement("small");
    const labels = { ready: "Ready to convert", queued: "Waiting", processing: "Converting…", done: "Done", error: "Failed", cancelled: "Cancelled" };
    status.textContent = job.error ?? `${labels[job.status]}${job.result ? ` · ${Math.ceil(job.result.blob.size / 1024)} KB` : ""}`;
    info.append(name, status);
    const actions = document.createElement("div");
    actions.className = "queue-item-actions";
    function action(label: string, run: () => void) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "small-button";
      button.textContent = label;
      button.setAttribute("aria-label", `${label} ${job.name}`);
      button.addEventListener("click", run);
      actions.append(button); return button;
    }
    for (const direction of [-1, 1] as const) {
      const button = action(direction === -1 ? "Move up" : "Move down", () => {
        if (queue.move(job.id, direction)) {
          list.querySelector<HTMLElement>(`[data-job-id="${job.id}"]`)?.focus();
          notify(`Moved ${job.name} to position ${queue.jobs.indexOf(job)+1}.`);
        }
      });
      const index = queue.jobs.indexOf(job);
      button.disabled = !queue.canReorder || index + direction < 0 || index + direction >= queue.jobs.length;
    }
    if (job.result) {
      action("Download", () => downloadBlob(job.result!.blob, job.result!.filename));
      action("Copy", () => { void copyImage(job.result!.blob).then(() => notify("Image copied as PNG."), () => notify("Could not copy the image. Allow clipboard access or download it instead.", true)); });
    }
    if (["ready", "queued", "processing"].includes(job.status)) action("Cancel", () => queue.cancel(job.id));
    if (["error", "cancelled"].includes(job.status)) action("Retry", () => { void queue.retry(job.id); });
    action("Remove", () => queue.remove(job.id));
    item.append(info, actions);
    return item;
  }
  start.addEventListener("click", () => {
    if (form.reportValidity()) void queue.start(formFields(form));
  });
  sort.addEventListener("click", () => { if (queue.sort(order.value)) notify("Queue order updated. Conversion and ZIP downloads use this order."); });
  cancel.addEventListener("click", () => queue.cancelAll());
  document.querySelector("#queue-clear")!.addEventListener("click", () => queue.clear());
  archive.addEventListener("click", async () => {
    archiving = true;
    archive.textContent = "Building ZIP…";
    const results = queue.jobs.flatMap(job => job.result ? [job.result] : []);
    render();
    try { downloadBlob(await createArchive(results), "smushed-images.zip"); }
    catch (error) { notify(error instanceof Error ? error.message : "ZIP download failed.", true); }
    finally { archiving = false; archive.textContent = "Download ZIP"; render(); }
  });
  render();
  return queue;
}
