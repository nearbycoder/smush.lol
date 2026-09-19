// Run on a fresh built app: agent-browser eval --stdin < tests/browser/simplified-editor.js
(async () => {
  const el = id => document.getElementById(id);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 50));
  const until = async predicate => {
    for (let attempt = 0; attempt < 100; attempt++) { if (predicate()) return; await tick(); }
    throw new Error("Timed out waiting for editor");
  };
  assert(!el("more-options").open && !el("size-options").open, "Optional settings should start collapsed");
  assert(!el("more-options").classList.contains("has-changes"), "Defaults should not show custom settings");
  assert(document.querySelectorAll('.format-tabs input[name="format"]').length === 4, "All formats should be discoverable together");
  assert(el("smush-button").getBoundingClientRect().top < el("more-options").getBoundingClientRect().top, "Conversion should precede advanced settings");

  let pickerOpened = false;
  const fileClick = event => { event.preventDefault(); pickerOpened = true; };
  el("file-input").addEventListener("click", fileClick);
  document.querySelector(".url-source > summary").click(); await tick();
  assert(document.querySelector(".url-source").open && !pickerOpened, "Opening URL input must not launch the file picker");
  el("browse-button").click(); assert(pickerOpened, "Choose images must open the file picker");
  el("file-input").removeEventListener("click", fileClick);

  el("more-options").open = true; el("advanced-options").open = true;
  document.querySelector('[data-rotation="90"]').click(); await tick();
  el("more-options").open = false;
  assert(el("more-options-summary").textContent.startsWith("1 custom setting"), "Hidden rotation must be visible in the summary");
  assert(!el("advanced-options").querySelector(".changed-settings").hidden, "Changed section must be marked");
  el("undo-settings").click(); await tick();
  assert(!el("more-options").classList.contains("has-changes"), "Undo should clear the change indicator");
  el("redo-settings").click(); await tick();
  assert(el("more-options").classList.contains("has-changes"), "Redo should restore the change indicator");
  el("reset-button").click(); await tick();
  assert(!el("more-options").classList.contains("has-changes"), "Reset should clear advanced changes");

  el("target-size").value = "0"; el("more-options").open = false; el("file-size-options").open = false;
  assert(!el("controls").reportValidity(), "Invalid size should block submission");
  assert(el("more-options").open && el("file-size-options").open, "Validation must reveal the invalid setting");
  el("reset-button").click(); el("more-options").open = false;
  el("width-input").value = "13000"; el("size-options").open = false;
  assert(!el("controls").reportValidity() && el("size-options").open, "Validation must reveal invalid dimensions");
  el("reset-button").click(); el("size-options").open = false;

  el("demo-button").click(); await until(() => !el("smush-button").disabled);
  document.querySelector('[data-export-preset="email"]').click(); await tick();
  assert(el("size-options-summary").textContent.includes("1200"), "Preset dimensions must stay visible while collapsed");
  el("smush-button").click(); await until(() => !el("result-bar").hidden && !el("smush-button").disabled);
  await el("preview-image").decode();
  const output = await (await fetch(el("preview-image").src)).blob();
  assert(output.type === "image/jpeg" && Math.abs(el("preview-image").naturalWidth - 1200) <= 1, "Email preset must produce a real resized JPEG");
  el("compare-tab").click(); assert(!el("comparison-controls").hidden, "Comparison must still work");

  // Privacy remains directly accessible; it should still use the local pipeline.
  el("local-only").click(); document.querySelector('[name="format"][value="png"]').click();
  el("smush-button").click(); await until(() => !el("smush-button").disabled);
  assert((await (await fetch(el("preview-image").src)).blob()).type === "image/png", "Local conversion must still produce PNG");
  el("more-options").open = true; el("multiple-exports").open = true;
  el("queue-exports").click(); await tick();
  assert(!el("queue-panel").hidden && el("queue-list").children.length === 4, "Multiple-size exports must still reach the queue");
  el("queue-clear").click();
  document.querySelector(".image-tools > summary").click();
  el("toolbox-open").click(); assert(el("toolbox-dialog").open, "Toolbox must remain accessible");
  el("toolbox-close").click();
  assert(document.documentElement.scrollWidth <= innerWidth, "Editor must not overflow the viewport");
  return { status: "passed", viewport: innerWidth, checks: ["disclosure", "URL and file picker", "undo/redo", "validation", "JPEG conversion", "comparison", "local PNG", "batch exports", "toolbox"] };
})()
