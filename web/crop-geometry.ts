export function browserFields(fields: Record<string, string>): Record<string, string> {
  const ratio = fields.cropRatio ?? "";
  if (ratio && ratio !== "original" && (!Number.isFinite(Number(ratio)) || Number(ratio) < 0.01 || Number(ratio) > 100)) {
    throw new Error("Choose a crop ratio between 1:100 and 100:1.");
  }
  const number = (key: string, fallback: number, min: number) => {
    const value = Number(fields[key] || fallback);
    if (!Number.isFinite(value) || value < min || value > 100) throw new Error("Crop position and area must be valid percentages.");
    return String(value);
  };
  const background = fields.background ?? "";
  if (background && !/^#[\da-f]{6}$/i.test(background)) throw new Error("Choose a valid background color.");
  return { cropRatio: ratio, cropScale: number("cropScale", 100, 1), cropX: number("cropX", 50, 0), cropY: number("cropY", 50, 0), background };
}

export function cropRect(width: number, height: number, fields: Record<string, string>) {
  if (!fields.cropRatio) return { x: 0, y: 0, width, height };
  const values = browserFields(fields);
  const ratio = values.cropRatio === "original" ? width / height : Number(values.cropRatio);
  const scale = Number(values.cropScale) / 100;
  const cropWidth = Math.max(1, Math.min(width, Math.round(Math.min(width, height * ratio) * scale)));
  const cropHeight = Math.max(1, Math.min(height, Math.round(Math.min(height, width / ratio) * scale)));
  return {
    x: Math.round((width - cropWidth) * Number(values.cropX) / 100),
    y: Math.round((height - cropHeight) * Number(values.cropY) / 100),
    width: cropWidth, height: cropHeight,
  };
}
