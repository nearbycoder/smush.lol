export function alphaBounds(data: Uint8ClampedArray, width: number, height: number, threshold = 0, padding = 0) {
  let left = width, top = height, right = -1, bottom = -1;
  const rowStride = width * 4;
  for (let y = 0; y < height; y++) {
    const rowBase = y * rowStride + 3;
    let rowHit = false;
    for (let x = 0; x < width; x++) {
      if (data[rowBase + x * 4]! <= threshold) continue;
      if (x < left) left = x;
      if (x > right) right = x;
      rowHit = true;
    }
    if (rowHit) {
      if (y < top) top = y;
      bottom = y;
    }
  }
  if (right < 0) throw new Error("No pixels exceed the alpha threshold. Lower the threshold or turn trimming off.");
  left = Math.max(0, left - padding); top = Math.max(0, top - padding);
  right = Math.min(width - 1, right + padding); bottom = Math.min(height - 1, bottom + padding);
  return { x: left, y: top, width: right - left + 1, height: bottom - top + 1 };
}
