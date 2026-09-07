/** Custom select-only comboboxes. Hidden selects remain the form/state backing store. */
export function mountCustomSelects(root: HTMLElement = document.body) {
  const controls = new Map<HTMLSelectElement, ReturnType<typeof enhance>>();
  let openControl: ReturnType<typeof enhance> | undefined;
  let nextId = 0;

  function enhance(select: HTMLSelectElement) {
    const id = `custom-select-${++nextId}`;
    const wrapper = document.createElement("span"); wrapper.className = "custom-select";
    const trigger = document.createElement("button"); trigger.type = "button"; trigger.className = "custom-select-trigger"; trigger.id = `${id}-trigger`;
    trigger.setAttribute("role", "combobox"); trigger.setAttribute("aria-haspopup", "listbox"); trigger.setAttribute("aria-expanded", "false"); trigger.setAttribute("aria-controls", `${id}-options`);
    const text = document.createElement("span"); text.className = "custom-select-value";
    const arrow = document.createElement("span"); arrow.className = "custom-select-arrow"; arrow.setAttribute("aria-hidden", "true"); arrow.textContent = "⌄";
    trigger.append(text, arrow);
    const list = document.createElement("div"); list.className = "custom-select-menu"; list.id = `${id}-options`; list.setAttribute("role", "listbox"); list.setAttribute("popover", "manual"); list.hidden = true;
    select.before(wrapper); wrapper.append(select, trigger, list);
    select.dataset.customSelect = "true"; select.hidden = true; select.tabIndex = -1; select.setAttribute("aria-hidden", "true");
    let active = -1, isOpen = false, search = "", searchTime = 0;
    const options = () => Array.from(select.options);
    const allowed = (index: number) => {
      const option = select.options[index];
      return Boolean(option && !option.disabled && !option.hidden && !(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled));
    };
    const enabledIndices = () => options().map((_, i) => i).filter(allowed);
    function labelText() {
      if (select.getAttribute("aria-label")) return select.getAttribute("aria-label")!;
      const labelled = select.getAttribute("aria-labelledby");
      if (labelled) return labelled.split(/\s+/).map(id => document.getElementById(id)?.textContent ?? "").join(" ").trim();
      return Array.from(select.labels ?? []).map(label => {
        const clone = label.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("select, .custom-select").forEach(node => node.remove());
        return clone.textContent?.trim() ?? "";
      }).join(" ") || select.name || "Choose an option";
    }
    function position() {
      if (!isOpen) return;
      const rect = trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      const dialog = trigger.closest("dialog")?.getBoundingClientRect();
      const visibleTop = Math.max(topEdge, dialog?.top ?? topEdge), visibleBottom = Math.min(topEdge + height, dialog?.bottom ?? topEdge + height);
      if (rect.bottom <= visibleTop || rect.top >= visibleBottom || !trigger.getClientRects().length) { close(); return; }
      const menuWidth = Math.min(Math.max(rect.width, 220), width - 24);
      const below = topEdge + height - rect.bottom - 12, above = rect.top - topEdge - 12;
      const up = below < 180 && above > below;
      const maxHeight = Math.max(44, Math.min(320, up ? above - 6 : below - 6));
      Object.assign(list.style, { width: `${menuWidth}px`, maxHeight: `${maxHeight}px`, left: `${Math.max(leftEdge + 12, Math.min(rect.left, leftEdge + width - menuWidth - 12))}px`, top: `${up ? Math.max(topEdge + 12, rect.top - Math.min(list.scrollHeight, maxHeight) - 6) : rect.bottom + 6}px` });
    }
    function highlight(index: number) {
      active = index;
      for (const node of Array.from(list.querySelectorAll<HTMLElement>("[role=option]"))) node.classList.toggle("is-active", Number(node.dataset.index) === active);
      if (isOpen && active >= 0) {
        trigger.setAttribute("aria-activedescendant", `${id}-option-${active}`);
        const node = list.querySelector<HTMLElement>(`[data-index="${active}"]`);
        if (node) {
          if (node.offsetTop < list.scrollTop) list.scrollTop = node.offsetTop;
          else if (node.offsetTop + node.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = node.offsetTop + node.offsetHeight - list.clientHeight;
        }
      } else trigger.removeAttribute("aria-activedescendant");
    }
    function sync() {
      const label = labelText(); trigger.setAttribute("aria-label", label); list.setAttribute("aria-label", label);
      const description = select.getAttribute("aria-describedby");
      if (description) trigger.setAttribute("aria-describedby", description); else trigger.removeAttribute("aria-describedby");
      trigger.setAttribute("aria-required", String(select.required));
      trigger.disabled = select.matches(":disabled");
      text.textContent = select.selectedOptions[0]?.label || "Choose an option";
      if (trigger.disabled) close();
      const children: HTMLElement[] = [];
      let group: Element | null = null;
      for (const [index, option] of options().entries()) {
        if (option.hidden) continue;
        if (option.parentElement instanceof HTMLOptGroupElement && option.parentElement !== group) {
          group = option.parentElement; const heading = document.createElement("div"); heading.className = "custom-select-group"; heading.setAttribute("role", "presentation"); heading.textContent = (group as HTMLOptGroupElement).label; children.push(heading);
        }
        const node = document.createElement("div"); node.className = "custom-select-option"; node.id = `${id}-option-${index}`; node.dataset.index = String(index); node.setAttribute("role", "option"); node.setAttribute("aria-selected", String(option.selected)); node.setAttribute("aria-disabled", String(!allowed(index)));
        const label = document.createElement("span"); label.textContent = option.label;
        const check = document.createElement("span"); check.className = "custom-select-check"; check.setAttribute("aria-hidden", "true"); check.textContent = option.selected ? "✓" : "";
        node.append(label, check); children.push(node);
      }
      list.replaceChildren(...children);
      if (!allowed(active)) active = allowed(select.selectedIndex) ? select.selectedIndex : enabledIndices()[0] ?? -1;
      highlight(active); position();
    }
    function close() {
      if (isOpen && typeof list.hidePopover === "function" && list.matches(":popover-open")) list.hidePopover();
      isOpen = false; search = ""; list.hidden = true; trigger.setAttribute("aria-expanded", "false"); trigger.removeAttribute("aria-activedescendant");
      if (openControl === api) openControl = undefined;
    }
    function open(index = select.selectedIndex) {
      sync(); if (trigger.disabled || !enabledIndices().length) return;
      trigger.scrollIntoView({ behavior: "instant", block: "nearest", inline: "nearest" });
      openControl?.close(); openControl = api; isOpen = true; list.hidden = false;
      if (typeof list.showPopover === "function") list.showPopover();
      trigger.setAttribute("aria-expanded", "true"); position(); highlight(allowed(index) ? index : enabledIndices()[0]!);
    }
    function choose(index: number) {
      if (!allowed(index)) return;
      const changed = select.selectedIndex !== index;
      select.selectedIndex = index; close(); sync(); trigger.focus({ preventScroll: true });
      if (changed) { trigger.removeAttribute("aria-invalid"); select.dispatchEvent(new Event("input", { bubbles: true })); select.dispatchEvent(new Event("change", { bubbles: true })); }
    }
    trigger.addEventListener("click", event => { event.preventDefault(); isOpen ? close() : open(); });
    trigger.addEventListener("keydown", event => {
      const indices = enabledIndices(); if (!indices.length) return;
      if (event.key === "Escape" && isOpen) { event.preventDefault(); event.stopPropagation(); close(); return; }
      if (event.key === "Tab") { if (isOpen) choose(active); return; }
      if (event.key === "Enter" || (event.key === " " && (!search || Date.now() - searchTime > 700))) { event.preventDefault(); isOpen ? choose(active) : open(); return; }
      if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        if (!isOpen) open(event.key === "Home" ? indices[0] : event.key === "End" ? indices.at(-1) : select.selectedIndex);
        else if (event.key === "Home") highlight(indices[0]!);
        else if (event.key === "End") highlight(indices.at(-1)!);
        else highlight(indices[Math.max(0, Math.min(indices.length - 1, indices.indexOf(active) + (event.key === "ArrowDown" ? 1 : -1)))]!);
        return;
      }
      if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
        event.preventDefault(); const now = Date.now(); search = now - searchTime > 700 ? event.key : search + event.key; searchTime = now;
        if (!isOpen) open();
        const query = [...search].every(char => char === search[0]) ? search[0]! : search;
        const start = indices.indexOf(active), ordered = [...indices.slice(start + 1), ...indices.slice(0, start + 1)];
        const match = ordered.find(index => select.options[index]!.label.toLocaleLowerCase().startsWith(query.toLocaleLowerCase()));
        if (match !== undefined) highlight(match);
      }
    });
    list.addEventListener("pointerdown", event => { if (event.pointerType !== "touch") event.preventDefault(); });
    list.addEventListener("click", event => { event.preventDefault(); const node = (event.target as Element).closest<HTMLElement>("[data-index]"); if (node) choose(Number(node.dataset.index)); });
    list.addEventListener("pointermove", event => { const node = (event.target as Element).closest<HTMLElement>("[data-index]"); if (node && allowed(Number(node.dataset.index))) highlight(Number(node.dataset.index)); });
    select.addEventListener("change", sync);
    select.addEventListener("invalid", event => { event.preventDefault(); trigger.setAttribute("aria-invalid", "true"); trigger.focus(); open(); });
    // Existing recipes/history assign these properties without emitting DOM events.
    for (const key of ["value", "selectedIndex"] as const) {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, key)!;
      Object.defineProperty(select, key, { configurable: true, get() { return descriptor.get!.call(select); }, set(value) { descriptor.set!.call(select, value); sync(); } });
    }
    const api = { select, wrapper, trigger, list, sync, close, position };
    sync(); return api;
  }

  function scan(node: Element) {
    const selects = node instanceof HTMLSelectElement ? [node] : Array.from(node.querySelectorAll("select"));
    for (const select of selects) if (select.isConnected && !controls.has(select)) controls.set(select, enhance(select));
  }
  scan(root);
  new MutationObserver(records => {
    const changed = new Set<HTMLSelectElement>();
    for (const record of records) {
      const target = record.target instanceof Element ? record.target : record.target.parentElement;
      const select = target?.closest("select"); if (select) changed.add(select);
      if (record.type === "attributes" && target instanceof HTMLFieldSetElement) target.querySelectorAll("select").forEach(select => changed.add(select));
      for (const node of Array.from(record.addedNodes)) if (node instanceof Element) scan(node);
    }
    for (const select of changed) controls.get(select)?.sync();
    for (const [select, control] of controls) if (!select.isConnected) { control.close(); controls.delete(select); }
    if (openControl && !openControl.trigger.getClientRects().length) openControl.close();
  }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["disabled", "selected", "label", "hidden", "open", "aria-label", "aria-labelledby", "aria-describedby", "required"] });
  root.addEventListener("reset", () => queueMicrotask(() => controls.forEach(control => control.sync())));
  root.addEventListener("click", event => {
    const label = (event.target as Element).closest("label");
    if (label && !(event.target as Element).closest(".custom-select")) {
      const select = label.control; if (select instanceof HTMLSelectElement && controls.has(select)) { event.preventDefault(); controls.get(select)!.trigger.focus(); }
    }
  });
  document.addEventListener("pointerdown", event => { if (openControl && !openControl.wrapper.contains(event.target as Node)) openControl.close(); }, true);
  document.addEventListener("focusin", event => { if (openControl && !openControl.wrapper.contains(event.target as Node)) openControl.close(); });
  root.addEventListener("close", () => openControl?.close(), true);
  const position = () => openControl?.position();
  window.addEventListener("resize", position); window.addEventListener("scroll", position, true);
  window.visualViewport?.addEventListener("resize", position); window.visualViewport?.addEventListener("scroll", position);
}
