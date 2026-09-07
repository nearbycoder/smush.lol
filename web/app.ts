import { mountToolbox } from "./toolbox";
import { mountHistory } from "./history";
import { mountMetadata } from "./metadata";
import { mountCollections } from "./collections";
import { mountEffects } from "./effect-editor";
import { localResponse, usesBrowser, safeSource } from "./local-image";
import { copyImage } from "./clipboard";
import { exportVariants } from "./export-variants";
import { loadRecipes, saveRecipe, writeRecipes } from "./recipes";
import { mountCropEditor } from "./crop-editor";
import { cropRect } from "./crop-geometry";
import { needsPreparation, prepareImage } from "./prepare-image";
import { formFields } from "./queue";
import { mountQueue } from "./queue-panel";
import { LatestRequest, responseDimensions } from "./requests";
import { exportPresets, savedSettings } from "./settings";

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
const compareTab = byId<HTMLButtonElement>("compare-tab");
const imageStage = byId<HTMLDivElement>("image-stage");
const comparisonResult = byId<HTMLDivElement>("comparison-result");
const comparisonImage = byId<HTMLImageElement>("comparison-image");
const comparisonDivider = byId<HTMLDivElement>("comparison-divider");
const comparisonControls = byId<HTMLDivElement>("comparison-controls");
const comparisonPosition = byId<HTMLInputElement>("comparison-position");
const saveSettingsButton = byId<HTMLButtonElement>("save-settings");
const useSettingsButton = byId<HTMLButtonElement>("use-settings");
const forgetSettingsButton = byId<HTMLButtonElement>("forget-settings");
const presetHint = byId<HTMLElement>("preset-hint");
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
let remoteSourceFile: File | null = null;
let originalUrl: string | null = null;
let originalUrlIsObject = false;
let resultUrl: string | null = null;
let resultBlob: Blob | null = null;
let resultTransformUrl: string | null = null;
let resultFilename = "smushed-image.webp";
let sourceInfo: ImageInfo = { width: 0, height: 0, size: 0, type: "image" };
let outputInfo: ImageInfo | null = null;
let currentView: "original" | "result" | "compare" = "original";
let ratioLocked = true;
let busy = false;
const sourceRequest = new LatestRequest();
const conversionRequest = new LatestRequest();
let resultSettings: string | null = null;
let toastTimer: number | undefined;
let editHistory: { reset(): void } | undefined;
let metadataInspector: { sourceChanged(): void } | undefined;

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 100 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

const queue = mountQueue(controls, showToast);
const effectEditor = mountEffects(controls, () => selectedFile ?? remoteSourceFile, showToast);
const cropEditor = mountCropEditor(() => originalUrl, showToast, updateCropSummary);
function updateCropSummary(): void {
  const cropped = Boolean(formFields(controls).cropRatio);
  const rect = sourceInfo.width ? cropRect(sourceInfo.width, sourceInfo.height, formFields(controls)) : null;
  byId("crop-summary").textContent = cropped
    ? `Crop applied${rect ? `: ${rect.width} × ${rect.height}px` : ""}. Queue images use the same ratio and relative position.`
    : "No crop. Cropping happens before resize and rotation.";
  byId<HTMLButtonElement>("crop-remove").disabled = !cropped;
}
byId("background-enabled").addEventListener("change", updateFormatSettings);

function acceptFiles(files: File[], queueOnly = false): void {
  if (!files.length) return;
  const valid = files.filter(file => isSupportedImage(file) && file.size <= MAX_FILE_BYTES);
  if (valid.length !== files.length) showToast("Skipped unsupported files or images over 15 MB.", true);
  if (!valid.length) return;
  if (valid.length > 1 || queueOnly) {
    try { queue.add(valid); showToast(`${valid.length} images added. Choose settings, then convert the queue.`); }
    catch (error) { showToast(error instanceof Error ? error.message : "Could not add images.", true); return; }
  }
  if (!queueOnly || (!selectedFile && !selectedRemoteUrl)) void loadFile(valid[0]!);
}

