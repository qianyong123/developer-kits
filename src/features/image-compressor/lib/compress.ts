import { attachMetadataIfNeeded } from '@/features/image-compressor/lib/metadata';
import {
  encodeBitmap,
  encodeQuantizedPng,
  loadBitmap,
  resolveOutputFormat,
  type OutputFormat,
} from '@/features/image-compressor/lib/encoders';
import { findBestQuality } from '@/features/image-compressor/lib/findQuality';
import { getImageWorkerPool } from '@/features/image-compressor/lib/imageWorkerPool';
import { PNG_DITHER, qualityToPngColors } from '@/features/image-compressor/lib/quantize';
import type { ImageWorkerResult } from '@/features/image-compressor/lib/imageWorkerProtocol';
import type { CompressResult, CompressSettings } from '@/features/image-compressor/lib/types';

export { findBestQuality };

/** Worker 管线可用性：OffscreenCanvas 存在即优先 Worker，旧浏览器回退主线程。 */
function workerSupported(): boolean {
  return typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined';
}

export async function compressImage(
  file: File,
  settings: CompressSettings,
  onProgress?: (p: number) => void,
): Promise<CompressResult> {
  onProgress?.(0.05);
  const bitmap = await loadBitmap(file);
  onProgress?.(0.15);
  try {
    if (workerSupported()) {
      try {
        const result = await compressViaWorker(bitmap, file, settings, (p) =>
          onProgress?.(0.2 + p * 0.8),
        );
        onProgress?.(1);
        return result;
      } catch {
        // Worker 创建/执行失败：回退主线程实现（兼容旧浏览器）
      }
    }
    const result = await compressOnce(
      bitmap,
      file,
      settings,
      settings.quality,
      resolveOutputFormat(file, settings.format),
      onProgress,
    );
    onProgress?.(1);
    return result;
  } finally {
    // 传输给 Worker 后 close 是安全 no-op；未传输则释放位图
    bitmap.close();
  }
}

/** Worker 管线：位图传输进 Worker 压缩，元数据保留仍在主线程完成。 */
async function compressViaWorker(
  bitmap: ImageBitmap,
  file: File,
  settings: CompressSettings,
  onProgress?: (p: number) => void,
): Promise<CompressResult> {
  const result = await getImageWorkerPool().run(
    {
      bitmap,
      settings: {
        quality: settings.quality,
        compressRatio: settings.compressRatio,
        format: settings.format,
        maxEdge: settings.maxEdge,
      },
      fileType: file.type,
      fileSize: file.size,
    },
    onProgress,
  );
  return assembleWorkerResult(result, file, settings);
}

async function assembleWorkerResult(
  result: ImageWorkerResult,
  file: File,
  settings: CompressSettings,
): Promise<CompressResult> {
  if (!result.blob) {
    // 尽力压缩后仍不小于原图：保留原文件
    return makeResult(file, result.format, result.qualityUsed, 'kept-original');
  }
  const { blob, note: metaNote } = await attachMetadataIfNeeded(
    result.blob,
    file,
    result.format,
    settings.keepMetadata,
  );
  return makeResult(blob, result.format, result.qualityUsed, result.note ?? metaNote);
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
    encoded = await encodeBitmap(bitmap, {
      format,
      quality,
      maxEdge: settings.maxEdge,
    });
  }

  // 超出目标体积时，自动下调质量到“不超过目标”的最高质量（保真优先：能达标就尽量高）
  const targetBytes = Math.max(1, Math.round((file.size * settings.compressRatio) / 100));
  let note: CompressResult['note'];
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
        : encodeBitmap(bitmap, {
            format,
            quality: q,
            maxEdge: settings.maxEdge,
          });
    };
    const { quality: adjusted, reachable } = await findBestQuality(
      async (q) => (await encodeAt(q)).size,
      targetBytes,
      1,
      quality,
    );
    encoded = await encodeAt(adjusted);
    quality = adjusted;
    // 最低质量仍超目标：明确提示“无法达标”
    if (!reachable) note = 'cannot-reach';
  }

  // 尽力压缩后仍不小于原图时，保留原文件（不输出更差的结果）
  if (encoded.size >= file.size) {
    format = resolveOutputFormat(file, 'original');
    onProgress?.(0.98);
    return makeResult(file, format, quality, 'kept-original');
  }

  onProgress?.(0.95);
  const { blob, note: metaNote } = await attachMetadataIfNeeded(
    encoded,
    file,
    format,
    settings.keepMetadata,
  );
  return makeResult(blob, format, quality, note ?? metaNote);
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
