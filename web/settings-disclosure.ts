/** Keep changed settings discoverable without opening every optional section. */
export function mountSettingsDisclosure(form: HTMLFormElement) {
  const more = form.querySelector<HTMLDetailsElement>("#more-options")!;
  const summary = form.querySelector<HTMLElement>("#more-options-summary")!;
  const sizeSummary = form.querySelector<HTMLElement>("#size-options-summary")!;
  const groups = Array.from(form.querySelectorAll<HTMLDetailsElement>("[data-settings-group]"));
  const fields = Array.from(more.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]"));
  const read = (field: HTMLInputElement | HTMLSelectElement) =>
    field instanceof HTMLInputElement && ["checkbox", "radio"].includes(field.type) ? String(field.checked) : field.value;
  // Capture once: hidden inputs reflect value changes into defaultValue.
  const defaults = new Map(fields.map(field => [field, read(field)]));
  const badges = new Map(groups.map(group => {
    const badge = document.createElement("em");
    badge.className = "changed-settings";
    group.querySelector("summary > span")!.append(badge);
    return [group, badge];
  }));

  function refresh() {
    const value = (name: string) => form.querySelector<HTMLInputElement>(`input[name="${name}"]`)!.value;
    const width = value("width"), height = value("height");
    sizeSummary.textContent = (width || height ? `${width || "Auto"} × ${height || "Auto"} px` : "Original dimensions")
      + (value("cropRatio") ? " · crop applied" : "");
    const changed = fields.filter(field => read(field) !== defaults.get(field));
    summary.textContent = changed.length
      ? `${changed.length} custom ${changed.length === 1 ? "setting" : "settings"} · review or adjust`
      : "File size, effects, recipes & batch exports";
    more.classList.toggle("has-changes", changed.length > 0);
    for (const [group, badge] of badges) {
      const count = changed.filter(field => group.contains(field)).length;
      badge.textContent = count ? "Changed" : "";
      badge.hidden = count === 0;
    }
  }

  // Run after other handlers, including presets, resets, recipes and undo.
  for (const event of ["input", "change", "click", "reset"]) {
    form.addEventListener(event, () => queueMicrotask(refresh));
  }
  for (const id of ["crop-apply", "redact-apply"]) {
    document.getElementById(id)!.addEventListener("click", () => queueMicrotask(refresh));
  }
  form.addEventListener("invalid", event => {
    // Native validation must be able to focus controls in collapsed sections.
    let parent = (event.target as HTMLElement).parentElement;
    while (parent && parent !== form) {
      if (parent instanceof HTMLDetailsElement) parent.open = true;
      parent = parent.parentElement;
    }
  }, true);
  refresh();
  return { refresh };
}
