import { imageTools } from "./tools/registry";
export function mountToolbox(source: (result: boolean) => File | null, files: (result: boolean) => File[]) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("toolbox-dialog"), select = el<HTMLSelectElement>("toolbox-kind"), output = el("toolbox-output");
  const sourceSelect = el<HTMLSelectElement>("toolbox-source");
  let stepSource: File | null = null;
  const stepOption = new Option("Previous toolbox step", "step"); stepOption.disabled = true; sourceSelect.append(stepOption);
  let controller = new AbortController();
  const groups = new Map<string, HTMLOptGroupElement>();
  for (const [key, tool] of Object.entries(imageTools)) {
    const name = tool.group ?? "Inspect & export";
    if (!groups.has(name)) { const group = document.createElement("optgroup"); group.label = name; groups.set(name, group); }
    groups.get(name)!.append(new Option(tool.title, key));
  }
  select.replaceChildren(...groups.values());
  function clear() { controller.abort(); for (const canvas of Array.from(output.querySelectorAll("canvas"))) canvas.width = canvas.height = 0; output.replaceChildren(); el("toolbox-status").textContent = ""; el<HTMLButtonElement>("toolbox-run").disabled = false; }
  function choose() { clear(); const tool = imageTools[select.value]!; el("toolbox-description").textContent = tool.description; el("toolbox-controls").innerHTML = tool.controls; }
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
      progress: text => { if (!signal.aborted) el("toolbox-status").textContent = text; } }); if (!signal.aborted) el("toolbox-status").textContent = `${tool.title} ready.`; }
    catch (error) { if (!signal.aborted) { output.replaceChildren(); el("toolbox-status").textContent = (error as Error).message; } }
    finally { if (!signal.aborted) el<HTMLButtonElement>("toolbox-run").disabled = false; }
  };
}
