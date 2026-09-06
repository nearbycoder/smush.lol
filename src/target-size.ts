/** Bounded quality search. Every returned candidate is actually below the limit. */
export async function fitTargetSize<T extends { output: Blob }>(
  maxQuality: number, targetBytes: number, encode: (quality: number) => Promise<T>,
): Promise<T & { quality: number }> {
  const original = await encode(maxQuality);
  if (original.output.size <= targetBytes) return { ...original, quality: maxQuality };
  const smallest = maxQuality === 1 ? original : await encode(1);
  if (smallest.output.size > targetBytes) {
    throw new Error("This image cannot reach the target size at these dimensions. Reduce its width or height, or choose a larger target.");
  }
  let best = { ...smallest, quality: 1 };
  let low = 2;
  let high = maxQuality - 1;
  while (low <= high) {
    const quality = Math.floor((low + high) / 2);
    const candidate = await encode(quality);
    if (candidate.output.size <= targetBytes) {
      best = { ...candidate, quality };
      low = quality + 1;
    } else high = quality - 1;
  }
  return best;
}
