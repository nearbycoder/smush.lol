/** Bounded immutable snapshots. Editing after undo discards the abandoned future. */
export class EditHistory<T> {
  private states: string[];
  private index = 0;
  constructor(initial: T, private limit = 50, private byteLimit = 8 * 1024 * 1024) { this.states = [JSON.stringify(initial)]; }
  get canUndo() { return this.index > 0; }
  get canRedo() { return this.index < this.states.length - 1; }
  get current(): T { return JSON.parse(this.states[this.index]!); }
  record(value: T): void {
    const next = JSON.stringify(value);
    if (next === this.states[this.index]) return;
    this.states = this.states.slice(0, this.index + 1); this.states.push(next);
    while (this.states.length > 1 && (this.states.length > this.limit || this.states.reduce((sum, state) => sum + state.length * 2, 0) > this.byteLimit)) this.states.shift();
    this.index = this.states.length - 1;
  }
  undo(): T { if (this.canUndo) this.index--; return this.current; }
  redo(): T { if (this.canRedo) this.index++; return this.current; }
  reset(value: T): void { this.states = [JSON.stringify(value)]; this.index = 0; }
}
export function mountHistory<T>(form: HTMLFormElement, read: () => T, apply: (value: T) => void) {
  const history = new EditHistory(read());
  const undo = document.querySelector<HTMLButtonElement>("#undo-settings")!, redo = document.querySelector<HTMLButtonElement>("#redo-settings")!;
  let timer: ReturnType<typeof setTimeout> | undefined, restoring = false;
  const render = () => { undo.disabled = !history.canUndo; redo.disabled = !history.canRedo; };
  const record = () => { clearTimeout(timer); if (restoring) return; history.record(read()); render(); };
  function move(back: boolean) {
    record(); restoring = true;
    try { apply(back ? history.undo() : history.redo()); }
    finally { restoring = false; render(); }
    document.querySelector("#history-status")!.textContent = back ? "Previous settings restored. Convert to update the result." : "Next settings restored. Convert to update the result.";
  }
  undo.addEventListener("click", () => move(true)); redo.addEventListener("click", () => move(false));
  form.addEventListener("input", () => { if (!restoring) { clearTimeout(timer); timer = setTimeout(record, 300); } });
  form.addEventListener("change", record);
  form.addEventListener("click", event => {
    if ((event.target as Element).closest("#undo-settings, #redo-settings")) return;
    queueMicrotask(record);
  });
  for (const id of ["crop-apply", "redact-apply"]) document.getElementById(id)!.addEventListener("click", () => queueMicrotask(record));
  document.addEventListener("keydown", event => {
    if (!(event.metaKey || event.ctrlKey) || event.altKey || !["z", "y"].includes(event.key.toLowerCase())) return;
    if ((event.target as Element).closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;
    event.preventDefault(); move(event.key.toLowerCase() === "z" && !event.shiftKey);
  });
  render(); return { reset() { clearTimeout(timer); history.reset(read()); render(); document.querySelector("#history-status")!.textContent = ""; } };
}
