// Run against the built app: agent-browser --session features eval "$(cat tests/browser/settings-panel.js)"
(async () => {
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const tick = () => new Promise(resolve => setTimeout(resolve, 40));
  const el = id => document.getElementById(id);
  const original = localStorage.getItem("smush.recipes.v1");
  try {
    localStorage.removeItem("smush.recipes.v1"); window.dispatchEvent(new Event("storage"));
    assert(!el("recipe-panel").open, "Recipe management should start collapsed");
    el("recipe-panel").open = true; await tick();
    assert(el("recipe-library").hidden && !el("recipe-empty").hidden && el("recipe-export").disabled, "Empty recipe state should hide unavailable actions");
    el("controls").querySelector('[data-export-preset="email"]').click();
    el("recipe-name").value = "Email photos"; el("recipe-name").dispatchEvent(new Event("input")); el("save-settings").click(); await tick();
    assert(el("recipe-summary").textContent === "1 recipe ready to reuse", "Recipe count did not update");
    assert(!el("recipe-library").hidden && el("recipe-empty").hidden && !el("recipe-export").disabled, "Saved recipe actions were not revealed");
    assert(el("save-settings").textContent === "Update recipe", "Existing recipe should show Update");
    el("controls").querySelector('[data-export-preset="web"]').click();
    el("use-settings").click(); await tick();
    assert(document.querySelector('[name=format]:checked').value === "jpeg" && document.querySelector('[name=width]').value === "1200", "Using a recipe did not restore settings");
    document.querySelector('[name=width]').value = "640"; el("save-settings").click(); await tick();
    assert(JSON.parse(localStorage.getItem("smush.recipes.v1")).recipes.length === 1, "Updating a recipe should not duplicate it");
    document.querySelector('[name=width]').value = "100"; el("use-settings").click(); await tick();
    assert(document.querySelector('[name=width]').value === "640", "Updated recipe did not restore width");
    el("forget-settings").click(); await tick();
    assert(el("recipe-library").hidden && !el("recipe-empty").hidden && el("recipe-export").disabled, "Deleting the final recipe did not restore the empty state");
    for (const id of ["undo-settings", "redo-settings", "reset-button", "save-settings", "recipe-import", "recipe-export", "crop-open", "crop-remove"]) assert(el(id).getBoundingClientRect().height >= 44, `${id} needs a 44px tap target`);
    assert(document.documentElement.scrollWidth <= innerWidth, "Settings overflow the viewport");
    el("recipe-panel").open = false;
    return { status: "passed", viewport: innerWidth, states: ["empty", "saved", "updated", "applied", "deleted"], minTapTarget: 44 };
  } finally {
    if (original === null) localStorage.removeItem("smush.recipes.v1"); else localStorage.setItem("smush.recipes.v1", original);
    window.dispatchEvent(new Event("storage"));
  }
})()
