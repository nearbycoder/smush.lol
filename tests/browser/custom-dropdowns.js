// Run against the built app: agent-browser --session features eval "$(cat tests/browser/custom-dropdowns.js)"
(async () => {
  const tick = () => new Promise(resolve => setTimeout(resolve, 30));
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const trigger = select => select.closest(".custom-select").querySelector("[role=combobox]");
  const key = (button, value) => button.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true }));
  function choose(select, value) {
    const button = trigger(select); button.scrollIntoView({ behavior: "instant", block: "center" }); button.click();
    assert(button.getAttribute("aria-expanded") === "true", `Menu did not open: ${select.id || select.name}`);
    const menu = document.getElementById(button.getAttribute("aria-controls"));
    assert(menu.matches(":popover-open"), "Custom menu must escape dialog clipping");
    const index = Array.from(select.options).findIndex(option => option.value === value);
    menu.querySelector(`[data-index="${index}"]`).click();
    assert(select.value === value, "Choice did not reach form state");
    assert(button.querySelector(".custom-select-value").textContent === select.selectedOptions[0].label, "Displayed choice is stale");
  }
  assert(Array.from(document.querySelectorAll("select")).every(select => select.hidden && select.dataset.customSelect), "A native dropdown is still exposed");
  const fixture = document.createElement("form"); fixture.id = "dropdown-regression";
  fixture.innerHTML = '<label for="regression-choice">Regression choice</label><select id="regression-choice" name="choice"><option value="a">Alpha</option><option value="b" disabled>Blocked</option><option value="c">Charlie</option><optgroup label="Disabled group" disabled><option value="d">Delta</option></optgroup><option value="e">Echo</option></select><button type="reset">Reset</button>';
  document.body.append(fixture); await tick();
  const select = fixture.querySelector("select"), button = trigger(select);
  let changes = 0; select.addEventListener("change", () => changes++);
  button.focus(); key(button, "ArrowDown"); key(button, "ArrowDown"); key(button, "Enter");
  assert(select.value === "c" && changes === 1, "Arrow navigation must skip disabled options and commit once");
  assert(new FormData(fixture).get("choice") === "c", "Submission lost the custom selection");
  key(button, "ArrowDown"); key(button, "End"); key(button, "Escape");
  assert(select.value === "c" && button.getAttribute("aria-expanded") === "false", "Escape must cancel the pending choice");
  key(button, "a"); key(button, "Enter"); assert(select.value === "a", "Typeahead selection failed");
  select.value = "e"; assert(button.textContent.includes("Echo"), "Programmatic value assignment did not sync");
  select.selectedIndex = 2; assert(button.textContent.includes("Charlie"), "Programmatic index assignment did not sync");
  fixture.reset(); await tick(); assert(select.value === "a" && button.textContent.includes("Alpha"), "Form reset did not sync");
  select.disabled = true; await tick(); assert(button.disabled, "Disabled state did not sync");
  select.disabled = false; select.append(new Option("Foxtrot", "f")); await tick(); choose(select, "f");
  button.click(); document.body.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })); assert(button.getAttribute("aria-expanded") === "false", "Outside click must close menu");
  button.click(); fixture.remove(); await tick(); assert(!document.querySelector("#dropdown-regression") && !document.querySelector(".custom-select-menu:popover-open"), "Removed controls must close their popup");

  const edge = document.createElement("div"); edge.style.cssText = "position:fixed;bottom:12px;right:12px;width:220px;z-index:999";
  edge.innerHTML = '<label>Edge placement<select><option>One</option><option>Two</option><option>Three</option></select></label>';
  document.body.append(edge); await tick(); const edgeButton = trigger(edge.querySelector("select")); edgeButton.click();
  const edgeMenu = document.getElementById(edgeButton.getAttribute("aria-controls")).getBoundingClientRect(), edgeRect = edgeButton.getBoundingClientRect();
  assert(edgeMenu.bottom <= edgeRect.top && edgeMenu.top >= 0 && edgeMenu.right <= innerWidth, "Menu must flip above a trigger near the viewport bottom");
  edge.remove(); await tick();

  document.querySelector("#toolbox-open").click(); await tick();
  const kind = document.querySelector("#toolbox-kind"); let dynamicCount = 0;
  for (const option of Array.from(kind.options)) {
    choose(kind, option.value); await tick();
    for (const control of Array.from(document.querySelectorAll("#toolbox-controls select"))) {
      assert(control.hidden && control.dataset.customSelect, "Dynamically inserted native dropdown");
      const last = Array.from(control.options).filter(option => !option.disabled).at(-1);
      choose(control, last.value); dynamicCount++;
    }
  }
  document.querySelector("#toolbox-close").click(); await tick();
  const recipeName = document.querySelector("#recipe-name"), recipes = document.querySelector("#recipe-select");
  recipeName.value = "Custom dropdown regression"; document.querySelector("#save-settings").click(); await tick();
  assert(!trigger(recipes).disabled && trigger(recipes).textContent.includes(recipeName.value), "Recipe option updates failed");
  document.querySelector("#forget-settings").click(); await tick();
  return { status: "passed", dynamicDropdownsChecked: dynamicCount, nativeDropdownsExposed: document.querySelectorAll("select:not([data-custom-select])").length };
})()
