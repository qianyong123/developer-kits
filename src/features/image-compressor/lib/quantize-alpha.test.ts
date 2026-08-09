import { describe, expect, it } from 'vitest';
import { inflateSync } from 'node:zlib';
import { quantizeRgba } from '@/features/image-compressor/lib/quantize';

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

describe('transparent-majority images', () => {
  it('keeps opaque content when most pixels are transparent (no palette collapse)', async () => {
    const width = 64;
    const height = 64;
    const rgba = new Uint8ClampedArray(width * height * 4);
    // 约 75% 透明背景 + 25% 不透明深色内容块（类似透明 logo 场景）
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x;
        const inRect = x >= 8 && x < 56 && y >= 24 && y < 40;
        if (inRect) {
          rgba[i * 4] = 30;
          rgba[i * 4 + 1] = 60;
          rgba[i * 4 + 2] = 90;
          rgba[i * 4 + 3] = 255;
        } else {
          rgba[i * 4 + 3] = 0;
        }
      }
    }

    const { blob, paletteSize } = await quantizeRgba(rgba, width, height, {
      colors: 64,
      dither: 0.6,
      adaptive: false,
    });
    // 调色板必须同时包含透明和内容色，不能塌缩成 1 色
    expect(paletteSize).toBeGreaterThanOrEqual(2);

    // 解码输出，非透明像素比例应接近 25%（内容完整保留）
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const chunks = parseChunks(bytes);
    const ihdr = chunks.find((c) => c.type === 'IHDR')!.data;
    const w = readU32(ihdr, 0);
    const h = readU32(ihdr, 4);
    const idat = chunks.find((c) => c.type === 'IDAT')!.data;
    const trns = chunks.find((c) => c.type === 'tRNS')!.data;
    const inflated = inflateSync(idat);
    const opaqueCount = countOpaquePixels(inflated, w, h, trns);
    const opaquePct = (100 * opaqueCount) / (w * h);
    expect(opaquePct).toBeGreaterThan(18);
    expect(opaquePct).toBeLessThan(32);
  });
});

/** 解码索引色（color type 3）PNG 的滤波数据，统计不透明像素数。 */
function countOpaquePixels(raw: Uint8Array, width: number, height: number, trns: Uint8Array): number {
  const stride = 1 + width;
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * stride];
    const row = y * stride + 1;
    for (let x = 0; x < width; x++) {
      const cur = raw[row + x];
      const left = x > 0 ? out[y * width + x - 1] : 0;
      const up = y > 0 ? out[(y - 1) * width + x] : 0;
      const upleft = y > 0 && x > 0 ? out[(y - 1) * width + x - 1] : 0;
      let v = cur;
      if (filter === 1) v = (cur + left) & 0xff;
      else if (filter === 2) v = (cur + up) & 0xff;
      else if (filter === 3) v = (cur + ((left + up) >> 1)) & 0xff;
      else if (filter === 4) v = (cur + paeth(left, up, upleft)) & 0xff;
      out[y * width + x] = v & 0xff;
    }
  }
  let opaque = 0;
  for (let i = 0; i < out.length; i++) {
    const alpha = out[i] < trns.length ? trns[out[i]] : 255;
    if (alpha > 0) opaque++;
  }
  return opaque;
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

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
