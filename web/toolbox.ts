import { imageTools } from "./tools/registry";
export function mountToolbox(source: (result: boolean) => File | null, files: (result: boolean) => File[]) {
  const el = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const dialog = el<HTMLDialogElement>("toolbox-dialog"), select = el<HTMLSelectElement>("toolbox-kind"), output = el("toolbox-output");
  let controller = new AbortController();
  select.replaceChildren(...Object.entries(imageTools).map(([key, tool]) => new Option(tool.title, key)));
  function clear() { controller.abort(); for (const canvas of Array.from(output.querySelectorAll("canvas"))) canvas.width = canvas.height = 0; output.replaceChildren(); el("toolbox-status").textContent = ""; el<HTMLButtonElement>("toolbox-run").disabled = false; }
  function choose() { clear(); const tool = imageTools[select.value as keyof typeof imageTools]; el("toolbox-description").textContent = tool.description; el("toolbox-controls").innerHTML = tool.controls; }
  select.onchange = choose;
  el("toolbox-controls").addEventListener("change", clear);
  el("toolbox-source").addEventListener("change", clear);
  el("toolbox-open").onclick = () => { choose(); dialog.showModal(); };
  el("toolbox-close").onclick = () => dialog.close(); dialog.addEventListener("close", clear);
  el("toolbox-cancel").onclick = clear;
  el("toolbox-run").onclick = async () => {
    clear(); controller = new AbortController(); const signal = controller.signal;
    const result = el<HTMLSelectElement>("toolbox-source").value === "result", file = source(result);
    if (!file) { el("toolbox-status").textContent = "Choose an image or create an export first."; return; }
    const tool = imageTools[select.value as keyof typeof imageTools];
    el<HTMLButtonElement>("toolbox-run").disabled = true; el("toolbox-status").textContent = "Working locally…";
    try { await tool.run({ file, files: files(result), other: source(!result), signal, output, progress: text => { if (!signal.aborted) el("toolbox-status").textContent = text; } }); if (!signal.aborted) el("toolbox-status").textContent = `${tool.title} ready.`; }
    catch (error) { if (!signal.aborted) { output.replaceChildren(); el("toolbox-status").textContent = (error as Error).message; } }
    finally { if (!signal.aborted) el<HTMLButtonElement>("toolbox-run").disabled = false; }
  };
}
