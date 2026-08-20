const MAX_FILE_BYTES = 15 * 1024 * 1024;

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}

const dropZone = byId<HTMLDivElement>("drop-zone");
const fileInput = byId<HTMLInputElement>("file-input");
const browseButton = byId<HTMLButtonElement>("browse-button");
const demoButton = byId<HTMLButtonElement>("demo-button");
const urlForm = byId<HTMLFormElement>("url-form");
const imageUrlInput = byId<HTMLInputElement>("image-url");
const urlButton = byId<HTMLButtonElement>("url-button");
const previewShell = byId<HTMLDivElement>("preview-shell");
const previewImage = byId<HTMLImageElement>("preview-image");
const sourceName = byId<HTMLElement>("source-name");
const replaceButton = byId<HTMLButtonElement>("replace-button");
const originalTab = byId<HTMLButtonElement>("original-tab");
const resultTab = byId<HTMLButtonElement>("result-tab");
const processing = byId<HTMLDivElement>("processing");
const dimensionStat = byId<HTMLElement>("dimension-stat");
const sizeStat = byId<HTMLElement>("size-stat");
const typeStat = byId<HTMLElement>("type-stat");
const resultBar = byId<HTMLDivElement>("result-bar");
const resultBadge = byId<HTMLElement>("result-badge");
const resultSummary = byId<HTMLElement>("result-summary");
const downloadButton = byId<HTMLButtonElement>("download-button");
const copyUrlButton = byId<HTMLButtonElement>("copy-url-button");
const controls = byId<HTMLFormElement>("controls");
const widthInput = byId<HTMLInputElement>("width-input");
const heightInput = byId<HTMLInputElement>("height-input");
const lockRatioButton = byId<HTMLButtonElement>("lock-ratio");
const rotationInput = byId<HTMLInputElement>("rotation-input");
const flopInput = byId<HTMLInputElement>("flop-input");
const flipInput = byId<HTMLInputElement>("flip-input");
const flopButton = byId<HTMLButtonElement>("flop-button");
const flipButton = byId<HTMLButtonElement>("flip-button");
const brightnessInput = byId<HTMLInputElement>("brightness-input");
const saturationInput = byId<HTMLInputElement>("saturation-input");
const qualityInput = byId<HTMLInputElement>("quality-input");
const compressionInput = byId<HTMLInputElement>("compression-input");
const colorsInput = byId<HTMLInputElement>("colors-input");
const paletteInput = byId<HTMLInputElement>("palette-input");
const paletteOptions = byId<HTMLDivElement>("palette-options");
const qualitySettings = byId<HTMLDivElement>("quality-settings");
const pngSettings = byId<HTMLDivElement>("png-settings");
const losslessRow = byId<HTMLElement>("lossless-row");
const progressiveRow = byId<HTMLElement>("progressive-row");
const smushButton = byId<HTMLButtonElement>("smush-button");
const resetButton = byId<HTMLButtonElement>("reset-button");
const controlHint = byId<HTMLElement>("control-hint");
const advancedOptions = byId<HTMLDetailsElement>("advanced-options");
const toast = byId<HTMLDivElement>("toast");

interface ImageInfo {
  width: number;
  height: number;
  size: number;
  type: string;
}

let selectedFile: File | null = null;
let selectedRemoteUrl: string | null = null;
let originalUrl: string | null = null;
let originalUrlIsObject = false;
let resultUrl: string | null = null;
let resultBlob: Blob | null = null;
let resultTransformUrl: string | null = null;
let resultFilename = "smushed-image.webp";
let sourceInfo: ImageInfo = { width: 0, height: 0, size: 0, type: "image" };
let outputInfo: ImageInfo | null = null;
let currentView: "original" | "result" = "original";
let ratioLocked = true;
let busy = false;
let toastTimer: number | undefined;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 100 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function friendlyType(type: string): string {
  const subtype = type.replace(/^image\//, "").replace("jpeg", "jpg");
  return subtype ? subtype.toUpperCase() : "IMAGE";
}

function showToast(message: string, isError = false): void {
  if (toastTimer !== undefined) window.clearTimeout(toastTimer);
  toast.textContent = message;
  toast.classList.toggle("error", isError);
  toast.hidden = false;
  toastTimer = window.setTimeout(() => {
    toast.hidden = true;
  }, 4200);
}

function isSupportedImage(file: File): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?)$/i.test(file.name);
}