const queueInput = byId<HTMLInputElement>("queue-input");
byId("queue-add").addEventListener("click", () => { queueInput.value = ""; queueInput.click(); });
queueInput.addEventListener("change", () => acceptFiles(Array.from(queueInput.files ?? []), true));

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
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp|heic|heif|avif|tiff?|svg)$/i.test(file.name);
}

async function getImageDimensions(blob: Blob, existingUrl?: string): Promise<{ width: number; height: number }> {
  const url = existingUrl ?? URL.createObjectURL(blob);
  const image = new Image();
  image.src = url;

  try {
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight };
  } finally {
    if (!existingUrl) URL.revokeObjectURL(url);
  }
}

function clearResult(): void {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  resultUrl = null;
  resultBlob = null;
  resultSettings = null;
  resultTransformUrl = null;
  outputInfo = null;
  resultTab.disabled = true;
  compareTab.disabled = true;
  comparisonImage.removeAttribute("src");
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

function setView(view: "original" | "result" | "compare"): void {
  if (view !== "original" && (!resultUrl || !outputInfo)) return;
  currentView = view;
  const comparing = view === "compare";
  for (const [tab, name] of [[originalTab, "original"], [resultTab, "result"], [compareTab, "compare"]] as const) {
    tab.classList.toggle("active", view === name);
    tab.setAttribute("aria-selected", String(view === name));
    tab.tabIndex = view === name ? 0 : -1;
  }
  imageStage.setAttribute("aria-labelledby", `${view}-tab`);
  imageStage.classList.toggle("comparing", comparing);
  comparisonResult.hidden = !comparing;
  comparisonDivider.hidden = !comparing;
  comparisonControls.hidden = !comparing;
  if (comparing && comparisonImage.src !== resultUrl) comparisonImage.src = resultUrl!;
  previewImage.src = view === "result" ? (resultUrl ?? "") : (originalUrl ?? "");
  renderStats(view !== "original" && outputInfo ? outputInfo : sourceInfo);
}

comparisonPosition.addEventListener("input", () => {
  const position = Number(comparisonPosition.value);
  imageStage.style.setProperty("--comparison-position", `${position}%`);
  comparisonPosition.setAttribute("aria-valuetext", `${position}% original, ${100 - position}% result`);
});

for (const tab of [originalTab, resultTab, compareTab]) {
  tab.addEventListener("keydown", (event) => {
    const tabs = [originalTab, resultTab, compareTab].filter(item => !item.disabled);
    const index = tabs.indexOf(tab);
    const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index + tabs.length - 1) % tabs.length]
      : event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1) : null;
    if (!next) return;
    event.preventDefault();
    next.click();
    next.focus();
  });
}

