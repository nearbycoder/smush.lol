// Run on the built app: agent-browser --session smush-tools eval --stdin < tests/browser/studio.js
(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const el = id => document.getElementById(id);
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  const until = async (check, message) => { const end = Date.now() + 15000; while (!check()) { if (Date.now() > end) throw new Error(message); await tick(); } };
  const select = (id, value) => { el(id).value = value; el(id).dispatchEvent(new Event("change", { bubbles: true })); };
  const input = (id, value) => { el(id).value = String(value); el(id).dispatchEvent(new Event("input", { bubbles: true })); };
  const source = document.createElement("canvas"); source.width = 64; source.height = 48;
  const ctx = source.getContext("2d"), gradient = ctx.createLinearGradient(0, 0, 64, 48);
  gradient.addColorStop(0, "#ff0000"); gradient.addColorStop(1, "#00ff00"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, 64, 48);
  ctx.clearRect(0, 0, 4, 4); ctx.fillStyle = "#123456"; ctx.fillRect(10, 10, 4, 4);
  const png = await new Promise(resolve => source.toBlob(resolve));
  const transfer = new DataTransfer(); transfer.items.add(new File([png], "studio-fixture.png", { type: "image/png" }));
  el("file-input").files = transfer.files; el("file-input").dispatchEvent(new Event("change", { bubbles: true }));
  await until(() => el("source-name").textContent.includes("studio-fixture"), "Source did not load");
  el("toolbox-open").click(); await tick();
  const keys = Array.from(el("toolbox-kind").options).map(option => option.value).filter(key => key.startsWith("studio-"));
  assert(keys.length === 20, "Expected 20 new tools");
  assert(el("toolbox-kind").querySelectorAll("optgroup").length === 5, "Tools should be grouped");
  const fetchOriginal = window.fetch, requests = [], downloads = [];
  const createURL = URL.createObjectURL, revokeURL = URL.revokeObjectURL, anchorClick = HTMLAnchorElement.prototype.click;
  const blobs = new Map();
  window.fetch = (...args) => { requests.push(String(args[0])); return fetchOriginal(...args); };
  URL.createObjectURL = blob => { const url = createURL(blob); blobs.set(url, blob); return url; };
  URL.revokeObjectURL = url => { blobs.delete(url); revokeURL(url); };
  HTMLAnchorElement.prototype.click = function () { if (this.download) downloads.push({ name: this.download, blob: blobs.get(this.href) }); else anchorClick.call(this); };
  const run = async () => {
    el("toolbox-run").click();
    await until(() => !el("toolbox-run").disabled, "Tool timed out");
    assert(el("toolbox-status").textContent.endsWith(" ready."), el("toolbox-status").textContent);
    return el("toolbox-output").querySelectorAll("canvas")[1];
  };
  try {
    const results = [];
    for (const key of keys) {
      select("toolbox-kind", key); await tick();
      const after = await run();
      assert(after && after.width > 0 && after.height > 0, `${key}: missing output`);
      const before = el("toolbox-output").querySelector("canvas");
      assert(before.width === 64 && before.height === 48, `${key}: source resized unexpectedly`);
      if (!["studio-straighten", "studio-reflection", "studio-pattern", "studio-shadow"].includes(key)) assert(after.width === 64 && after.height === 48, `${key}: pixels resized unexpectedly`);
      el("toolbox-output").querySelector("button").click();
      const download = downloads.at(-1);
      assert(download.name.endsWith(`-${key.slice(7)}.png`) && download.blob.type === "image/png", `${key}: incorrect download`);
      const decoded = await createImageBitmap(download.blob);
      assert(decoded.width === after.width && decoded.height === after.height, `${key}: PNG dimensions differ`); decoded.close();
      results.push({ tool: key, width: after.width, height: after.height, bytes: download.blob.size });
    }
    select("toolbox-kind", "studio-pattern"); select("studio-mirror", "yes"); const pattern = await run();
    const color = (canvas, x, y) => [...canvas.getContext("2d").getImageData(x, y, 1, 1).data].join(",");
    assert(color(pattern, 10, 10) === color(pattern, 117, 10), "Alternate tiles should mirror horizontally");
    assert(color(pattern, 10, 10) === color(pattern, 10, 85), "Alternate tiles should mirror vertically");
    select("toolbox-kind", "studio-reflection"); input("studio-gap", 0); input("studio-opacity", 100); input("studio-fade", 0);
    const reflection = await run(); assert(color(reflection, 10, 10) === color(reflection, 10, 85), "Reflection did not flip below source");
    select("toolbox-kind", "studio-shadow"); input("studio-blur", 0); input("studio-x", -10); input("studio-y", 0); input("studio-opacity", 100);
    const shadow = await run(); assert(color(shadow, 20, 10) === color(source, 10, 10), "Signed shadow offset moved source incorrectly");
    assert(color(shadow, 0, 10) === "0,0,0,255", "Shadow did not render outside original image");
    select("toolbox-kind", "studio-opacity"); input("studio-amount", 50); const half = await run();
    assert(half.getContext("2d").getImageData(10, 10, 1, 1).data[3] === 128, "Opacity should be half");
    Array.from(el("toolbox-output").querySelectorAll("button")).find(button => button.textContent.includes("next toolbox")).click();
    assert(el("toolbox-source").value === "step", "Result did not become next source");
    select("toolbox-kind", "studio-opacity"); input("studio-amount", 50); const quarter = await run();
    assert(quarter.getContext("2d").getImageData(10, 10, 1, 1).data[3] === 64, "Second step did not use first result");
    select("toolbox-source", "source"); await run();
    assert(el("toolbox-output").querySelectorAll("canvas")[1].getContext("2d").getImageData(10, 10, 1, 1).data[3] === 128, "Chaining changed original source");
    select("toolbox-kind", "studio-levels"); input("studio-black", 220); input("studio-white", 100); el("toolbox-run").click(); await tick();
    assert(el("toolbox-status").textContent.includes("black point"), "Invalid levels did not explain error");
    assert(!el("toolbox-output").childElementCount && !el("toolbox-run").disabled, "Error left stale result or blocked controls");
    select("toolbox-kind", "studio-gamma"); el("toolbox-run").click(); el("toolbox-cancel").click(); await tick();
    assert(!el("toolbox-output").childElementCount && !el("toolbox-run").disabled, "Cancel left stale result");
    const OriginalWorker = window.Worker; let terminated = false;
    window.Worker = class extends OriginalWorker {
      constructor(...args) { super(...args); queueMicrotask(() => el("toolbox-cancel").click()); }
      terminate() { terminated = true; super.terminate(); }
    };
    try {
      el("toolbox-run").click(); await until(() => terminated, "Cancel did not terminate the active worker");
      assert(!el("toolbox-output").childElementCount && !el("toolbox-run").disabled, "Active worker published a cancelled result");
    } finally { window.Worker = OriginalWorker; }
    await run(); input("studio-gamma", 1.5);
    assert(!el("toolbox-output").childElementCount, "Changing input left a stale downloadable result");
    assert(!requests.some(url => /\/api\//.test(url)), "Toolbox sent image bytes to server");
    assert(document.documentElement.scrollWidth <= innerWidth, "Page overflows viewport");
    assert(el("toolbox-dialog").scrollWidth <= el("toolbox-dialog").clientWidth, "Dialog overflows viewport");
    el("toolbox-close").click(); await tick();
    assert(el("toolbox-source").value === "source" && el("toolbox-source").querySelector('[value="step"]').disabled, "Closing did not release temporary source");
    el("toolbox-open").click(); select("toolbox-kind", "studio-reflection"); await run();
    return { status: "passed", viewport: innerWidth, tools: results, downloads: downloads.length, chaining: "passed", cancellation: "passed", imageAPIRequests: requests.filter(url => /\/api\//.test(url)).length };
  } finally { window.fetch = fetchOriginal; URL.createObjectURL = createURL; URL.revokeObjectURL = revokeURL; HTMLAnchorElement.prototype.click = anchorClick; source.width = source.height = 0; }
})()