async function getImageDimensions(blob: Blob): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;

  try {
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function clearResult(): void {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultBlob = null;
  resultTransformUrl = null;
  outputInfo = null;
  resultTab.disabled = true;
  resultBar.hidden = true;
  copyUrlButton.hidden = true;
  setView("original");
}

function setOriginalUrl(url: string, isObjectUrl: boolean): void {
  if (originalUrl && originalUrlIsObject) URL.revokeObjectURL(originalUrl);
  originalUrl = url;
  originalUrlIsObject = isObjectUrl;
}

function renderStats(info: ImageInfo): void {
  dimensionStat.textContent = info.width > 0 && info.height > 0 ? `${info.width} × ${info.height}` : "Read on convert";
  sizeStat.textContent = info.type === "remote" ? "—" : formatBytes(info.size);
  typeStat.textContent = friendlyType(info.type);
}

function setView(view: "original" | "result"): void {
  if (view === "result" && (!resultUrl || !outputInfo)) return;
  currentView = view;
  const isResult = view === "result";

  originalTab.classList.toggle("active", !isResult);
  originalTab.setAttribute("aria-selected", String(!isResult));
  resultTab.classList.toggle("active", isResult);
  resultTab.setAttribute("aria-selected", String(isResult));

  previewImage.src = isResult ? (resultUrl ?? "") : (originalUrl ?? "");
  renderStats(isResult && outputInfo ? outputInfo : sourceInfo);
}

async function loadFile(file: File): Promise<void> {
  if (!isSupportedImage(file)) {
    showToast("Choose a supported image file.", true);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showToast("The image must be 15 MB or smaller.", true);
    return;
  }

  selectedFile = file;
  selectedRemoteUrl = null;
  setOriginalUrl(URL.createObjectURL(file), true);
  clearResult();

  sourceInfo = {
    width: 0,
    height: 0,
    size: file.size,
    type: file.type || "image/unknown",
  };

  try {
    const dimensions = await getImageDimensions(file);
    sourceInfo.width = dimensions.width;
    sourceInfo.height = dimensions.height;
  } catch {
    showToast("This format cannot be previewed in your browser. Bun.Image may still support it.");
  }

  sourceName.textContent = file.name;
  dropZone.hidden = true;
  previewShell.hidden = false;
  smushButton.disabled = false;
  controlHint.textContent = "Ready to convert. The original file will not be changed.";
  resetControls();
  setView("original");
}

function normalizedRemoteUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("The image URL must use HTTP or HTTPS.");
  }
  return url.toString();
}

function remoteDisplayName(value: string): string {
  const url = new URL(value);
  try {
    return `${url.hostname}${url.pathname === "/" ? "" : decodeURIComponent(url.pathname)}`;
  } catch {
    return url.hostname;
  }
}

function remoteTransformUrl(source: string, fields?: FormData): string {
  const endpoint = new URL("/api/image", window.location.origin);
  endpoint.searchParams.set("url", source);

  if (!fields) {
    endpoint.searchParams.set("format", "webp");
    endpoint.searchParams.set("quality", "82");
    return endpoint.toString();
  }

  const values = Object.fromEntries(
    Array.from(fields.entries()).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
  const setWhenChanged = (key: string, fallback: string) => {
    const value = values[key];
    if (value && value !== fallback) endpoint.searchParams.set(key, value);
  };

  for (const dimension of ["width", "height"] as const) {
    if (values[dimension]) endpoint.searchParams.set(dimension, values[dimension]);
  }
  setWhenChanged("format", "webp");
  if (values.format !== "png") setWhenChanged("quality", "82");
  setWhenChanged("fit", "inside");
  setWhenChanged("filter", "lanczos3");
  if (values.withoutEnlargement) endpoint.searchParams.set("withoutEnlargement", "1");
  setWhenChanged("rotate", "0");
  setWhenChanged("flip", "false");
  setWhenChanged("flop", "false");
  setWhenChanged("brightness", "1");
  setWhenChanged("saturation", "1");

  if (values.format === "webp" && values.lossless) endpoint.searchParams.set("lossless", "1");
  if (values.format === "jpeg" && values.progressive) endpoint.searchParams.set("progressive", "1");
  if (values.format === "png") {
    setWhenChanged("compressionLevel", "6");
    if (values.palette) {
      endpoint.searchParams.set("palette", "1");
      setWhenChanged("colors", "128");
      if (values.dither) endpoint.searchParams.set("dither", "1");
    }
  }

  return endpoint.toString();
}

async function responseError(response: Response, fallback: string): Promise<Error> {
  const body = (await response.json().catch(() => ({ error: fallback }))) as { error?: string };
  return new Error(body.error ?? fallback);
}

async function loadRemoteImage(value: string): Promise<void> {
  let source: string;
  try {
    source = normalizedRemoteUrl(value.trim());
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Enter a valid public image URL.", true);
    return;
  }

  urlButton.disabled = true;
  urlButton.textContent = "Loading…";

  try {
    const response = await fetch(remoteTransformUrl(source));
    if (!response.ok) throw await responseError(response, "The remote image could not be loaded.");

    const blob = await response.blob();
    const previewUrl = URL.createObjectURL(blob);
    const dimensions = await getImageDimensions(blob).catch(() => ({ width: 0, height: 0 }));

    selectedFile = null;
    selectedRemoteUrl = source;
    setOriginalUrl(previewUrl, true);
    clearResult();
    sourceInfo = {
      width: dimensions.width,
      height: dimensions.height,
      size: 0,
      type: "remote",
    };

    sourceName.textContent = remoteDisplayName(source);
    dropZone.hidden = true;
    previewShell.hidden = false;
    smushButton.disabled = false;
    controlHint.textContent = "Ready to convert from the source URL.";
    resetControls();
    setView("original");
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The remote image could not be loaded.", true);
  } finally {
    urlButton.disabled = false;
    urlButton.textContent = "Load";
  }
}

function chooseFiles(): void {
  fileInput.value = "";
  fileInput.click();
}

dropZone.addEventListener("click", (event) => {
  const target = event.target;
  if (target instanceof Element && target.closest("button, input, form")) return;
  chooseFiles();
});
browseButton.addEventListener("click", (event) => {
  event.stopPropagation();
  chooseFiles();
});

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) void loadFile(file);
});