async function loadFile(file: File): Promise<void> {
  const signal = sourceRequest.start();
  try { const safe = await safeSource(file); if (safe !== file) file = new File([safe], file.name, { type: safe.type }); } catch (error) { if (!signal.aborted) showToast((error as Error).message, true); return; }
  if (signal.aborted) return;
  if (!isSupportedImage(file)) {
    showToast("Choose a supported image file.", true);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    showToast("The image must be 15 MB or smaller.", true);
    return;
  }

  cropEditor.sourceChanged();
  effectEditor.sourceChanged();
  metadataInspector?.sourceChanged();
  editHistory?.reset();
  conversionRequest.cancel();
  setBusy(false);
  urlButton.disabled = false;
  urlButton.textContent = "Load";
  selectedFile = file;
  selectedRemoteUrl = null;
  remoteSourceFile = null;
  setOriginalUrl(URL.createObjectURL(file), true);
  clearResult();

  sourceInfo = {
    width: 0,
    height: 0,
    size: file.size,
    type: file.type || "image/unknown",
  };

  try {
    const dimensions = await getImageDimensions(file, originalUrl!);
    if (signal.aborted) return;
    sourceInfo.width = dimensions.width;
    sourceInfo.height = dimensions.height;
  } catch {
    if (signal.aborted) return;
    showToast("This format cannot be previewed in your browser. Bun.Image may still support it.");
  }

  sourceName.textContent = file.name;
  dropZone.hidden = true;
  previewShell.hidden = false;
  smushButton.disabled = busy;
  updateCropSummary();
  updateFormatSettings();
  controlHint.textContent = "Ready to convert. The original file will not be changed.";
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
  setWhenChanged("targetKB", "");
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
  if (byId<HTMLInputElement>("local-only").checked) { showToast("Choose a file from your device in browser-only mode.", true); return; }
  let source: string;
  try {
    source = normalizedRemoteUrl(value.trim());
  } catch (error) {
    showToast(error instanceof Error ? error.message : "Enter a valid public image URL.", true);
    return;
  }

  cropEditor.sourceChanged();
  effectEditor.sourceChanged();
  metadataInspector?.sourceChanged();
  editHistory?.reset();
  const signal = sourceRequest.start();
  conversionRequest.cancel();
  setBusy(false);
  urlButton.disabled = true;
  urlButton.textContent = "Loading…";

  try {
    const response = await fetch(`/api/source?${new URLSearchParams({ url: source })}`, { signal });
    if (!response.ok) throw await responseError(response, "The remote image could not be loaded.");

    const blob = await response.blob();
    const dimensions = responseDimensions(response) ?? await getImageDimensions(blob).catch(() => ({ width: 0, height: 0 }));
    if (signal.aborted) return;
    const previewUrl = URL.createObjectURL(blob);

    selectedFile = null;
    selectedRemoteUrl = source;
    remoteSourceFile = new File([blob], responseFilename(response, "remote-image"), { type: blob.type });
    setOriginalUrl(previewUrl, true);
    clearResult();
    sourceInfo = {
      width: dimensions.width,
      height: dimensions.height,
      size: blob.size,
      type: blob.type,
    };

    sourceName.textContent = remoteDisplayName(source);
    dropZone.hidden = true;
    previewShell.hidden = false;
    smushButton.disabled = busy;
    updateCropSummary();
    controlHint.textContent = "Ready to convert from the source URL.";
    setView("original");
  } catch (error) {
    if (!signal.aborted) showToast(error instanceof Error ? error.message : "The remote image could not be loaded.", true);
  } finally {
    if (!signal.aborted) {
      urlButton.disabled = false;
      urlButton.textContent = "Load";
    }
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
  acceptFiles(Array.from(fileInput.files ?? []));
});

urlForm.addEventListener("click", (event) => event.stopPropagation());
urlForm.addEventListener("submit", (event) => {
  event.preventDefault();
  event.stopPropagation();
  void loadRemoteImage(imageUrlInput.value);
});

replaceButton.addEventListener("click", () => {
  cropEditor.sourceChanged();
  effectEditor.sourceChanged();
  metadataInspector?.sourceChanged();
  editHistory?.reset();
  remoteSourceFile = null;
  sourceRequest.cancel();
  conversionRequest.cancel();
  setBusy(false);
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
  acceptFiles(Array.from(event.dataTransfer?.files ?? []));
});

