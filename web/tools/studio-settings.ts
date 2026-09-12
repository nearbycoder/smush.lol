/** Shared by the tool controls and worker so UI bounds and processing cannot drift. */
type NumericControl = { kind: "number"; key: string; label: string; min: number; max: number; initial: number; step: number };
type ColorControl = { kind: "color"; key: string; label: string; initial: string };
type ChoiceControl = { kind: "select"; key: string; label: string; initial: string; options: Record<string, string> };
export type StudioControl = NumericControl | ColorControl | ChoiceControl;
export interface StudioSpec { title: string; group: string; description: string; controls: StudioControl[]; geometry?: boolean }
const n = (key: string, label: string, min: number, max: number, initial: number, step = 1): NumericControl => ({ kind: "number", key, label, min, max, initial, step });
const c = (key: string, label: string, initial: string): ColorControl => ({ kind: "color", key, label, initial });
const s = (key: string, label: string, options: Record<string, string>, initial: string): ChoiceControl => ({ kind: "select", key, label, options, initial });
export const studioSpecs = {
  balance: { title: "White balance", group: "Photo corrections", description: "Warm or cool the image and correct green/magenta casts. These are creative RGB adjustments, not camera RAW color-temperature calibration.", controls: [n("temperature", "Temperature (cool → warm)", -100, 100, 15), n("tint", "Tint (green → magenta)", -100, 100, 0)] },
  gamma: { title: "Gamma correction", group: "Photo corrections", description: "Lift or darken midtones while keeping black and white endpoints. Values above 1 brighten the image.", controls: [n("gamma", "Gamma", 0.1, 5, 1.2, 0.1)] },
  tones: { title: "Shadows & highlights", group: "Photo corrections", description: "Brighten or darken shadows and highlights independently using smooth luminance masks. Clipped detail cannot be recovered.", controls: [n("shadows", "Shadows", -100, 100, 25), n("highlights", "Highlights", -100, 100, -20)] },
  levels: { title: "Black & white levels", group: "Photo corrections", description: "Remap a chosen input black point and white point to the full tonal range, with a midtone gamma adjustment.", controls: [n("black", "Input black point", 0, 254, 10), n("white", "Input white point", 1, 255, 245), n("gamma", "Midtone gamma", 0.1, 5, 1, 0.1)] },
  vibrance: { title: "Vibrance", group: "Photo corrections", description: "Boost muted colors more than already vivid colors, or reduce color intensity. Neutral grays remain neutral.", controls: [n("amount", "Vibrance", -100, 100, 35)] },
  hue: { title: "Hue shift", group: "Photo corrections", description: "Rotate colors around the hue wheel while retaining HSL lightness and saturation.", controls: [n("angle", "Hue rotation (degrees)", -180, 180, 30)] },
  replace: { title: "Replace a color", group: "Color & transparency", description: "Replace pixels near a chosen RGB color with a new color. Tolerance selects nearby colors and softness blends the transition.", controls: [c("from", "Color to replace", "#ff0000"), c("to", "Replacement color", "#0066ff"), n("tolerance", "Color distance tolerance (%)", 0, 100, 15), n("softness", "Transition softness (%)", 0, 100, 10)] },
  key: { title: "Color-key transparency", group: "Color & transparency", description: "Remove a flat background color with adjustable tolerance and soft edges. Existing transparency is preserved; matching foreground colors are also removed.", controls: [c("from", "Color to remove", "#00ff00"), n("tolerance", "Color distance tolerance (%)", 0, 100, 15), n("softness", "Transition softness (%)", 0, 100, 10)] },
  opacity: { title: "Image opacity", group: "Color & transparency", description: "Reduce the opacity of the entire image. Download as PNG to preserve the resulting transparency.", controls: [n("amount", "Opacity (%)", 0, 100, 60)] },
  vignette: { title: "Vignette", group: "Creative effects", description: "Darken or brighten the edges around the image center with a smooth elliptical falloff.", controls: [n("amount", "Edge darkening (negative brightens)", -100, 100, 55), n("radius", "Clear center radius (%)", 0, 95, 35)] },
  grain: { title: "Film grain", group: "Creative effects", description: "Add reproducible monochrome grain. The seed keeps a texture consistent between runs; change it for a new pattern.", controls: [n("amount", "Grain strength (%)", 0, 100, 15), n("seed", "Texture seed", 1, 65535, 42)] },
  pixelate: { title: "Pixelate image", group: "Creative effects", description: "Average colors into square blocks, weighted by transparency. This is a visual effect; use solid redaction to conceal sensitive content.", controls: [n("size", "Block size (pixels)", 1, 256, 16)] },
  posterize: { title: "Posterize", group: "Creative effects", description: "Reduce each RGB channel to a selected number of tonal levels for a flat graphic look.", controls: [n("levels", "Levels per channel", 2, 32, 5)] },
  threshold: { title: "Black & white threshold", group: "Creative effects", description: "Convert luminance into pure black or white for a stencil effect while retaining transparency.", controls: [n("threshold", "White threshold (0–255)", 0, 255, 128)] },
  edges: { title: "Edge detection", group: "Creative effects", description: "Create a grayscale Sobel edge map with adjustable gain. Transparent neighbors are excluded from color edges.", controls: [n("amount", "Edge gain", 0.1, 5, 1, 0.1)] },
  emboss: { title: "Emboss", group: "Creative effects", description: "Create a raised grayscale relief from diagonal luminance changes. Flat areas become mid-gray.", controls: [n("amount", "Relief strength", 0.1, 5, 1, 0.1)] },
  straighten: { title: "Straighten image", group: "Layout & composition", geometry: true, description: "Rotate by a precise angle. Expand keeps all corners on a transparent canvas; keep size clips the rotated edges.", controls: [n("angle", "Rotation (degrees)", -45, 45, 2, 0.1), s("canvas", "Canvas", { expand: "Expand to keep corners", keep: "Keep original size" }, "expand")] },
  reflection: { title: "Mirrored reflection", group: "Layout & composition", geometry: true, description: "Extend the image with a flipped reflection below or to the right, with adjustable gap, opacity, and fade to transparency.", controls: [s("direction", "Reflect toward", { bottom: "Below", right: "Right" }, "bottom"), n("gap", "Gap (pixels)", 0, 256, 12), n("opacity", "Reflection opacity (%)", 0, 100, 65), n("fade", "Fade to transparent (%)", 0, 100, 80)] },
  pattern: { title: "Repeating pattern", group: "Layout & composition", geometry: true, description: "Repeat the image at its original pixel size in a grid. Alternate mirrored tiles for a kaleidoscope effect; this does not repair seams in a source texture.", controls: [n("columns", "Columns", 1, 8, 2), n("rows", "Rows", 1, 8, 2), s("mirror", "Tile orientation", { no: "Repeat original", yes: "Alternate mirrored tiles" }, "no")] },
  shadow: { title: "Drop shadow", group: "Layout & composition", geometry: true, description: "Add a colored shadow behind the image alpha silhouette. The canvas expands for offsets and blur; transparent cutouts create shaped shadows.", controls: [n("x", "Horizontal offset (pixels)", -256, 256, 16), n("y", "Vertical offset (pixels)", -256, 256, 16), n("blur", "Shadow blur (pixels)", 0, 80, 16), n("opacity", "Shadow opacity (%)", 0, 100, 50), c("color", "Shadow color", "#000000")] },
} satisfies Record<string, StudioSpec>;
export type StudioKind = keyof typeof studioSpecs;
export type StudioValues = Record<string, string>;
export function validateStudio(kind: StudioKind, fields: StudioValues): StudioValues {
  if (!Object.hasOwn(studioSpecs, kind)) throw new Error("Unknown image tool.");
  const result: StudioValues = {};
  for (const control of studioSpecs[kind].controls as StudioControl[]) {
    const value = fields[control.key] ?? String(control.initial);
    if (control.kind === "number") {
      const numeric = Number(value);
      if (!value.trim() || !Number.isFinite(numeric) || numeric < control.min || numeric > control.max || (control.step === 1 && !Number.isInteger(numeric))) throw new Error(`${control.label}: choose ${control.step === 1 ? "a whole number" : "a number"} from ${control.min} to ${control.max}.`);
    } else if (control.kind === "color") {
      if (!/^#[\da-f]{6}$/i.test(value)) throw new Error(`${control.label}: choose a valid color.`);
    } else if (!Object.hasOwn(control.options, value)) throw new Error(`${control.label}: choose an available option.`);
    result[control.key] = value;
  }
  if (kind === "levels" && Number(result.black) >= Number(result.white)) throw new Error("The black point must be lower than the white point.");
  return result;
}
export function studioSize(width: number, height: number) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width > 12000 || height > 12000 || width * height > 12000000) throw new Error("These tools support up to 12 megapixels and 12,000px per side. Resize first or reduce the layout dimensions.");
  return { width, height };
}
