import { MIME, resolveOutputFormat } from '@/features/image-compressor/lib/encoders';
import { findBestQuality } from '@/features/image-compressor/lib/findQuality';
import { PNG_DITHER, qualityToPngColors, quantizeRgba } from '@/features/image-compressor/lib/quantize';
import type {
  ImageCompressRequest,
  ImageCompressResponse,
  ImageWorkerResult,
} from '@/features/image-compressor/lib/imageWorkerProtocol';

// 避免引入 webworker lib 与 DOM lib 的全局冲突，Worker 作用域做最小化类型声明
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<ImageCompressRequest>) => void) | null;
  postMessage: (response: ImageCompressResponse) => void;
};

scope.onmessage = async (event: MessageEvent<ImageCompressRequest>) => {
  const { id, bitmap } = event.data;
  try {
    const result = await compressInWorker(event.data, (progress) =>
      scope.postMessage({ id, kind: 'progress', progress }),
    );
    scope.postMessage({ id, kind: 'done', ok: true, result });
  } catch (error) {
    scope.postMessage({
      id,
      kind: 'done',
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    bitmap.close();
  }
};

/**
 * Worker 内压缩：OffscreenCanvas 只绘制一次，质量二分/达标重试复用画布与像素数据，
 * 避免每轮重新创建画布并读取像素。
 */
async function compressInWorker(
  request: ImageCompressRequest,
  onProgress: (p: number) => void,
): Promise<ImageWorkerResult> {
  const { bitmap, settings, fileType, fileSize } = request;
  onProgress(0.05);
  const format = resolveOutputFormat({ type: fileType }, settings.format);
  const scale =
    settings.maxEdge > 0 ? Math.min(1, settings.maxEdge / Math.max(bitmap.width, bitmap.height)) : 1;
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-failed');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // JPEG 不支持透明通道，透明区域填充白色
  if (format === 'jpeg') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  onProgress(0.15);

  // PNG：像素数据只读取一次，量化/编码循环复用
  let pngData: ImageData | null = null;
  const encodeAt = async (q: number): Promise<Blob> => {
    if (format === 'png') {
      pngData ??= ctx.getImageData(0, 0, width, height);
      return (
        await quantizeRgba(
          pngData.data,
          width,
          height,
          { colors: qualityToPngColors(q), dither: PNG_DITHER, adaptive: false },
          (p) => onProgress(0.2 + p * 0.7),
        )
      ).blob;
    }
    onProgress(0.35);
    return canvas.convertToBlob({ type: MIME[format], quality: q / 100 });
  };

  const targetBytes = Math.max(1, Math.round((fileSize * settings.compressRatio) / 100));
  let quality = settings.quality;
  let encoded = await encodeAt(quality);
  let note: ImageWorkerResult['note'];
  if (encoded.size > targetBytes) {
    let searchIteration = 0;
    const encodeForSearch = async (q: number): Promise<Blob> => {
      searchIteration += 1;
      onProgress(0.2 + 0.5 * (Math.min(searchIteration, 7) / 7));
      return encodeAt(q);
    };
    const { quality: adjusted, reachable } = await findBestQuality(
      async (q) => (await encodeForSearch(q)).size,
      targetBytes,
      1,
      quality,
    );
    encoded = await encodeAt(adjusted);
    quality = adjusted;
    // 最低质量仍超目标：明确提示“无法达标”
    if (!reachable) note = 'cannot-reach';
  }

  // 尽力压缩后仍不小于原图时，保留原文件（结果由主线程用原文件组装）
  if (encoded.size >= fileSize) {
    return {
      size: fileSize,
      format: resolveOutputFormat({ type: fileType }, 'original'),
      qualityUsed: quality,
      note: 'kept-original',
    };
  }

  return { blob: encoded, size: encoded.size, format, qualityUsed: quality, note };
}
