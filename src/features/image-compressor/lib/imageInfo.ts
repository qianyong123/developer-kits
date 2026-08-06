/**
 * 不解码整图，只读文件头解析图片尺寸，用于超大图前置检查。
 */

export interface ImageDimensions {
  width: number;
  height: number;
}

/** 单边最大像素（现代浏览器 canvas 上限约 16384） */
export const MAX_IMAGE_SIDE = 16_384;
/** 总像素上限（约 1 亿像素） */
export const MAX_IMAGE_PIXELS = 100_000_000;
/** 单文件大小上限 */
export const MAX_FILE_SIZE = 100 * 1024 * 1024;

const HEAD_SIZE = 512 * 1024;

export async function readImageDimensions(file: File): Promise<ImageDimensions | null> {
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, HEAD_SIZE)).arrayBuffer());
    if (head.length < 10) return null;

    // PNG：签名 8 字节 + IHDR，宽高在偏移 16/20
    if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47) {
      if (head.length < 24) return null;
      return { width: readU32BE(head, 16), height: readU32BE(head, 20) };
    }

    // GIF：宽高在偏移 6/8（小端）
    if (head[0] === 0x47 && head[1] === 0x49 && head[2] === 0x46) {
      return { width: head[6] | (head[7] << 8), height: head[8] | (head[9] << 8) };
    }

    // BMP：'BM'，宽在 18、高在 22（有符号，可为负表示自顶向下）
    if (head[0] === 0x42 && head[1] === 0x4d) {
      if (head.length < 26) return null;
      const width = readU32LE(head, 18);
      const rawH = readU32LE(head, 22);
      const height = rawH > 0x7fffffff ? rawH - 0x100000000 : rawH;
      return { width, height: Math.abs(height) };
    }

    // WebP：'RIFF' + 'WEBP'
    if (
      head[0] === 0x52 &&
      head[1] === 0x49 &&
      head[2] === 0x46 &&
      head[3] === 0x46 &&
      head[8] === 0x57
    ) {
      const chunk = String.fromCharCode(head[12], head[13], head[14], head[15]);
      if (chunk === 'VP8X' && head.length >= 30) {
        return {
          width: 1 + (head[21] | (head[22] << 8) | (head[23] << 16)),
          height: 1 + (head[24] | (head[25] << 8) | (head[26] << 16)),
        };
      }
      if (chunk === 'VP8 ' && head.length >= 30) {
        const width = (head[26] | ((head[27] & 0x3f) << 8)) & 0x3fff;
        const height = (head[28] | ((head[29] & 0x3f) << 8)) & 0x3fff;
        return { width, height };
      }
      if (chunk === 'VP8L' && head.length >= 25) {
        const bits = head[21] | (head[22] << 8) | (head[23] << 16) | (head[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      return null;
    }

    // JPEG：SOI + 扫描段直到 SOF
    if (head[0] === 0xff && head[1] === 0xd8) {
      return parseJpegDimensions(head);
    }

    return null;
  } catch {
    return null;
  }
}

function parseJpegDimensions(head: Uint8Array): ImageDimensions | null {
  let offset = 2;
  while (offset + 9 <= head.length) {
    if (head[offset] !== 0xff) {
      offset += 1;
      continue;
    }
    const marker = head[offset + 1];
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = (head[offset + 2] << 8) | head[offset + 3];
    if (length < 2) return null;
    const isSof =
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc;
    if (isSof) {
      return {
        height: (head[offset + 5] << 8) | head[offset + 6],
        width: (head[offset + 7] << 8) | head[offset + 8],
      };
    }
    offset += 2 + length;
  }
  return null;
}

/** 检测 GIF 是否含动画控制块（NETSCAPE2.0 扩展）。 */
export async function isAnimatedGif(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, Math.min(file.size, HEAD_SIZE)).arrayBuffer());
    const needle = [0x4e, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2e, 0x30];
    for (let i = 0; i + needle.length <= head.length; i++) {
      let ok = true;
      for (let j = 0; j < needle.length; j++) {
        if (head[i + j] !== needle[j]) {
          ok = false;
          break;
        }
      }
      if (ok) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function readU32BE(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function readU32LE(bytes: Uint8Array, offset: number): number {
  return (
    (bytes[offset] |
      (bytes[offset + 1] << 8) |
      (bytes[offset + 2] << 16) |
      (bytes[offset + 3] << 24)) >>>
    0
  );
}
