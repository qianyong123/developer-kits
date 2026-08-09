import { describe, expect, it } from 'vitest';
import { quantizeRgba } from '@/features/image-compressor/lib/quantize';

describe('palette cap', () => {
  it('never exceeds 256 palette entries (PNG PLTE limit)', async () => {
    const width = 32;
    const height = 32;
    const rgba = new Uint8ClampedArray(width * height * 4);

    let seed = 7;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = Math.floor(rand() * 256);
      rgba[i * 4 + 1] = Math.floor(rand() * 256);
      rgba[i * 4 + 2] = Math.floor(rand() * 256);
      rgba[i * 4 + 3] = 255;
    }

    const { paletteSize } = await quantizeRgba(rgba, width, height, {
      colors: 256,
      dither: 0.5,
      adaptive: false,
    });
    expect(paletteSize).toBeLessThanOrEqual(256);
  });
});
