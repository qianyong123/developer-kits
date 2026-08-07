import { attachMetadataIfNeeded } from './metadata';
import { encodeBitmap, encodeQuantizedPng, loadBitmap, resolveOutputFormat, type OutputFormat } from './encoders';
import { PNG_DITHER, qualityToPngColors } from './quantize';
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
    const result = await compressOnce(
      bitmap,
      file,
      settings,
      settings.quality,
      format,
      onProgress,
    );
    onProgress?.(1);
    return result;
  } finally {
    bitmap.close();
  }
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
    // PNG 有损量化（调色板量化），高质量保真优先，不做自适应减色
    onProgress?.(0.22);
    const quantized = await encodeQuantizedPng(
      bitmap,
      {
        maxEdge: settings.maxEdge,
        colors: qualityToPngColors(quality),
        dither: PNG_DITHER,
        adaptive: false, // 保真优先，不做自适应减色
      },
      (p) => onProgress?.(0.22 + p * 0.73),
    );
    encoded = quantized.blob;
    onProgress?.(0.97);
  } else {
    onProgress?.(0.35);
    encoded = await encodeBitmap(bitmap, { format, quality, maxEdge: settings.maxEdge });
  }

  // 超出目标体积时，自动下调质量到“不超过目标”的最高质量（保真优先：能达标就尽量高）
  const targetBytes = Math.max(1, Math.round((file.size * settings.compressRatio) / 100));
  if (encoded.size > targetBytes) {
    let searchIteration = 0;
    const encodeAt = async (q: number): Promise<Blob> => {
      searchIteration += 1;
      onProgress?.(0.35 + 0.55 * (Math.min(searchIteration, 7) / 7));
      return format === 'png'
        ? (await encodeQuantizedPng(bitmap, {
            maxEdge: settings.maxEdge,
            colors: qualityToPngColors(q),
            dither: PNG_DITHER,
            adaptive: false,
          })).blob
        : encodeBitmap(bitmap, { format, quality: q, maxEdge: settings.maxEdge });
    };
    const { quality: adjusted } = await findBestQuality(
      async (q) => (await encodeAt(q)).size,
      targetBytes,
      1,
      quality,
    );
    encoded = await encodeAt(adjusted);
    quality = adjusted;
  }

  // 尽力压缩后仍不小于原图时，保留原文件（不输出更差的结果）
  if (encoded.size >= file.size) {
    format = resolveOutputFormat(file, 'original');
    onProgress?.(0.98);
    return makeResult(file, format, quality);
  }

  onProgress?.(0.95);
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
