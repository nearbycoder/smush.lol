/** Compare premultiplied RGBA so invisible RGB values do not count as differences. */
export function imageDifference(a: Uint8ClampedArray, b: Uint8ClampedArray, threshold: number, gain: number) {
  if (!a.length || a.length !== b.length || a.length % 4) throw new Error("Comparison buffers must have matching RGBA dimensions.");
  const heat = new Uint8ClampedArray(a.length); let absolute = 0, squared = 0, changedPixels = 0, maxChannelDelta = 0;
  for (let i = 0; i < a.length; i += 4) {
    let peak = 0;
    for (let c = 0; c < 4; c++) {
      const av = c === 3 ? a[i+c]! : a[i+c]! * a[i+3]! / 255;
      const bv = c === 3 ? b[i+c]! : b[i+c]! * b[i+3]! / 255;
      const delta = Math.abs(av-bv); absolute += delta; squared += delta*delta; peak = Math.max(peak,delta);
    }
    if (peak > threshold) changedPixels++;
    maxChannelDelta = Math.max(maxChannelDelta,peak);
    const intensity = Math.min(255,peak*gain);
    heat[i] = Math.min(255,intensity*2); heat[i+1] = Math.max(0,(intensity-128)*2); heat[i+3] = 255;
  }
  const pixels = a.length/4;
  return { heat, pixels, changedPixels, changedPercent: changedPixels/pixels*100, meanAbsoluteError: absolute/a.length, rootMeanSquareError: Math.sqrt(squared/a.length), maxChannelDelta };
}
