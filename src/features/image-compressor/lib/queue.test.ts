import { describe, expect, it } from 'vitest';
import { runPool } from './queue';

describe('runPool', () => {
  it('processes every item while respecting the concurrency limit', async () => {
    const items = [1, 2, 3, 4, 5];
    const done: number[] = [];
    let active = 0;
    let maxActive = 0;

    await runPool(
      items,
      async (n) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        done.push(n);
        active -= 1;
      },
      2,
    );

    expect(done.sort((a, b) => a - b)).toEqual(items);
    expect(maxActive).toBeLessThanOrEqual(2);
  });
});
