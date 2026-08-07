import { describe, expect, it } from 'vitest';
import { readImageDimensions } from './imageInfo';

function makeFile(bytes: number[], name: string, type: string): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('readImageDimensions', () => {
  it('parses PNG dimensions', async () => {
    const bytes = [
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // signature
      0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, // IHDR
      0, 0, 0x10, 0, // width 4096
      0, 0, 0x08, 0, // height 2048
    ];
    const dims = await readImageDimensions(makeFile(bytes, 'a.png', 'image/png'));
    expect(dims).toEqual({ width: 4096, height: 2048 });
  });

  it('parses GIF and BMP dimensions', async () => {
    const gif = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x40, 0x01, 0x80, 0x00];
    expect(await readImageDimensions(makeFile(gif, 'a.gif', 'image/gif'))).toEqual({
      width: 320,
      height: 128,
    });

    const bmp = [0x42, 0x4d, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0x40, 0x01, 0, 0, 0x80, 0, 0, 0];
    expect(await readImageDimensions(makeFile(bmp, 'a.bmp', 'image/bmp'))).toEqual({
      width: 320,
      height: 128,
    });
  });

  it('parses WebP VP8X and VP8L dimensions', async () => {
    // RIFF + WEBP + chunk 头(8) + flags(1) + 宽高各 24bit(6) + 保留(3)
    const riff = (chunk: number[], w24: number[], h24: number[]): number[] => [
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, ...chunk, 0, 0, 0, 0, 0,
      ...w24, ...h24, 0, 0, 0,
    ];
    const vp8x = riff([0x56, 0x50, 0x38, 0x58], [0xff, 0x0f, 0], [0x7f, 0x07, 0]);
    expect(await readImageDimensions(makeFile(vp8x, 'a.webp', 'image/webp'))).toEqual({
      width: 4096,
      height: 1920,
    });

    // VP8L：5 字节头，宽度-1 14bit / 高度-1 14bit
    const vp8l = [
      0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50,
      0x56, 0x50, 0x38, 0x4c, 0, 0, 0, 0,
      0x2f, 0x1f, 0x80, 0x01, 0x00, // width-1=0x1f=31 → 32, height-1=6 → 7
    ];
    const dims = await readImageDimensions(makeFile(vp8l, 'b.webp', 'image/webp'));
    expect(dims).not.toBeNull();
    if (dims) {
      expect(dims.width).toBe(32);
      expect(dims.height).toBe(7);
    }
  });

  it('parses JPEG dimensions', async () => {
    const bytes = [
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0, 4, 0x4a, 0x46, 0x49, 0x46, // APP0
      0xff, 0xc0, 0, 17, 8, // SOF0, len 17, precision 8
      0x07, 0x80, // height 1920
      0x0f, 0xa0, // width 4000
      3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1, // rest of SOF
      0xff, 0xd9, // EOI
    ];
    const dims = await readImageDimensions(makeFile(bytes, 'a.jpg', 'image/jpeg'));
    expect(dims).toEqual({ width: 4000, height: 1920 });
  });

  it('returns null for unknown formats', async () => {
    expect(await readImageDimensions(makeFile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12], 'a.bin', 'text/plain'))).toBeNull();
  });
});