urlForm.addEventListener("click", (event) => event.stopPropagation());
urlForm.addEventListener("submit", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void loadRemoteImage(imageUrlInput.value);
});

replaceButton.addEventListener("click", () => {
  selectedFile = null;
  selectedRemoteUrl = null;
  if (originalUrl && originalUrlIsObject) URL.revokeObjectURL(originalUrl);
  originalUrl = null;
  originalUrlIsObject = false;
  clearResult();
  previewImage.removeAttribute("src");
  previewShell.hidden = true;
  dropZone.hidden = false;
  smushButton.disabled = true;
  controlHint.textContent = "Choose an image to continue.";
});

for (const eventName of ["dragenter", "dragover"] as const) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.add("dragging");
    if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
  });
}

for (const eventName of ["dragleave", "drop"] as const) {
  dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  });
}

dropZone.addEventListener("drop", (event) => {
  const file = event.dataTransfer?.files[0];
  if (file) void loadFile(file);
});

document.addEventListener("paste", (event) => {
  const file = Array.from(event.clipboardData?.files ?? []).find(isSupportedImage);
  if (file) {
    event.preventDefault();
    void loadFile(file);
  }
});

demoButton.addEventListener("click", (event) => {
  event.stopPropagation();
  const canvas = document.createElement("canvas");
  canvas.width = 1400;
  canvas.height = 900;
  const context = canvas.getContext("2d");
  if (!context) return;

  const gradient = context.createLinearGradient(0, 0, 1400, 900);
  gradient.addColorStop(0, "#fff3cb");
  gradient.addColorStop(0.55, "#ff9b70");
  gradient.addColorStop(1, "#bda6ff");
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.fillStyle = "#c9f36b";
  context.beginPath();
  context.arc(1120, 190, 215, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = "#17160f";
  context.beginPath();
  context.arc(250, 710, 160, 0, Math.PI * 2);
  context.fill();

  context.save();
  context.translate(700, 470);
  context.rotate(-0.04);
  context.fillStyle = "#fffdf8";
  context.strokeStyle = "#17160f";
  context.lineWidth = 12;
  context.beginPath();
  context.roundRect(-420, -190, 840, 380, 56);
  context.fill();
  context.stroke();
  context.fillStyle = "#17160f";
  context.textAlign = "center";
  context.font = "900 116px Arial, sans-serif";
  context.fillText("SAMPLE IMAGE", 0, 20);
  context.font = "700 32px monospace";
  context.fillText("1400 × 900 • PNG", 0, 94);
  context.restore();

  canvas.toBlob((blob) => {
    if (!blob) return;
    void loadFile(new File([blob], "big-image-energy.png", { type: "image/png" }));
  }, "image/png");
});

originalTab.addEventListener("click", () => setView("original"));
resultTab.addEventListener("click", () => setView("result"));

lockRatioButton.addEventListener("click", () => {
  ratioLocked = !ratioLocked;
  lockRatioButton.classList.toggle("active", ratioLocked);
  lockRatioButton.setAttribute("aria-pressed", String(ratioLocked));
});

function sourceRatio(): number | null {
  return sourceInfo.width > 0 && sourceInfo.height > 0 ? sourceInfo.width / sourceInfo.height : null;
}

widthInput.addEventListener("input", () => {
  const ratio = sourceRatio();
  if (!ratioLocked || !ratio || !widthInput.value) return;
  heightInput.value = String(Math.max(1, Math.round(Number(widthInput.value) / ratio)));
});

heightInput.addEventListener("input", () => {
  const ratio = sourceRatio();
  if (!ratioLocked || !ratio || !heightInput.value) return;
  widthInput.value = String(Math.max(1, Math.round(Number(heightInput.value) * ratio)));
});

document.querySelectorAll<HTMLButtonElement>("[data-scale], [data-max-width]").forEach((button) => {
  button.addEventListener("click", () => {
    if (!sourceInfo.width || !sourceInfo.height) {
      showToast("The image dimensions will be read during conversion.");
      return;
    }

    const scale = button.dataset.scale ? Number(button.dataset.scale) : null;
    const maxWidth = button.dataset.maxWidth ? Number(button.dataset.maxWidth) : null;
    const width = scale ? Math.round(sourceInfo.width * scale) : Math.min(sourceInfo.width, maxWidth ?? sourceInfo.width);
    widthInput.value = String(width);
    heightInput.value = String(Math.max(1, Math.round((width / sourceInfo.width) * sourceInfo.height)));
  });
});

document.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach((button) => {
  button.addEventListener("click", () => {
    rotationInput.value = button.dataset.rotation ?? "0";
    document.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach((item) => {
      item.classList.toggle("active", item === button);
    });
  });
});

function wireToggle(button: HTMLButtonElement, input: HTMLInputElement): void {
  button.addEventListener("click", () => {
    const next = button.getAttribute("aria-pressed") !== "true";
    button.setAttribute("aria-pressed", String(next));
    input.value = String(next);
  });
}

wireToggle(flopButton, flopInput);
wireToggle(flipButton, flipInput);

function wireRange(
  input: HTMLInputElement,
  outputId: string,
  formatter: (value: number) => string = String,
): void {
  const output = byId<HTMLOutputElement>(outputId);
  const render = () => {
    const value = Number(input.value);
    const min = Number(input.min || 0);
    const max = Number(input.max || 100);
    input.style.setProperty("--range-progress", `${((value - min) / (max - min)) * 100}%`);
    output.value = formatter(value);
  };
  input.addEventListener("input", render);
  render();
}

wireRange(brightnessInput, "brightness-value", (value) => `${Math.round(value * 100)}%`);
wireRange(saturationInput, "saturation-value", (value) => `${Math.round(value * 100)}%`);
wireRange(qualityInput, "quality-value", (value) => String(value));
wireRange(compressionInput, "compression-value", (value) => String(value));
wireRange(colorsInput, "colors-value", (value) => String(value));

function selectedFormat(): "webp" | "jpeg" | "png" {
  const selected = controls.querySelector<HTMLInputElement>('input[name="format"]:checked');
  return selected?.value === "jpeg" || selected?.value === "png" ? selected.value : "webp";
}

function updateFormatSettings(): void {
  const format = selectedFormat();
  qualitySettings.hidden = format === "png";
  pngSettings.hidden = format !== "png";
  losslessRow.hidden = format !== "webp";
  progressiveRow.hidden = format !== "jpeg";
}

controls.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((input) => {
  input.addEventListener("change", updateFormatSettings);
});

paletteInput.addEventListener("change", () => {
  paletteOptions.hidden = !paletteInput.checked;
});

function resetControls(): void {
  controls.reset();
  widthInput.value = "";
  heightInput.value = "";
  ratioLocked = true;
  lockRatioButton.classList.add("active");
  lockRatioButton.setAttribute("aria-pressed", "true");
  rotationInput.value = "0";
  flopInput.value = "false";
  flipInput.value = "false";
  flopButton.setAttribute("aria-pressed", "false");
  flipButton.setAttribute("aria-pressed", "false");
  document.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach((button) => {
    button.classList.toggle("active", button.dataset.rotation === "0");
  });
  paletteOptions.hidden = true;
  advancedOptions.open = false;
  updateFormatSettings();
  for (const range of [brightnessInput, saturationInput, qualityInput, compressionInput, colorsInput]) {
    range.dispatchEvent(new Event("input"));
  }
}

resetButton.addEventListener("click", () => {
  resetControls();
  showToast("Settings reset.");
});

function setBusy(nextBusy: boolean): void {
  busy = nextBusy;
  processing.hidden = !nextBusy;
  smushButton.disabled = nextBusy || (!selectedFile && !selectedRemoteUrl);
  smushButton.querySelector("strong")!.textContent = nextBusy ? "Processing…" : "Convert image";
}

function responseFilename(response: Response, fallback: string): string {
  const disposition = response.headers.get("content-disposition");
  const match = disposition?.match(/filename="([^"]+)"/i);
  return match?.[1] ?? fallback;
}

