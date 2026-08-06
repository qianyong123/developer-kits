import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { qualityToPngColors, quantizeRgba } from './quantize';

describe('qualityToPngColors', () => {
  it('maps quality to palette size within 16..256', () => {
    expect(qualityToPngColors(1)).toBe(16);
    expect(qualityToPngColors(100)).toBe(256);
    expect(qualityToPngColors(55)).toBeGreaterThanOrEqual(16);
    expect(qualityToPngColors(55)).toBeLessThanOrEqual(256);
  });
});

describe('quantizeRgba', () => {
  it('produces a valid indexed PNG with expected dimensions and palette', async () => {
    const width = 8;
    const height = 8;
    const rgba = new Uint8ClampedArray(width * height * 4);
    for (let i = 0; i < width * height; i++) {
      const shade = (i % 4) * 60;
      rgba[i * 4] = shade;
      rgba[i * 4 + 1] = 200;
      rgba[i * 4 + 2] = 100;
      rgba[i * 4 + 3] = 255;
    }

    const { blob, paletteSize } = await quantizeRgba(rgba, width, height, {
      colors: 32,
      dither: 0.5,
    });
    expect(paletteSize).toBeGreaterThanOrEqual(2);
    expect(paletteSize).toBeLessThanOrEqual(33); // 1 透明 + 32 色

    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(Array.from(bytes.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);

    const chunks = parseChunks(bytes);
    const types = chunks.map((c) => c.type);
    expect(types).toEqual(['IHDR', 'PLTE', 'tRNS', 'IDAT', 'IEND']);

    const ihdr = chunks.find((c) => c.type === 'IHDR')!.data;
    expect(readU32(ihdr, 0)).toBe(width);
    expect(readU32(ihdr, 4)).toBe(height);
    expect(ihdr[8]).toBe(8);
    expect(ihdr[9]).toBe(3);

    const plte = chunks.find((c) => c.type === 'PLTE')!.data;
    expect(plte.length % 3).toBe(0);
    expect(plte.length / 3).toBe(paletteSize);

    const trns = chunks.find((c) => c.type === 'tRNS')!.data;
    expect(trns.length).toBe(paletteSize);
    // 全不透明图片：所有调色板条目 alpha 应为 255
    expect(trns.every((v) => v === 255)).toBe(true);

    const idat = chunks.find((c) => c.type === 'IDAT')!.data;
    const inflated = inflateSync(idat);
    expect(inflated.length).toBe(height * (1 + width));
  });

  it('handles fully transparent images', async () => {
    const width = 4;
    const height = 4;
    const rgba = new Uint8ClampedArray(width * height * 4).fill(0);

    const { blob, paletteSize } = await quantizeRgba(rgba, width, height, {
      colors: 32,
      dither: 0,
    });
    expect(paletteSize).toBe(1);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = parseChunks(bytes);
    expect(chunks.find((c) => c.type === 'PLTE')!.data.length / 3).toBe(1);
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
