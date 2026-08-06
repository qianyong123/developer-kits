import { describe, expect, it } from 'vitest';
import { quantizeRgba } from './quantize';

describe('adaptive palette size', () => {
  it('shrinks the palette for simple flat images', async () => {
    const width = 32;
    const height = 32;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const colors = [
      [255, 0, 0],
      [0, 255, 0],
      [0, 0, 255],
      [255, 255, 0],
    ];
    for (let i = 0; i < width * height; i++) {
      const [r, g, b] = colors[i % colors.length];
      rgba[i * 4] = r;
      rgba[i * 4 + 1] = g;
      rgba[i * 4 + 2] = b;
      rgba[i * 4 + 3] = 255;
    }

    const { paletteSize } = await quantizeRgba(rgba, width, height, { colors: 64, dither: 0.5 });
    expect(paletteSize).toBeLessThanOrEqual(5); // 1 透明 + 4 色
  });

  it('keeps a rich palette for noisy photo-like images', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8ClampedArray(width * height * 4);
    let seed = 42;
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

    const { paletteSize } = await quantizeRgba(rgba, width, height, { colors: 64, dither: 0.6 });
    expect(paletteSize).toBeGreaterThan(40);
  });
});
