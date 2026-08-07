export type OutputFormat = 'webp' | 'jpeg' | 'png';

export const MIME: Record<OutputFormat, string> = {
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
};

export const EXT: Record<OutputFormat, string> = {
  webp: 'webp',
  jpeg: 'jpg',
  png: 'png',
};

export type FormatOption = OutputFormat | 'original';

export function resolveOutputFormat(file: File, requested: FormatOption): OutputFormat {
  if (requested !== 'original') return requested;
  if (file.type === 'image/jpeg') return 'jpeg';
  if (file.type === 'image/webp') return 'webp';
  return 'png'; // png / gif / bmp 等统一转 PNG
}

export function supportsQuality(format: OutputFormat): boolean {
  return format !== 'png';
}

export function supportsMetadata(format: OutputFormat): boolean {
  return format === 'jpeg';
}

export interface EncodeOptions {
  format: OutputFormat;
  quality: number;
  maxEdge: number;
}

import { quantizeRgba } from './quantize';

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(file);
  } catch {
    return loadBitmapViaImage(file);
  }
}

async function loadBitmapViaImage(file: File): Promise<ImageBitmap> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('decode-failed'));
      img.src = url;
    });
    return await createImageBitmap(img);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function encodeBitmap(bitmap: ImageBitmap, opts: EncodeOptions): Promise<Blob> {
  const scale =
    opts.maxEdge > 0 ? Math.min(1, opts.maxEdge / Math.max(bitmap.width, bitmap.height)) : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-failed');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  // JPEG 不支持透明通道，填充白色背景
  if (opts.format === 'jpeg') {
    ctx.fillStyle = '#0b0d11'; // 与对比预览/缩略图背景一致
    ctx.fillRect(0, 0, width, height);
  }

  ctx.drawImage(bitmap, 0, 0, width, height);

  return canvasToBlob(canvas, MIME[opts.format], opts.quality);
}

export interface QuantizedPngOptions {
  maxEdge: number;
  colors: number;
  dither: number;
  /** 是否允许自适应颜色缩减（保真优先，固定传 false） */
  adaptive?: boolean;
}

/** 有损 PNG：调色板量化 + 抖动，输出索引色 PNG。 */
export async function encodeQuantizedPng(
  bitmap: ImageBitmap,
  opts: QuantizedPngOptions,
  onProgress?: (p: number) => void,
): Promise<{ blob: Blob; paletteSize: number }> {
  const scale = opts.maxEdge > 0 ? Math.min(1, opts.maxEdge / Math.max(bitmap.width, bitmap.height)) : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas-failed');

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);

  const imageData = ctx.getImageData(0, 0, width, height);
  return quantizeRgba(
    imageData.data,
    width,
    height,
    { colors: opts.colors, dither: opts.dither, adaptive: opts.adaptive },
    onProgress,
  );
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else if (mime === 'image/webp') reject(new Error('no-webp'));
        else reject(new Error('encode-failed'));
      },
      mime,
      quality / 100,
    );
  });
}
