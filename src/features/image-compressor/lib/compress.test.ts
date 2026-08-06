import { describe, expect, it } from 'vitest';
import { findBestQuality } from './compress';

describe('findBestQuality', () => {
  it('finds the highest quality whose size fits the target', async () => {
    // 体积随质量线性增大：size(q) = 100 * q
    const result = await findBestQuality(async (q) => 100 * q, 2000);
    expect(result.reachable).toBe(true);
    expect(result.quality).toBe(20);
  });

  it('returns lowest quality and unreachable flag when the target cannot be met', async () => {
    const result = await findBestQuality(async () => 5000, 200);
    expect(result.reachable).toBe(false);
    expect(result.quality).toBe(1);
  });
});
