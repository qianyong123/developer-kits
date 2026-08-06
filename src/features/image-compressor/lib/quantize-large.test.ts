import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { quantizeRgba } from './quantize';

describe('quantizeRgba large image', () => {
  it('handles a 512x512 image with chunked progress and valid output', async () => {
    const width = 512;
    const height = 512;
    const rgba = new Uint8ClampedArray(width * height * 4);

    let seed = 12345;
    const rand = () => {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      return seed / 0x7fffffff;
    };
    for (let i = 0; i < width * height; i++) {
      rgba[i * 4] = Math.floor(rand() * 256);
      rgba[i * 4 + 1] = Math.floor(rand() * 256);
      rgba[i * 4 + 2] = Math.floor(rand() * 256);
      rgba[i * 4 + 3] = rand() > 0.1 ? 255 : 0;
    }

    const progresses: number[] = [];
    const { blob, paletteSize } = await quantizeRgba(
      rgba,
      width,
      height,
      { colors: 64, dither: 0.6 },
      (p) => progresses.push(p),
    );

    expect(paletteSize).toBeGreaterThanOrEqual(2);
    expect(paletteSize).toBeLessThanOrEqual(65);
    expect(progresses.length).toBeGreaterThan(1);
    expect(progresses[progresses.length - 1]).toBe(1);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    let offset = 8;
    while (offset < bytes.length) {
      const length = readU32(bytes, offset);
      const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
      if (type === 'IDAT') {
        const inflated = inflateSync(bytes.slice(offset + 8, offset + 8 + length));
        expect(inflated.length).toBe(height * (1 + width));
      }
      offset += 12 + length;
    }
  });
});

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}
