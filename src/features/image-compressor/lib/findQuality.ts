/**
 * 在质量区间内二分，找到“体积不超过目标的最大质量”。
 * evaluate(quality) 返回该质量下的编码体积（字节）。
 */
export async function findBestQuality(
  evaluate: (quality: number) => Promise<number>,
  targetBytes: number,
  minQuality = 1,
  maxQuality = 100,
): Promise<{ quality: number; reachable: boolean }> {
  let best: number | null = null;
  let lo = minQuality;
  let hi = maxQuality;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const size = await evaluate(mid);
    if (size <= targetBytes) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best === null
    ? { quality: minQuality, reachable: false }
    : { quality: best, reachable: true };
}
