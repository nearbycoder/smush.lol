export interface NamingOptions { template: string; start: number }
export function namingOptions(template: string, start: number): NamingOptions {
  template = template.trim();
  if (template.length > 100 || /[\\/:*?"<>|\x00-\x1f]/.test(template)) throw new Error("Use a filename pattern under 100 characters without path or reserved characters.");
  if (/[{}]/.test(template.replace(/\{(?:name|n|format|variant)\}/g, ""))) throw new Error("Supported tokens are {name}, {n}, {format}, and {variant}.");
  if (!Number.isInteger(start) || start < 1 || start > 999949) throw new Error("Starting number must be an integer from 1 to 999949.");
  return { template, start };
}
const safeStem = (value: string) => value.replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^\.+|\.+$/g,"") || "image";
export function batchFilename(template: string, original: string, sequence: number, format: string, variant = "", fallback?: string): string {
  namingOptions(template, Math.min(sequence, 999949));
  format = format === "jpeg" ? "jpg" : format.toLowerCase();
  if (!/^(?:png|jpg|webp|avif)$/.test(format)) throw new Error("Choose a supported output format for filenames.");
  const name = safeStem(original.replace(/\.[^.]+$/, ""));
  if (!template.trim()) {
    const defaultName = fallback || `smushed-${name}.${format}`;
    const dot = defaultName.lastIndexOf(".");
    return variant ? `${defaultName.slice(0,dot)}-${safeStem(variant)}${defaultName.slice(dot)}` : defaultName;
  }
  const tokens: Record<string,string> = { name, n: String(sequence).padStart(3,"0"), format, variant: safeStem(variant || "original") };
  let stem = safeStem(template.replace(/\{(name|n|format|variant)\}/g,(_,key:string)=>tokens[key]!));
  if (variant && !template.includes("{variant}")) stem += `-${safeStem(variant)}`;
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(stem)) stem = `image-${stem}`;
  return `${stem.slice(0,180)}.${format}`;
}