document.addEventListener("paste", (event) => {
  const files = Array.from(event.clipboardData?.files ?? []).filter(isSupportedImage);
  if (files.length) {
    event.preventDefault();
    acceptFiles(files);
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
compareTab.addEventListener("click", () => setView("compare"));

lockRatioButton.addEventListener("click", () => {
  ratioLocked = !ratioLocked;
  lockRatioButton.classList.toggle("active", ratioLocked);
  lockRatioButton.setAttribute("aria-pressed", String(ratioLocked));
});

function sourceRatio(): number | null {
  if (!sourceInfo.width || !sourceInfo.height) return null;
  const rect = cropRect(sourceInfo.width, sourceInfo.height, formFields(controls));
  return rect.width / rect.height;
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

    const cropped = cropRect(sourceInfo.width, sourceInfo.height, formFields(controls));
    const scale = button.dataset.scale ? Number(button.dataset.scale) : null;
    const maxWidth = button.dataset.maxWidth ? Number(button.dataset.maxWidth) : null;
    const width = scale ? Math.round(cropped.width * scale) : Math.min(cropped.width, maxWidth ?? cropped.width);
    widthInput.value = String(width);
    heightInput.value = String(Math.max(1, Math.round((width / cropped.width) * cropped.height)));
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

function selectedFormat(): "webp" | "jpeg" | "png" | "avif" {
  const selected = controls.querySelector<HTMLInputElement>('input[name="format"]:checked');
  return selected?.value === "jpeg" || selected?.value === "png" || selected?.value === "avif" ? selected.value : "webp";
}

function updateFormatSettings(): void {
  const format = selectedFormat();
  const local = usesBrowser(selectedFile, formFields(controls));
  byId("local-encoding-note").hidden = !local;
  for (const name of ["progressive", "compressionLevel", "palette", "colors", "dither", "filter"]) controls.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)!.disabled = local;
  byId("background-settings").hidden = format !== "jpeg";
  byId<HTMLInputElement>("background-color").disabled = format !== "jpeg" || !byId<HTMLInputElement>("background-enabled").checked;
  const fixedQuality = format === "png" || (format === "webp" && controls.querySelector<HTMLInputElement>('input[name="lossless"]')!.checked);
  qualitySettings.hidden = fixedQuality;
  byId<HTMLInputElement>("target-size").disabled = fixedQuality;
  byId("target-hint").textContent = fixedQuality
    ? "Target size is available for JPEG and lossy WebP."
    : "Adjust quality to fit under this limit (1 KB = 1024 bytes). Smaller dimensions may be needed.";
  pngSettings.hidden = format !== "png";
  losslessRow.hidden = format !== "webp";
  progressiveRow.hidden = format !== "jpeg";
}

controls.querySelectorAll<HTMLInputElement>('input[name="format"]').forEach((input) => {
  input.addEventListener("change", updateFormatSettings);
});

controls.querySelector<HTMLInputElement>('input[name="lossless"]')!.addEventListener("change", updateFormatSettings);

paletteInput.addEventListener("change", () => {
  paletteOptions.hidden = !paletteInput.checked;
});

function refreshControls(): void {
  updateCropSummary();
  lockRatioButton.classList.toggle("active", ratioLocked);
  lockRatioButton.setAttribute("aria-pressed", String(ratioLocked));
  flopButton.setAttribute("aria-pressed", flopInput.value);
  flipButton.setAttribute("aria-pressed", flipInput.value);
  document.querySelectorAll<HTMLButtonElement>("[data-rotation]").forEach((button) => {
    button.classList.toggle("active", button.dataset.rotation === rotationInput.value);
  });
  paletteOptions.hidden = !paletteInput.checked;
  updateFormatSettings();
  for (const range of [brightnessInput, saturationInput, qualityInput, compressionInput, colorsInput]) {
    range.dispatchEvent(new Event("input"));
  }
}

function resetControls(): void {
  const localMode = byId<HTMLInputElement>("local-only").checked;
  controls.reset();
  byId<HTMLInputElement>("local-only").checked = localMode;
  widthInput.value = "";
  heightInput.value = "";
  ratioLocked = true;
  rotationInput.value = "0";
  for (const [key, value] of Object.entries({ cropRatio: "", cropScale: "100", cropX: "50", cropY: "50" })) {
    controls.querySelector<HTMLInputElement>(`input[name="${key}"]`)!.value = value;
  }
  controls.querySelector<HTMLInputElement>('[name="redactions"]')!.value = "[]";
  controls.querySelector<HTMLInputElement>('[name="watermarkLogo"]')!.value = "";
  byId("watermark-logo-note").textContent = "No logo. Text is used when no logo is selected.";
  flopInput.value = "false";
  flipInput.value = "false";
  advancedOptions.open = false;
  presetHint.textContent = "Start with a preset, then fine-tune below.";
  refreshControls();
}

function applyFields(fields: Record<string, string>): void {
  controls.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach(input => {
    const value = fields[input.name];
    if (value === undefined) return;
    if (input.name === "localOnly" && byId<HTMLInputElement>("local-only").checked) return;
    if (input.name === "background") {
      byId<HTMLInputElement>("background-enabled").checked = Boolean(value);
      input.value = value || "#ffffff";
      return;
    }
    if (input instanceof HTMLInputElement && input.type === "checkbox") input.checked = value === "true";
    else if (input instanceof HTMLInputElement && input.type === "radio") input.checked = input.value === value;
    else input.value = value;
  });
  refreshControls();
}

document.querySelectorAll<HTMLButtonElement>("[data-export-preset]").forEach(button => {
  button.addEventListener("click", () => {
    const preset = exportPresets[button.dataset.exportPreset as keyof typeof exportPresets];
    if (!preset) return;
    resetControls();
    applyFields(preset.fields);
    presetHint.textContent = preset.description;
    showToast(`${preset.label} settings applied. Convert when ready.`);
  });
});

const recipeSelect = byId<HTMLSelectElement>("recipe-select");
const recipeName = byId<HTMLInputElement>("recipe-name");
function refreshSavedSettings(selectedId = recipeSelect.value): void {
  try {
    const recipes = loadRecipes(localStorage);
    recipeSelect.replaceChildren(...recipes.map(recipe => new Option(recipe.name, recipe.id)));
    if (!recipes.length) recipeSelect.append(new Option("No saved recipes", ""));
    if (recipes.some(recipe => recipe.id === selectedId)) recipeSelect.value = selectedId;
    recipeSelect.disabled = useSettingsButton.disabled = forgetSettingsButton.disabled = recipes.length === 0;
  } catch {
    recipeSelect.disabled = useSettingsButton.disabled = forgetSettingsButton.disabled = true;
  }
}
recipeSelect.addEventListener("change", () => { recipeName.value = recipeSelect.selectedOptions[0]?.textContent ?? "My recipe"; });

saveSettingsButton.addEventListener("click", () => {
  if (!controls.reportValidity()) return;
  const fields: Record<string, string> = {};
  controls.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]").forEach(input => {
    if (input.disabled || (input instanceof HTMLInputElement && input.type === "radio" && !input.checked)) return;
    fields[input.name] = input instanceof HTMLInputElement && input.type === "checkbox" ? String(input.checked) : input.value;
  });
  try {
    const next = saveRecipe(loadRecipes(localStorage), recipeName.value, savedSettings(fields, ratioLocked));
    writeRecipes(localStorage, next.recipes);
    refreshSavedSettings(next.id);
    showToast("Recipe saved in this browser.");
  } catch (error) {
    showToast(error instanceof Error && !(error instanceof DOMException) ? error.message : "Recipes could not be saved. Browser storage may be unavailable.", true);
  }
});

