import { readToolboxPreferences, recordToolUse, toggleFavorite, toolboxPreferencesKey } from "./toolbox-preferences";
import { imageTools } from "./tools/registry";
export function mountToolbox(source: (result: boolean) => File | null, files: (result: boolean) => File[]) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("toolbox-dialog"), select = el<HTMLSelectElement>("toolbox-kind"), output = el("toolbox-output");
  const sourceSelect = el<HTMLSelectElement>("toolbox-source");
  let stepSource: File | null = null;
  const stepOption = new Option("Previous toolbox step", "step"); stepOption.disabled = true; sourceSelect.append(stepOption);
  let controller = new AbortController();
  const search = el<HTMLInputElement>("toolbox-search"), category = el<HTMLSelectElement>("toolbox-category"), library = el("toolbox-library");
  const favorite = el<HTMLButtonElement>("toolbox-favorite");
  let saved: string | null = null;
  try { saved = localStorage.getItem(toolboxPreferencesKey); } catch { /* Tools remain available when storage is blocked. */ }
  let preferences = readToolboxPreferences(saved, Object.keys(imageTools));
  function savePreferences() { try { localStorage.setItem(toolboxPreferencesKey, JSON.stringify(preferences)); } catch { /* Preferences last for this visit. */ } }
  function renderLibrary() {
    const query = search.value.trim().toLowerCase(), filter = category.value;
    let entries = Object.entries(imageTools);
    if (filter === "recent") entries = preferences.recent.flatMap(key => imageTools[key] ? [[key, imageTools[key]!] as const] : []);
    entries = entries.filter(([key, tool]) => (!query || `${tool.title} ${tool.group ?? "Inspect & export"} ${tool.description}`.toLowerCase().includes(query)) &&
      (filter === "all" || filter === "recent" || (filter === "favorites" ? preferences.favorites.includes(key) : (tool.group ?? "Inspect & export") === filter)));
    library.replaceChildren(...entries.map(([key, tool]) => {
      const button = document.createElement("button"); button.type = "button"; button.className = "tool-library-item";
      button.dataset.tool = key; button.setAttribute("aria-pressed", String(key === select.value));
      const title = document.createElement("strong"), group = document.createElement("small");
      title.textContent = `${preferences.favorites.includes(key) ? "★ " : ""}${tool.title}`; group.textContent = tool.group ?? "Inspect & export";
      button.append(title, group);
      button.onclick = () => {
        select.value = key; select.dispatchEvent(new Event("change", { bubbles: true }));
        library.querySelector<HTMLButtonElement>(`[data-tool="${key}"]`)?.focus({ preventScroll: true });
      };
      return button;
    }));
    el("toolbox-count").textContent = `${entries.length} ${entries.length === 1 ? "tool" : "tools"}`;
    el("toolbox-no-tools").hidden = entries.length > 0;
    el("toolbox-clear-search").hidden = !query && filter === "all";
    const isFavorite = preferences.favorites.includes(select.value);
    favorite.setAttribute("aria-pressed", String(isFavorite)); favorite.textContent = isFavorite ? "★ Favorited" : "☆ Favorite";
    favorite.setAttribute("aria-label", `${isFavorite ? "Remove" : "Add"} ${imageTools[select.value]?.title ?? "tool"} ${isFavorite ? "from" : "to"} favorites`);
  }
  search.oninput = renderLibrary; category.onchange = renderLibrary;
  favorite.onclick = () => { preferences = toggleFavorite(preferences, select.value); savePreferences(); renderLibrary(); };
  el("toolbox-clear-search").onclick = () => { search.value = ""; category.value = "all"; category.dispatchEvent(new Event("change", { bubbles: true })); search.focus(); };
  el("toolbox-reset").onclick = () => { choose(); el("toolbox-status").textContent = "Tool controls reset to defaults."; };
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const [key, tool] of Object.entries(imageTools)) {
    const name = tool.group ?? "Inspect & export";
    if (!groups.has(name)) { const group = document.createElement("optgroup"); group.label = name; groups.set(name, group); }
    groups.get(name)!.append(new Option(tool.title, key));
  }
  select.replaceChildren(...groups.values());
  for (const name of groups.keys()) category.append(new Option(name, name));
  function clear() { controller.abort(); for (const canvas of Array.from(output.querySelectorAll("canvas"))) canvas.width = canvas.height = 0; output.replaceChildren(); el("toolbox-status").textContent = ""; el<HTMLButtonElement>("toolbox-run").disabled = false; }
  function choose() {
    clear(); const tool = imageTools[select.value]!; renderLibrary();
    const selectedTool = library.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (selectedTool) library.scrollTop = Math.max(0, selectedTool.offsetTop + selectedTool.offsetHeight - library.clientHeight);
    const [summary, ...details] = tool.description.split(/(?<=\.)\s+/);
    el("toolbox-summary").textContent = summary!;
    el("toolbox-description").textContent = details.join(" ");
    const help = dialog.querySelector<HTMLDetailsElement>(".toolbox-help")!; help.hidden = !details.length; help.open = false;
    el("toolbox-controls").innerHTML = tool.controls;
  }
  select.onchange = choose;
  el("toolbox-controls").addEventListener("change", clear);
  el("toolbox-controls").addEventListener("input", clear);
  el("toolbox-source").addEventListener("change", clear);
  el("toolbox-open").onclick = () => { choose(); dialog.showModal(); };
  el("toolbox-close").onclick = () => dialog.close(); dialog.addEventListener("close", () => { clear(); stepSource = null; stepOption.disabled = true; if (sourceSelect.value === "step") { sourceSelect.value = "source"; sourceSelect.dispatchEvent(new Event("change", { bubbles: true })); } });
  el("toolbox-cancel").onclick = clear;
  el("toolbox-run").onclick = async () => {
    clear(); controller = new AbortController(); const signal = controller.signal;
    const step = sourceSelect.value === "step", result = sourceSelect.value === "result", file = step ? stepSource : source(result) ?? files(result)[0];
    if (!file) { el("toolbox-status").textContent = "Choose an image or create an export first."; return; }
    const tool = imageTools[select.value]!;
    el<HTMLButtonElement>("toolbox-run").disabled = true; el("toolbox-status").textContent = "Working locally…";
    try { await tool.run({ file, files: step ? [file] : files(result), other: step ? null : source(!result), signal, output,
      useResult: file => { if (signal.aborted) return; stepSource = file; stepOption.disabled = false; stepOption.textContent = `Previous step: ${file.name}`; sourceSelect.value = "step"; sourceSelect.dispatchEvent(new Event("change", { bubbles: true })); el("toolbox-status").textContent = "Result selected. Choose another tool, then run it. Closing the toolbox clears this temporary image."; },
      progress: text => { if (!signal.aborted) el("toolbox-status").textContent = text; } }); if (!signal.aborted) {
        preferences = recordToolUse(preferences, select.value); savePreferences(); renderLibrary();
        el("toolbox-status").textContent = `${tool.title} ready.`;
      } }
    catch (error) { if (!signal.aborted) { output.replaceChildren(); el("toolbox-status").textContent = (error as Error).message; } }
    finally { if (!signal.aborted) el<HTMLButtonElement>("toolbox-run").disabled = false; }
  };
}
