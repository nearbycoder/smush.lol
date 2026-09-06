import { cropRect } from "./crop-geometry";

export function mountCropEditor(source: () => string | null, notify: (message: string, error?: boolean) => void, changed: () => void) {
  const dialog = document.querySelector<HTMLDialogElement>("#crop-dialog")!;
  const canvas = document.querySelector<HTMLCanvasElement>("#crop-canvas")!;
  const ratio = document.querySelector<HTMLSelectElement>("#crop-ratio-choice")!;
  const ratioWidth = document.querySelector<HTMLInputElement>("#crop-custom-width")!;
  const ratioHeight = document.querySelector<HTMLInputElement>("#crop-custom-height")!;
  const scale = document.querySelector<HTMLInputElement>("#crop-area")!;
  const x = document.querySelector<HTMLInputElement>("#crop-focus-x")!;
  const y = document.querySelector<HTMLInputElement>("#crop-focus-y")!;
  const dimensions = document.querySelector<HTMLElement>("#crop-dimensions")!;
  const apply = document.querySelector<HTMLButtonElement>("#crop-apply")!;
  let image: HTMLImageElement | null = null;
  let imageUrl: string | null = null;
  const field = (name: string) => document.querySelector<HTMLInputElement>(`#controls input[name="${name}"]`)!;
  function values() {
    return {
      cropRatio: ratio.value === "custom" ? String(Number(ratioWidth.value) / Number(ratioHeight.value)) : ratio.value,
      cropScale: scale.value, cropX: x.value, cropY: y.value,
    };
  }
  function draw() {
    document.querySelector<HTMLElement>("#crop-custom")!.hidden = ratio.value !== "custom";
    if (!image) return;
    try {
      const rect = cropRect(image.naturalWidth, image.naturalHeight, values());
      const context = canvas.getContext("2d")!;
      const sx = canvas.width / image.naturalWidth;
      const sy = canvas.height / image.naturalHeight;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.fillStyle = "rgba(0,0,0,.55)";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.save();
      context.beginPath();
      context.rect(rect.x * sx, rect.y * sy, rect.width * sx, rect.height * sy);
      context.clip();
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      context.restore();
      context.strokeStyle = "#c9f36b";
      context.lineWidth = 3;
      context.strokeRect(rect.x * sx, rect.y * sy, rect.width * sx, rect.height * sy);
      dimensions.textContent = `${rect.width} × ${rect.height}px · ${scale.value}% area scale`;
      apply.disabled = false;
    } catch (error) {
      dimensions.textContent = error instanceof Error ? error.message : "Choose a valid crop.";
      apply.disabled = true;
    }
  }
  document.querySelector("#crop-open")!.addEventListener("click", async () => {
    const url = source();
    if (!url) { notify("Choose an image before cropping."); return; }
    imageUrl = url;
    const nextImage = new Image();
    nextImage.src = url;
    try {
      await nextImage.decode();
      if (source() !== url) return;
      image = nextImage;
      const factor = Math.min(1, 1000 / image.naturalWidth, 650 / image.naturalHeight);
      canvas.width = Math.max(1, Math.round(image.naturalWidth * factor));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * factor));
      const saved = field("cropRatio").value || "original";
      const preset = Array.from(ratio.options).some(option => option.value === saved);
      ratio.value = preset ? saved : "custom";
      ratioWidth.value = preset ? "3" : saved;
      ratioHeight.value = preset ? "2" : "1";
      scale.value = field("cropScale").value;
      x.value = field("cropX").value;
      y.value = field("cropY").value;
      dialog.showModal();
      draw();
    } catch { notify("This browser cannot preview that image for cropping.", true); }
  });
  for (const input of [ratio, ratioWidth, ratioHeight, scale, x, y]) input.addEventListener("input", draw);
  function move(event: PointerEvent) {
    if (!image || apply.disabled) return;
    const bounds = canvas.getBoundingClientRect();
    const rect = cropRect(image.naturalWidth, image.naturalHeight, values());
    const pointX = (event.clientX - bounds.left) / bounds.width * image.naturalWidth;
    const pointY = (event.clientY - bounds.top) / bounds.height * image.naturalHeight;
    x.value = String(Math.max(0, Math.min(100, (pointX - rect.width / 2) / Math.max(1, image.naturalWidth - rect.width) * 100)));
    y.value = String(Math.max(0, Math.min(100, (pointY - rect.height / 2) / Math.max(1, image.naturalHeight - rect.height) * 100)));
    draw();
  }
  canvas.addEventListener("pointerdown", event => { canvas.setPointerCapture(event.pointerId); move(event); });
  canvas.addEventListener("pointermove", event => { if (canvas.hasPointerCapture(event.pointerId)) move(event); });
  canvas.addEventListener("pointerup", event => { if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId); });
  apply.addEventListener("click", () => {
    if (source() !== imageUrl) { dialog.close(); return; }
    for (const [key, value] of Object.entries(values())) field(key).value = value;
    changed();
    dialog.close();
    notify("Crop applied. Convert to see the result.");
  });
  document.querySelector("#crop-cancel")!.addEventListener("click", () => dialog.close());
  document.querySelector("#crop-remove")!.addEventListener("click", () => {
    field("cropRatio").value = "";
    field("cropScale").value = "100";
    field("cropX").value = field("cropY").value = "50";
    changed();
  });
  dialog.addEventListener("close", () => { image = null; canvas.width = canvas.height = 0; });
  return { sourceChanged() { dialog.close(); } };
}