controls.addEventListener("submit", async (event) => {
  event.preventDefault();
  if ((!selectedFile && !selectedRemoteUrl) || busy) return;

  setBusy(true);

  try {
    const payload = new FormData(controls);
    const requestUrl = selectedRemoteUrl ? remoteTransformUrl(selectedRemoteUrl, payload) : null;
    let response: Response;

    if (selectedFile) {
      payload.set("image", selectedFile, selectedFile.name);
      response = await fetch("/api/smush", {
        method: "POST",
        body: payload,
      });
    } else {
      response = await fetch(requestUrl!);
    }

    if (!response.ok) {
      throw await responseError(response, "The image could not be converted.");
    }

    const blob = await response.blob();
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultBlob = blob;
    resultUrl = URL.createObjectURL(blob);
    resultTransformUrl = requestUrl;
    copyUrlButton.hidden = !resultTransformUrl;
    resultFilename = responseFilename(response, `smushed-image.${selectedFormat() === "jpeg" ? "jpg" : selectedFormat()}`);

    const headerWidth = Number(response.headers.get("x-image-width"));
    const headerHeight = Number(response.headers.get("x-image-height"));
    let dimensions = { width: headerWidth, height: headerHeight };
    if (!dimensions.width || !dimensions.height || dimensions.width < 0 || dimensions.height < 0) {
      dimensions = await getImageDimensions(blob).catch(() => ({ width: 0, height: 0 }));
    }

    outputInfo = {
      width: dimensions.width,
      height: dimensions.height,
      size: blob.size,
      type: blob.type,
    };

    const percent = sourceInfo.size > 0 ? Math.round((1 - blob.size / sourceInfo.size) * 100) : 0;
    if (percent > 0) {
      resultBadge.textContent = `${percent}% smaller`;
      resultSummary.textContent = `${formatBytes(sourceInfo.size)} → ${formatBytes(blob.size)}`;
    } else if (percent < 0) {
      resultBadge.textContent = `${Math.abs(percent)}% bigger`;
      resultSummary.textContent = `${formatBytes(sourceInfo.size)} → ${formatBytes(blob.size)}`;
    } else {
      resultBadge.textContent = "Ready";
      resultSummary.textContent = formatBytes(blob.size);
    }

    resultTab.disabled = false;
    resultBar.hidden = false;
    setView("result");
    showToast(`Image converted with Bun ${response.headers.get("x-bun-version") ?? "1.4"}.`);
  } catch (error) {
    showToast(error instanceof Error ? error.message : "The image could not be converted.", true);
  } finally {
    setBusy(false);
  }
});

downloadButton.addEventListener("click", () => {
  if (!resultUrl || !resultBlob) return;
  const anchor = document.createElement("a");
  anchor.href = resultUrl;
  anchor.download = resultFilename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
});

copyUrlButton.addEventListener("click", async () => {
  if (!resultTransformUrl) return;

  try {
    await navigator.clipboard.writeText(resultTransformUrl);
    showToast("Transformed image URL copied.");
  } catch {
    const copyTarget = document.createElement("textarea");
    copyTarget.value = resultTransformUrl;
    copyTarget.style.position = "fixed";
    copyTarget.style.opacity = "0";
    document.body.append(copyTarget);
    copyTarget.select();
    document.execCommand("copy");
    copyTarget.remove();
    showToast("Transformed image URL copied.");
  }
});

window.addEventListener("beforeunload", () => {
  if (originalUrl && originalUrlIsObject) URL.revokeObjectURL(originalUrl);
  if (resultUrl) URL.revokeObjectURL(resultUrl);
});

updateFormatSettings();
