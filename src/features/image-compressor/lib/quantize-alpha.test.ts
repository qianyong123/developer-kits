import { describe, expect, it } from 'vitest';
import { quantizeRgba } from './quantize';

describe('semi-transparent glow', () => {
  it('preserves partial alpha in the palette (tRNS contains intermediate values)', async () => {
    const width = 32;
    const height = 32;
    const rgba = new Uint8ClampedArray(width * height * 4);
    const cx = 15.5;
    const cy = 15.5;

    // 径向光晕：中心不透明，向外 alpha 平滑衰减到 0
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const d = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2);
        const a = Math.max(0, Math.min(255, Math.round(255 - d * 12)));
        const i = y * width + x;
        rgba[i * 4] = 80;
        rgba[i * 4 + 1] = 120;
        rgba[i * 4 + 2] = 255;
        rgba[i * 4 + 3] = a;
      }
    }

    const { blob, paletteSize } = await quantizeRgba(rgba, width, height, {
      colors: 64,
      dither: 0.6,
      adaptive: false,
    });
    expect(paletteSize).toBeGreaterThanOrEqual(2);
    expect(paletteSize).toBeLessThanOrEqual(64);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = parseChunks(bytes);
    const trns = chunks.find((c) => c.type === 'tRNS')!.data;
    const hasIntermediateAlpha = Array.from(trns).some((v) => v > 0 && v < 255);
    expect(hasIntermediateAlpha).toBe(true);
  });
});

interface Chunk {
  type: string;
  data: Uint8Array;
}

function parseChunks(bytes: Uint8Array): Chunk[] {
  const chunks: Chunk[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const length = readU32(bytes, offset);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    chunks.push({ type, data: bytes.slice(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

function readU32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}