useSettingsButton.addEventListener("click", () => {
  try {
    const recipe = loadRecipes(localStorage).find(recipe => recipe.id === recipeSelect.value);
    if (!recipe) { refreshSavedSettings(); showToast("Choose a saved recipe."); return; }
    resetControls();
    ratioLocked = recipe.settings.ratioLocked;
    applyFields(recipe.settings.fields);
    recipeName.value = recipe.name;
    recipeSelect.value = recipe.id;
    presetHint.textContent = `Recipe applied: ${recipe.name}`;
    showToast("Recipe applied. Convert when ready.");
  } catch { showToast("Browser storage is unavailable.", true); }
});

forgetSettingsButton.addEventListener("click", () => {
  try {
    writeRecipes(localStorage, loadRecipes(localStorage).filter(recipe => recipe.id !== recipeSelect.value));
    refreshSavedSettings();
    showToast("Recipe deleted.");
  } catch { showToast("Recipe could not be deleted.", true); }
});
window.addEventListener("storage", () => refreshSavedSettings());
refreshSavedSettings();

byId("queue-exports").addEventListener("click", () => {
  const file = selectedFile ?? remoteSourceFile;
  if (!file) { showToast("Choose an image before creating exports."); return; }
  if (!controls.reportValidity()) return;
  try {
    const variants = exportVariants(byId<HTMLInputElement>("export-widths").value,
      Array.from(controls.querySelectorAll<HTMLInputElement>("[data-export-format]:checked")).map(input => input.dataset.exportFormat!),
      byId<HTMLInputElement>("export-original").checked, formFields(controls));
    queue.addMany(variants.map(variant => ({ file, ...variant })));
    byId("queue-panel").scrollIntoView({ behavior: "smooth", block: "nearest" });
    showToast(`${variants.length} exports queued. Select Convert queue to begin.`);
  } catch (error) { showToast(error instanceof Error ? error.message : "Could not queue exports.", true); }
});

