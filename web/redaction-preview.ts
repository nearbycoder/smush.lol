/** Redaction coordinates refer to the resized image before borders/corner masking. */
export function redactionPreviewFields(fields: Record<string,string>): Record<string,string> {
  const enabled = (key: string) => ["true", "on"].includes(fields[key] ?? "");
  return {
    ...fields,
    // Background removal changes trim bounds, so this combination must preview the cutout.
    removeBackground: String(enabled("removeBackground") && enabled("trimTransparent")),
    borderSize: "0", cornerRadius: "0", redactions: "[]", watermarkText: "", watermarkLogo: "",
    width: "1000", height: "650", fit: "inside", withoutEnlargement: "true",
  };
}
