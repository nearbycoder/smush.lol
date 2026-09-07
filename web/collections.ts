import { canvasBlob, decodeSource } from "./local-image";
import { sheetLayout } from "./collection-layout";
import { downloadBlob } from "./archive";
export interface CollectionEntry { file: File; name: string }
export function mountCollections(sources: (results: boolean) => CollectionEntry[], notify: (text: string, error?: boolean) => void) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("collection-dialog"), list = el<HTMLOListElement>("collection-list");
  let entries: CollectionEntry[] = [], controller = new AbortController(), working = false, output: Blob | null = null, filename = "", previewUrl = "";
  function invalidate() { output = null; el<HTMLButtonElement>("collection-download").disabled = true; if (previewUrl) URL.revokeObjectURL(previewUrl); previewUrl = ""; el<HTMLImageElement>("collection-preview").removeAttribute("src"); el("collection-preview").hidden = true; }
  function render() {
    list.replaceChildren(...entries.map((entry, index) => {
      const row = document.createElement("li"), label = document.createElement("span"); label.textContent = entry.name; row.append(label);
      for (const [name, delta] of [["Up", -1], ["Down", 1], ["Remove", 0]] as const) {
        const button = document.createElement("button"); button.type = "button"; button.className = "small-button"; button.textContent = name; button.setAttribute("aria-label", `${name} ${entry.name}`);
        button.disabled = working || (delta !== 0 && !entries[index + delta]);
        button.onclick = () => { if (delta) [entries[index], entries[index + delta]] = [entries[index + delta]!, entries[index]!]; else entries.splice(index, 1); invalidate(); render(); }; row.append(button);
      }
      return row;
    }));
    el("collection-status").textContent = `${entries.length} images selected. Order below is export order.`;
  }
  function reload() { invalidate(); entries = sources(el<HTMLSelectElement>("collection-source").value === "results"); render(); }
  el("collection-open").addEventListener("click", () => { reload(); dialog.showModal(); });
  el("collection-source").addEventListener("change", reload);
  el("collection-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { controller.abort(); invalidate(); });
  el("collection-cancel").addEventListener("click", () => { controller.abort(); });
  for (const input of Array.from(dialog.querySelectorAll("input, select"))) input.addEventListener("change", invalidate);
  function busy(value: boolean) {
    working = value;
    for (const input of Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) input.disabled = value;
    el<HTMLButtonElement>("collection-sheet").disabled = el<HTMLButtonElement>("collection-pdf").disabled = value;
    el("collection-cancel").hidden = !value; render();
  }
  async function generate(kind: "sheet" | "pdf") {
    if (working) return;
    if (!entries.length) { notify("Add images to the queue, or choose a source with available images.", true); return; }
    controller = new AbortController(); const signal = controller.signal;
    const snapshot = [...entries], labels = el<HTMLInputElement>("sheet-labels").checked;
    invalidate(); busy(true);
    try {
      if (kind === "sheet") {
        const layout = sheetLayout(snapshot.length, Number(el<HTMLInputElement>("sheet-width").value), Number(el<HTMLInputElement>("sheet-columns").value), labels);
        const canvas = document.createElement("canvas"); canvas.width = layout.width; canvas.height = layout.height;
        try {
          const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (const [index, entry] of snapshot.entries()) {
            signal.throwIfAborted(); el("collection-status").textContent = `Drawing image ${index + 1} of ${snapshot.length}…`;
            const { image, release } = await decodeSource(entry.file);
            try {
              const x = layout.gap + (index % layout.columns) * (layout.cell + layout.gap), y = layout.gap + Math.floor(index / layout.columns) * (layout.cell + layout.labelHeight + layout.gap);
              const scale = Math.min(layout.cell / image.naturalWidth, layout.cell / image.naturalHeight);
              const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
              ctx.drawImage(image, x + (layout.cell - w) / 2, y + (layout.cell - h) / 2, w, h);
              if (labels) {
                ctx.fillStyle = "#25271e"; ctx.font = "14px sans-serif"; ctx.textBaseline = "top";
                let text = entry.name; while (text.length && ctx.measureText(text).width > layout.cell - 4) text = text.slice(0, -1);
                ctx.fillText(text === entry.name ? text : text.slice(0, -1) + "…", x + 2, y + layout.cell + 8);
              }
            } finally { release(); }
            await new Promise(resolve => setTimeout(resolve, 0));
          }
          signal.throwIfAborted(); output = await canvasBlob(canvas); filename = "contact-sheet.png";
        } finally { canvas.width = canvas.height = 0; }
      } else {
        async function* pages() {
          for (const [index, entry] of snapshot.entries()) {
            signal.throwIfAborted(); el("collection-status").textContent = `Preparing page ${index + 1} of ${snapshot.length}…`;
            const { image, release } = await decodeSource(entry.file);
            const canvas = document.createElement("canvas");
            try {
              const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight)); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
              yield { bytes: new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()), width: image.naturalWidth, height: image.naturalHeight };
            } finally { release(); canvas.width = canvas.height = 0; }
          }
        }
        const { imagesPdf } = await import("./pdf-export");
        output = await imagesPdf(pages(), el<HTMLSelectElement>("pdf-paper").value, el<HTMLInputElement>("pdf-landscape").checked, Number(el<HTMLInputElement>("pdf-margin").value), signal);
        filename = "smushed-images.pdf";
      }
      signal.throwIfAborted();
      el<HTMLButtonElement>("collection-download").disabled = false;
      if (kind === "sheet") { previewUrl = URL.createObjectURL(output!); el<HTMLImageElement>("collection-preview").src = previewUrl; el("collection-preview").hidden = false; }
      busy(false); el("collection-status").textContent = `${filename} ready · ${Math.ceil(output!.size / 1024)} KB${kind === "pdf" ? ` · ${snapshot.length} pages` : ""}`;
    } catch (error) { invalidate(); busy(false); el("collection-status").textContent = signal.aborted ? "Export cancelled." : (error as Error).message; }
  }
  el("collection-sheet").addEventListener("click", () => { void generate("sheet"); });
  el("collection-pdf").addEventListener("click", () => { void generate("pdf"); });
  el("collection-download").addEventListener("click", () => { if (output) downloadBlob(output, filename); });
}