resetButton.addEventListener("click", () => {
  resetControls();
  showToast("Settings reset.");
});

function setBusy(nextBusy: boolean): void {
  busy = nextBusy;
  byId("operation-cancel").hidden = !nextBusy;
  if (!nextBusy) byId("operation-progress").textContent = "";
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

  const payload = new FormData(controls);
  const settingsKey = new URLSearchParams(Array.from(payload.entries()).filter((entry): entry is [string, string] => typeof entry[1] === "string")).toString();
  if (resultSettings === settingsKey && resultBlob) {
    setView("result");
    showToast("These settings are already converted. Your result is ready.");
    return;
  }
  const signal = conversionRequest.start();
  setBusy(true);

  try {
    const fields = formFields(controls);
    const local = usesBrowser(selectedFile, fields);
    const prepare = needsPreparation(fields);
    const requestUrl = selectedRemoteUrl && !prepare && !local ? remoteTransformUrl(selectedRemoteUrl, payload) : null;
    let response: Response;

    if (local) {
      const source = selectedFile ?? remoteSourceFile;
      if (!source) throw new Error("Choose a source image.");
      response = await localResponse(source, fields, signal);
    } else if (selectedFile || prepare) {
      const source = selectedFile ?? remoteSourceFile;
      if (!source) throw new Error("Reload the source image before converting.");
      const prepared = await prepareImage(source, fields, signal);
      payload.set("image", prepared, prepared.name);
      response = await fetch("/api/smush", {
        method: "POST",
        body: payload,
        signal,
      });
    } else {
      response = await fetch(requestUrl!, { signal });
    }

    if (!response.ok) {
      throw await responseError(response, "The image could not be converted.");
    }

    const blob = await response.blob();
    const dimensions = responseDimensions(response) ?? await getImageDimensions(blob).catch(() => ({ width: 0, height: 0 }));
    if (signal.aborted) return;
    resultSettings = settingsKey;
    comparisonImage.removeAttribute("src");
    if (resultUrl) URL.revokeObjectURL(resultUrl);
    resultBlob = blob;
    resultUrl = URL.createObjectURL(blob);
    resultTransformUrl = requestUrl;
    copyUrlButton.hidden = !resultTransformUrl;
    resultFilename = responseFilename(response, `smushed-image.${selectedFormat() === "jpeg" ? "jpg" : selectedFormat()}`);

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

    if (payload.get("targetKB")) resultSummary.textContent += ` · quality ${response.headers.get("x-image-quality") ?? "auto"}`;
    resultTab.disabled = false;
    compareTab.disabled = false;
    resultBar.hidden = false;
    setView("result");
    showToast(local ? "Converted entirely in your browser." : `Image converted with Bun ${response.headers.get("x-bun-version") ?? "1.4"}.`);
  } catch (error) {
    if (!signal.aborted) showToast(error instanceof Error ? error.message : "The image could not be converted.", true);
  } finally {
    if (!signal.aborted) setBusy(false);
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

byId<HTMLButtonElement>("copy-image-button").addEventListener("click", async () => {
  if (!resultBlob) return;
  const button = byId<HTMLButtonElement>("copy-image-button");
  button.disabled = true;
  try { await copyImage(resultBlob); showToast("Image copied as PNG."); }
  catch (error) { showToast(error instanceof Error && error.name !== "NotAllowedError" ? error.message : "Allow clipboard access or download the image instead.", true); }
  finally { button.disabled = false; }
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

resetControls();

byId("local-only").addEventListener("change", () => {
  conversionRequest.cancel();
  if (urlButton.textContent === "Loading…") { sourceRequest.cancel(); urlButton.disabled = false; urlButton.textContent = "Load"; }
  setBusy(false);
  for (const job of queue.jobs) if (job.status === "processing" || job.status === "queued") queue.cancel(job.id);
  updateFormatSettings();
});

controls.addEventListener("change", updateFormatSettings);
byId("operation-cancel").addEventListener("click", () => { conversionRequest.cancel(); setBusy(false); showToast("Conversion cancelled."); });
document.addEventListener("processing-progress", event => { byId("operation-progress").textContent = (event as CustomEvent<string>).detail; });

mountCollections(results => {
  if (queue.jobs.length) return queue.jobs.flatMap(job => results ? (job.result ? [{ name: job.result.filename, file: new File([job.result.blob], job.result.filename, { type: job.result.blob.type }) }] : []) : [{ name: job.file.name, file: job.file }]);
  if (results) return resultBlob ? [{ name: resultFilename, file: new File([resultBlob], resultFilename, { type: resultBlob.type }) }] : [];
  const file = selectedFile ?? remoteSourceFile;
  return file ? [{ name: file.name, file }] : [];
}, showToast);

metadataInspector = mountMetadata(result => result ? (resultBlob ? new File([resultBlob], resultFilename, { type: resultBlob.type }) : null) : selectedFile ?? remoteSourceFile);
editHistory = mountHistory(controls, () => {
  const fields: Record<string, string> = {};
  for (const input of Array.from(controls.querySelectorAll<HTMLInputElement | HTMLSelectElement>("input[name], select[name]"))) {
    if (input.name === "localOnly" || (input instanceof HTMLInputElement && input.type === "radio" && !input.checked)) continue;
    fields[input.name] = input instanceof HTMLInputElement && input.type === "checkbox" ? String(input.checked) : input.value;
  }
  return { fields, ratioLocked, background: byId<HTMLInputElement>("background-enabled").checked };
}, state => {
  conversionRequest.cancel(); setBusy(false);
  ratioLocked = state.ratioLocked;
  applyFields(state.fields);
  byId<HTMLInputElement>("background-enabled").checked = state.background;
  byId("watermark-logo-note").textContent = state.fields.watermarkLogo ? "Logo restored from editing history." : "No logo. Text is used when no logo is selected.";
  refreshControls();
});

mountToolbox(result => result ? (resultBlob ? new File([resultBlob], resultFilename, { type: resultBlob.type }) : null) : selectedFile ?? remoteSourceFile,
  result => { const files = queue.jobs.flatMap(job => result ? (job.result ? [new File([job.result.blob], job.result.filename, { type: job.result.blob.type })] : []) : [job.file]); const current = result ? (resultBlob ? new File([resultBlob], resultFilename, { type: resultBlob.type }) : null) : selectedFile ?? remoteSourceFile; return files.length ? files : current ? [current] : []; });

document.querySelectorAll<HTMLButtonElement>("[data-pixel-scale]").forEach(button => button.addEventListener("click", () => {
  if (!sourceInfo.width || !sourceInfo.height) { showToast("Choose an image before scaling pixels.", true); return; }
  if (["true", "on"].includes(formFields(controls).trimTransparent ?? "")) { showToast("For exact pixel scaling, export the trimmed image and load it first.", true); return; }
  const fields = formFields(controls), rect = cropRect(sourceInfo.width, sourceInfo.height, fields), scale = Number(button.dataset.pixelScale);
  const rotated = ["90", "270"].includes(fields.rotate || "0");
  const width = (rotated ? rect.height : rect.width) * scale, height = (rotated ? rect.width : rect.height) * scale;
  if (width > 12000 || height > 12000 || width * height > 48000000) { showToast("Choose a smaller scale: output is limited to 12,000px per side and 48 megapixels.", true); return; }
  widthInput.value = String(width); heightInput.value = String(height);
  controls.querySelector<HTMLInputElement>('[name="pixelArt"]')!.checked = true;
  controls.querySelector<HTMLInputElement>('[name="withoutEnlargement"]')!.checked = false;
  controls.querySelector<HTMLSelectElement>('[name="fit"]')!.value = "inside";
  controls.querySelector<HTMLInputElement>('[name="format"][value="png"]')!.checked = true;
  refreshControls(); showToast(`${scale}× pixel-art settings applied. Convert to update the result.`);
}));
