import { canvasBlob, decodeSource } from "./local-image";
import { pdfLayout, sheetLayout } from "./collection-layout";
import { downloadBlob } from "./archive";
export interface CollectionEntry { file: File; name: string }
export function mountCollections(sources: (results: boolean) => CollectionEntry[], notify: (text: string, error?: boolean) => void) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("collection-dialog"), list = el<HTMLOListElement>("collection-list"), preview = el<HTMLImageElement>("collection-preview");
  const mode = () => dialog.querySelector<HTMLInputElement>('[name="collection-format"]:checked')!.value as "sheet" | "pdf";
  let entries: CollectionEntry[] = [], controller = new AbortController(), working = false, output: Blob | null = null, filename = "", previewUrl = "", version = 0;
  const thumbnails = new Map<File, string>();
  function status(text: string, error = false) { el("collection-status").textContent = text; el("collection-status").classList.toggle("is-error", error); }
  function actions() {
    const sheet = mode() === "sheet";
    el<HTMLButtonElement>("collection-sheet").disabled = el<HTMLButtonElement>("collection-pdf").disabled = working || !entries.length;
    el("collection-sheet").hidden = !sheet || Boolean(output) || working;
    el("collection-pdf").hidden = sheet || Boolean(output) || working;
    el<HTMLButtonElement>("collection-download").disabled = !output || working;
    el("collection-download").hidden = !output || working;
    el("collection-download").textContent = sheet ? "Download PNG" : "Download PDF";
    el("collection-cancel").hidden = !working;
    el("collection-empty-title").textContent = working ? "Putting it all together…" : "Your images, together";
    el("collection-empty-copy").textContent = working ? "Your export is being generated on this device." : sheet ? "Create a contact sheet to preview your layout here." : "Create a PDF to preview its first page here.";
    el("collection-preview-kind").textContent = sheet ? "PNG contact sheet" : "Multi-page PDF";
    el("collection-stage")?.setAttribute("aria-busy", String(working));
  }
  function invalidate() {
    output = null;
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = ""; preview.removeAttribute("src"); preview.hidden = true;
    el("collection-empty").hidden = false;
    el("collection-preview-caption").textContent = "Generated on your device. Your images stay private.";
    actions();
  }
  function render() {
    for (const [file, url] of thumbnails) if (!entries.some(entry => entry.file === file)) { URL.revokeObjectURL(url); thumbnails.delete(file); }
    list.replaceChildren(...entries.map((entry, index) => {
      const row = document.createElement("li"), thumb = document.createElement("img"), copy = document.createElement("div"), label = document.createElement("strong"), detail = document.createElement("small"), buttons = document.createElement("div");
      if (!thumbnails.has(entry.file)) thumbnails.set(entry.file, URL.createObjectURL(entry.file));
      thumb.src = thumbnails.get(entry.file)!; thumb.alt = ""; thumb.width = thumb.height = 48; thumb.loading = "lazy"; thumb.decoding = "async"; thumb.className = "collection-thumb";
      thumb.addEventListener("error", () => { thumb.hidden = true; });
      copy.className = "collection-file"; label.textContent = entry.name; label.title = entry.name;
      detail.textContent = `${index + 1} of ${entries.length} · ${Math.max(1, Math.ceil(entry.file.size / 1024))} KB`; copy.append(label, detail); buttons.className = "collection-row-actions";
      for (const [name, symbol, delta] of [["Move up", "↑", -1], ["Move down", "↓", 1], ["Remove", "×", 0]] as const) {
        const button = document.createElement("button"); button.type = "button"; button.className = "icon-action"; button.textContent = symbol; button.title = name; button.setAttribute("aria-label", `${name}: ${entry.name}`);
        button.disabled = working || (delta !== 0 && !entries[index + delta]);
        button.onclick = () => {
          if (delta) [entries[index], entries[index + delta]] = [entries[index + delta]!, entries[index]!]; else entries.splice(index, 1);
          invalidate(); render(); status(delta ? "Image order updated." : "Image removed from this export.");
          const next = list.children[Math.max(0, Math.min(entries.length - 1, index + delta))];
          (next?.querySelector<HTMLButtonElement>("button:not(:disabled)") ?? el<HTMLButtonElement>(mode() === "sheet" ? "collection-sheet" : "collection-pdf")).focus();
        }; buttons.append(button);
      }
      row.append(thumb, copy, buttons); return row;
    }));
    el("collection-count").textContent = String(entries.length);
    el("collection-no-images").hidden = entries.length > 0;
    list.hidden = !entries.length; actions();
  }
  function reload() { entries = sources(el<HTMLSelectElement>("collection-source").value === "results"); invalidate(); render(); status(entries.length ? `${entries.length} ${entries.length === 1 ? "image" : "images"} ready to arrange` : "Choose images to get started."); }
  function updateMode() {
    el("sheet-settings").hidden = mode() !== "sheet"; el("pdf-settings").hidden = mode() !== "pdf";
    invalidate(); status(entries.length ? "Settings ready. Create your preview." : "Choose images to get started.");
  }
  function pageControls() { el<HTMLInputElement>("pdf-landscape").disabled = working || el<HTMLSelectElement>("pdf-paper").value === "image"; }
  el("collection-open").addEventListener("click", () => {
    const source = el<HTMLSelectElement>("collection-source");
    if (source.value === "results" && !sources(true).length && sources(false).length) source.value = "sources";
    reload(); pageControls(); dialog.showModal();
  });
  el("collection-source").addEventListener("change", reload);
  el("collection-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    version++; controller.abort(); working = false; invalidate();
    for (const url of thumbnails.values()) URL.revokeObjectURL(url); thumbnails.clear(); list.replaceChildren(); entries = [];
    for (const input of Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) input.disabled = false;
  });
  el("collection-cancel").addEventListener("click", () => controller.abort());
  for (const input of Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) {
    if (input.id === "collection-source") continue;
    if (input.name === "collection-format") input.addEventListener("change", updateMode);
    else input.addEventListener("input", () => { invalidate(); pageControls(); status("Settings changed. Create a new preview."); });
  }
  function busy(value: boolean) {
    working = value;
    for (const input of Array.from(dialog.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select"))) input.disabled = value;
    pageControls(); render();
  }
  async function generate(kind: "sheet" | "pdf") {
    if (working) return;
    if (!entries.length) { notify("Add images to the queue, or choose a source with available images.", true); return; }
    const panel = el(kind === "sheet" ? "sheet-settings" : "pdf-settings");
    for (const field of Array.from(panel.querySelectorAll<HTMLInputElement>("input"))) if (!field.reportValidity()) return;
    controller = new AbortController(); const signal = controller.signal, current = ++version;
    const snapshot = [...entries], labels = el<HTMLInputElement>("sheet-labels").checked;
    const paper = el<HTMLSelectElement>("pdf-paper").value, landscape = el<HTMLInputElement>("pdf-landscape").checked, margin = Number(el<HTMLInputElement>("pdf-margin").value);
    let generated: Blob, previewBlob: Blob | undefined;
    invalidate(); busy(true);
    try {
      if (kind === "sheet") {
        const layout = sheetLayout(snapshot.length, Number(el<HTMLInputElement>("sheet-width").value), Number(el<HTMLSelectElement>("sheet-columns").value), labels);
        const canvas = document.createElement("canvas"); canvas.width = layout.width; canvas.height = layout.height;
        try {
          const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
          for (const [index, entry] of snapshot.entries()) {
            signal.throwIfAborted(); status(`Drawing image ${index + 1} of ${snapshot.length}…`);
            const { image, release } = await decodeSource(entry.file);
            try {
              signal.throwIfAborted();
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
          signal.throwIfAborted(); generated = await canvasBlob(canvas); previewBlob = generated;
        } finally { canvas.width = canvas.height = 0; }
      } else {
        async function* pages() {
          for (const [index, entry] of snapshot.entries()) {
            signal.throwIfAborted(); status(`Preparing page ${index + 1} of ${snapshot.length}…`);
            const { image, release } = await decodeSource(entry.file);
            const canvas = document.createElement("canvas");
            try {
              signal.throwIfAborted();
              if (index === 0) {
                const layout = pdfLayout(image.naturalWidth, image.naturalHeight, paper, landscape, margin), scale = 900 / Math.max(layout.pageWidth, layout.pageHeight);
                canvas.width = Math.ceil(layout.pageWidth * scale); canvas.height = Math.ceil(layout.pageHeight * scale);
                const ctx = canvas.getContext("2d")!; ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, layout.x * scale, (layout.pageHeight - layout.y - layout.height) * scale, layout.width * scale, layout.height * scale);
                previewBlob = await canvasBlob(canvas);
              }
              const scale = Math.min(1, 2400 / Math.max(image.naturalWidth, image.naturalHeight)); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
              canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
              yield { bytes: new Uint8Array(await (await canvasBlob(canvas)).arrayBuffer()), width: image.naturalWidth, height: image.naturalHeight };
            } finally { release(); canvas.width = canvas.height = 0; }
          }
        }
        const { imagesPdf } = await import("./pdf-export");
        generated = await imagesPdf(pages(), paper, landscape, margin, signal);
      }
      signal.throwIfAborted(); if (current !== version) return;
      output = generated; filename = kind === "sheet" ? "contact-sheet.png" : "smushed-images.pdf";
      previewUrl = URL.createObjectURL(previewBlob!); preview.src = previewUrl; preview.alt = kind === "sheet" ? "Generated contact sheet" : "First page of the generated PDF"; preview.hidden = false; el("collection-empty").hidden = true;
      el("collection-preview-caption").textContent = kind === "sheet" ? `${snapshot.length} images · ${el<HTMLInputElement>("sheet-width").value}px wide · PNG` : `Page 1 of ${snapshot.length} · ${paper === "image" ? "Image-sized pages" : paper === "letter" ? "US Letter" : "A4"}`;
      busy(false); status(`${filename} ready · ${Math.ceil(output.size / 1024)} KB`);
      if (matchMedia("(max-width: 760px)").matches) el("collection-stage").scrollIntoView({ behavior: "instant", block: "center" });
    } catch (error) {
      if (current !== version) return;
      invalidate(); busy(false); status(signal.aborted ? "Export cancelled. Your images are still here." : (error as Error).message, !signal.aborted);
    }
  }
  el("collection-sheet").addEventListener("click", () => { void generate("sheet"); });
  el("collection-pdf").addEventListener("click", () => { void generate("pdf"); });
  el("collection-download").addEventListener("click", () => { if (output) downloadBlob(output, filename); });
}
