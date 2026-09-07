export function fitRect(sw: number, sh: number, width: number, height: number, cover: boolean) { const scale = (cover ? Math.max : Math.min)(width / sw, height / sh); return { x: (width - sw * scale) / 2, y: (height - sh * scale) / 2, width: sw * scale, height: sh * scale }; }
export function fittedImage(image: CanvasImageSource, sw: number, sh: number, width: number, height: number, cover: boolean, background: string) {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height; const ctx = canvas.getContext("2d")!;
  if (background) { ctx.fillStyle = background; ctx.fillRect(0, 0, width, height); }
  const rect = fitRect(sw, sh, width, height, cover); ctx.drawImage(image, rect.x, rect.y, rect.width, rect.height); return canvas;
}
export function ico(images: Array<{ size: number; png: Uint8Array }>): Uint8Array<ArrayBuffer> {
  if (!images.length || images.length > 16 || images.some(i => !Number.isInteger(i.size) || i.size < 1 || i.size > 256)) throw new Error("Invalid icon dimensions.");
  const header = 6 + images.length * 16, result = new Uint8Array(header + images.reduce((sum, image) => sum + image.png.length, 0)), view = new DataView(result.buffer);
  view.setUint16(2, 1, true); view.setUint16(4, images.length, true); let offset = header;
  images.forEach((image, i) => { const at = 6 + i * 16; result[at] = result[at + 1] = image.size === 256 ? 0 : image.size; view.setUint16(at + 4, 1, true); view.setUint16(at + 6, 32, true); view.setUint32(at + 8, image.png.length, true); view.setUint32(at + 12, offset, true); result.set(image.png, offset); offset += image.png.length; }); return result;
}
