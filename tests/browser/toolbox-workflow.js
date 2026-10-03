// Run with agent-browser eval --stdin on the built app after loading an image.
(async () => {
  const el = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 20));
  const until = async (check, message) => { const end = Date.now() + 15000; while (!check()) { if (Date.now() > end) throw new Error(message); await tick(); } };
  const select = (id, value) => { el(id).value = value; el(id).dispatchEvent(new Event("change", { bubbles: true })); };
  const search = value => { el("toolbox-search").value = value; el("toolbox-search").dispatchEvent(new Event("input", { bubbles: true })); };
  const items = () => [...el("toolbox-library").querySelectorAll("button")];
  if (!el("toolbox-dialog").open) el("toolbox-open").click();
  select("toolbox-category", "all"); search("auto levels");
  assert(items().length === 1 && items()[0].dataset.tool === "studio-autoLevels", "Search did not find auto levels");
  items()[0].click();
  assert(el("toolbox-kind").value === "studio-autoLevels", "Library did not select a tool");
  assert(document.activeElement?.dataset.tool === "studio-autoLevels", "Tool selection lost keyboard focus");
  search("no-such-tool-987"); assert(items().length === 0 && !el("toolbox-no-tools").hidden, "Missing empty search feedback");
  el("toolbox-clear-search").click(); assert(items().length === 43 && el("toolbox-category").value === "all", "Clear filters did not restore library");
  select("toolbox-category", "Photo corrections"); assert(items().length === 9, "Category filter included unrelated tools");
  if (el("toolbox-favorite").getAttribute("aria-pressed") !== "true") el("toolbox-favorite").click();
  select("toolbox-category", "favorites"); assert(items().some(button => button.dataset.tool === "studio-autoLevels"), "Favorites filter missing selected tool");
  el("toolbox-favorite").click(); assert(!items().some(button => button.dataset.tool === "studio-autoLevels"), "Unfavorite left stale library");
  el("toolbox-favorite").click();
  el("studio-clip").value = "3"; el("studio-clip").dispatchEvent(new Event("input", { bubbles: true }));
  el("toolbox-reset").click(); assert(el("studio-clip").value === "1", "Reset did not restore tool defaults");
  const run = async () => {
    el("toolbox-run").click(); await until(() => !el("toolbox-run").disabled, "Run timed out");
    assert(el("toolbox-status").textContent.endsWith(" ready."), el("toolbox-status").textContent);
  };
  await run(); select("toolbox-category", "recent");
  assert(items()[0].dataset.tool === "studio-autoLevels", "Recent tools not ordered by use");
  await run(); assert(items().filter(button => button.dataset.tool === "studio-autoLevels").length === 1, "Recent tools duplicated a repeated run");
  const saved = JSON.parse(localStorage.getItem("smush-toolbox-preferences-v1"));
  assert(saved.favorites.includes("studio-autoLevels") && saved.recent[0] === "studio-autoLevels", "Preferences not persisted");
  assert(Object.keys(saved).join(",") === "favorites,recent", "Preferences saved image data or fields");
  const copy = el("toolbox-output").querySelector('.tool-result-actions .small-button');
  assert(copy?.textContent === "Copy image", "PNG result missing copy action");
  const clipboard = navigator.clipboard, descriptor = clipboard && Object.getOwnPropertyDescriptor(clipboard, "write");
  let bytes = 0;
  if (clipboard && typeof ClipboardItem !== "undefined") {
    Object.defineProperty(clipboard, "write", { configurable: true, value: async items => {
      const blob = await items[0].getType("image/png"); const decoded = await createImageBitmap(blob); bytes = blob.size; decoded.close();
    }});
    try {
      copy.click(); await until(() => !copy.disabled, "Copy did not finish");
      assert(bytes > 0 && el("toolbox-output").querySelector('.tool-copy-status').textContent === "Image copied.", "Copy did not write a valid PNG");
      Object.defineProperty(clipboard, "write", { configurable: true, value: async () => { throw new Error("Clipboard blocked for test"); }});
      copy.click(); await until(() => !copy.disabled, "Failed copy did not release button");
      assert(el("toolbox-output").querySelector('.tool-copy-status').textContent === "Clipboard blocked for test", "Clipboard failure missing feedback");
    } finally {
      if (descriptor) Object.defineProperty(clipboard, "write", descriptor); else delete clipboard.write;
    }
  } else {
    copy.click(); await until(() => !copy.disabled, "Unavailable clipboard did not release button");
    assert(el("toolbox-output").querySelector('.tool-copy-status').textContent.includes("unavailable"), "Unsupported clipboard missing download fallback");
  }
  el("toolbox-reset").click(); assert(!el("toolbox-output").childElementCount, "Reset retained a stale downloadable result");
  await run(); select("toolbox-category", "favorites");
  assert(document.documentElement.scrollWidth <= innerWidth, "Page overflows viewport");
  assert(el("toolbox-dialog").scrollWidth <= el("toolbox-dialog").clientWidth, "Toolbox overflows viewport");
  return { status: "passed", viewport: innerWidth, search: true, categories: true, favorites: true, recent: true, reset: true, clipboardPNGBytes: bytes, clipboardFailure: true };
})()
