import { downloadBlob } from "./archive";
export interface MetadataRow { group: string; name: string; value: string }
/** Render descriptions only; omit binary thumbnails, maker data and raw XML. */
export function metadataRows(tags: Record<string, unknown>): MetadataRow[] {
  const rows: MetadataRow[] = [];
  for (const [group, entries] of Object.entries(tags)) {
    if (!entries || typeof entries !== "object" || ["Thumbnail", "errors"].includes(group)) continue;
    for (const [name, tag] of Object.entries(entries)) {
      if (rows.length >= 300) return rows;
      if (/_raw|thumbnail|makernote/i.test(name)) continue;
      const value = tag && typeof tag === "object" ? (tag as { description?: unknown }).description : tag;
      if (typeof value !== "string" && typeof value !== "number" && typeof value !== "boolean") continue;
      rows.push({ group, name, value: String(value).slice(0, 500) });
    }
  }
  return rows;
}
export function mountMetadata(source: (result: boolean) => File | null) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("metadata-dialog"), table = el<HTMLTableSectionElement>("metadata-body");
  let version = 0, exported: MetadataRow[] = [];
  async function inspect() {
    const current = ++version, file = source(el<HTMLSelectElement>("metadata-source").value === "result");
    table.replaceChildren(); exported = []; el<HTMLButtonElement>("metadata-download").disabled = true;
    if (!file) { el("metadata-status").textContent = "Choose an image or create an export first."; return; }
    el("metadata-status").textContent = `Reading ${file.name} locally…`;
    try {
      const { load } = await import("exifreader");
      const tags = await load(await file.arrayBuffer(), { expanded: true, async: true });
      if (current !== version) return;
      exported = [{ group: "File", name: "Name", value: file.name }, { group: "File", name: "Bytes", value: String(file.size) }, ...metadataRows(tags as unknown as Record<string, unknown>)];
      for (const row of exported) {
        const tr = document.createElement("tr"), label = document.createElement("th"), value = document.createElement("td"); label.scope = "row"; label.textContent = `${row.group} · ${row.name}`; value.textContent = row.value; tr.append(label, value); table.append(tr);
      }
      const hasGps = exported.some(row => /gps/i.test(row.group) || /gps/i.test(row.name));
      el("metadata-status").textContent = `${exported.length - 2} readable tags${hasGps ? " · Location metadata present" : " · No readable location tags found"}. Camera, orientation, color profiles and GPS appear below when present.`;
      el<HTMLButtonElement>("metadata-download").disabled = false;
    } catch (error) { if (current === version) el("metadata-status").textContent = `Metadata unavailable for this image: ${error instanceof Error ? error.message : "unsupported or malformed metadata"}.`; }
  }
  el("metadata-open").addEventListener("click", () => { dialog.showModal(); void inspect(); });
  el("metadata-source").addEventListener("change", () => { void inspect(); });
  el("metadata-close").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => { version++; table.replaceChildren(); exported = []; });
  el("metadata-download").addEventListener("click", () => { if (exported.length) downloadBlob(new Blob([JSON.stringify(exported, null, 2)], { type: "application/json" }), "image-metadata.json"); });
  return { sourceChanged() { version++; dialog.close(); } };
}
