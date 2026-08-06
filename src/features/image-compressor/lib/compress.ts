import { attachMetadataIfNeeded } from './metadata';
import { encodeBitmap, encodeQuantizedPng, loadBitmap, resolveOutputFormat, supportsQuality, type OutputFormat } from './encoders';
import { PNG_DITHER, qualityToPngColors } from './quantize';
import { isAnimatedGif } from './imageInfo';
import type { CompressResult, CompressSettings } from './types';

/**
 * 在质量区间内二分，找到“体积不超过目标的最大质量”。
 * evaluate(quality) 返回该质量下的编码体积（字节）。
 */
export async function findBestQuality(
  evaluate: (quality: number) => Promise<number>,
  targetBytes: number,
  minQuality = 1,
  maxQuality = 100,
): Promise<{ quality: number; reachable: boolean }> {
  let best: number | null = null;
  let lo = minQuality;
  let hi = maxQuality;

  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    const size = await evaluate(mid);
    if (size <= targetBytes) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return best === null
    ? { quality: minQuality, reachable: false }
    : { quality: best, reachable: true };
}

export async function compressImage(
  file: File,
  settings: CompressSettings,
  onProgress?: (p: number) => void,
): Promise<CompressResult> {
  onProgress?.(0.05);
  const bitmap = await loadBitmap(file);
  onProgress?.(0.15);
  const format = resolveOutputFormat(file, settings.format);
  try {
    const useTargetSearch = settings.mode === 'target' && supportsQuality(format);
    const result = useTargetSearch
      ? await compressToTarget(bitmap, file, settings, format, onProgress)
      : await compressOnce(
          bitmap,
          file,
          settings,
          settings.mode === 'quality' ? settings.quality : 80,
          format,
          onProgress,
        );
    const isConverted =
      settings.format === 'original' &&
      format === 'png' &&
      (file.type === 'image/gif' || file.type === 'image/bmp');
    if (isConverted && !result.note) {
      result.note =
        file.type === 'image/gif' && (await isAnimatedGif(file))
          ? 'gif-animated'
          : 'converted-to-png';
    }
    // 压缩后反而变大：自动保留原图（GIF/BMP 转换场景除外，避免扩展名错乱）
    if (!isConverted && result.size > file.size) {
      URL.revokeObjectURL(result.url);
      return {
        blob: file,
        url: URL.createObjectURL(file),
        size: file.size,
        format: resolveOutputFormat(file, 'original'),
        note: 'kept-original',
      };
    }
    onProgress?.(1);
    return result;
  } finally {
    bitmap.close();
  }
}

async function compressToTarget(
  bitmap: ImageBitmap,
  file: File,
  settings: CompressSettings,
  format: OutputFormat,
  onProgress?: (p: number) => void,
): Promise<CompressResult> {
  const targetBytes = settings.targetKB * 1024;
  const cache = new Map<number, Blob>();

  const lossyPng = format === 'png';
  let searchIteration = 0;
  const encodeAt = async (quality: number): Promise<Blob> => {
    searchIteration += 1;
    onProgress?.(0.25 + 0.55 * (Math.min(searchIteration, 7) / 7));
    let blob = cache.get(quality);
    if (!blob) {
      blob = lossyPng
        ? (await encodeQuantizedPng(bitmap, {
            maxEdge: settings.maxEdge,
            colors: qualityToPngColors(quality),
            dither: PNG_DITHER,
            adaptive: true, // 目标体积模式 = 体积最小，允许自适应减色
          })).blob
        : await encodeBitmap(bitmap, { format, quality, maxEdge: settings.maxEdge });
      cache.set(quality, blob);
    }
    return blob;
  };

  const { quality, reachable } = await findBestQuality(
    async (q) => (await encodeAt(q)).size,
    targetBytes,
  );
  const encoded = await encodeAt(quality);
  const { blob, note } = await attachMetadataIfNeeded(
    encoded,
    file,
    format,
    settings.keepMetadata,
  );
  return makeResult(blob, format, quality, reachable ? note : 'cannot-reach');
}

async function compressOnce(
  bitmap: ImageBitmap,
  file: File,
  settings: CompressSettings,
  quality: number,
  format: OutputFormat,
  onProgress?: (p: number) => void,
): Promise<CompressResult> {
  let encoded: Blob;
  if (format === 'png') {
    // PNG 始终使用有损量化（调色板量化），正常压缩不做提示
    onProgress?.(0.22);
    const quantized = await encodeQuantizedPng(
      bitmap,
      {
        maxEdge: settings.maxEdge,
        colors: qualityToPngColors(quality),
        dither: PNG_DITHER,
        adaptive: false, // 手动质量模式 = 保真优先，不做自适应减色
      },
      (p) => onProgress?.(0.22 + p * 0.73),
    );
    encoded = quantized.blob;
    onProgress?.(0.97);
  } else {
    onProgress?.(0.35);
    encoded = await encodeBitmap(bitmap, { format, quality, maxEdge: settings.maxEdge });
    onProgress?.(0.95);
  }
  const { blob, note } = await attachMetadataIfNeeded(
    encoded,
    file,
    format,
    settings.keepMetadata,
  );
  return makeResult(blob, format, quality, note);
}

function makeResult(
  blob: Blob,
  format: OutputFormat,
  qualityUsed: number,
  note?: string,
): CompressResult {
  return {
    blob,
    url: URL.createObjectURL(blob),
    size: blob.size,
    format,
    qualityUsed,
    note,
  };
}
