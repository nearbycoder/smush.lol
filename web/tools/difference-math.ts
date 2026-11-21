/** Compare premultiplied RGBA so invisible RGB values do not count as differences. */
export function imageDifference(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold: number, gain: number) {
  const len = a.length;
  if (!len || len !== b.length || len % 4) throw new Error("Comparison buffers must have matching RGBA dimensions.");
  const heat = new Uint8ClampedArray(len);
  const inv255 = 1 / 255;
  let absolute = 0, squared = 0, changedPixels = 0, maxChannelDelta = 0;
  for (let i = 0; i < len; i += 4) {
    const aa = a[i + 3]!, ba = b[i + 3]!;
    const aaNorm = aa * inv255, baNorm = ba * inv255;
    const dr = Math.abs(a[i]! * aaNorm - b[i]! * baNorm);
    const dg = Math.abs(a[i + 1]! * aaNorm - b[i + 1]! * baNorm);
    const db = Math.abs(a[i + 2]! * aaNorm - b[i + 2]! * baNorm);
    const da = Math.abs(aa - ba);
    absolute += dr + dg + db + da;
    squared += dr * dr + dg * dg + db * db + da * da;
    let peak = dr > dg ? dr : dg;
    if (db > peak) peak = db;
    if (da > peak) peak = da;
    if (peak > threshold) changedPixels++;
    if (peak > maxChannelDelta) maxChannelDelta = peak;
    const rawIntensity = peak * gain;
    const intensity = rawIntensity > 255 ? 255 : rawIntensity;
    heat[i] = intensity * 2;
    heat[i + 1] = intensity > 128 ? (intensity - 128) * 2 : 0;
    heat[i + 3] = 255;
  }
  const pixels = len / 4;
  return { heat, pixels, changedPixels, changedPercent: changedPixels / pixels * 100, meanAbsoluteError: absolute / len, rootMeanSquareError: Math.sqrt(squared / len), maxChannelDelta };
}
