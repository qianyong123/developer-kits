import { gzipSvgText } from '@/features/svg-compressor/lib/svgFile';
import type { SvgOutputFormat, SvgPreset } from '@/features/svg-compressor/lib/types';
import { SvgWorkerPool } from '@/features/svg-compressor/lib/workerPool';

const POOL_SIZE = 2;
let pool: SvgWorkerPool | null = null;

function getPool(): SvgWorkerPool {
  pool ??= new SvgWorkerPool(POOL_SIZE);
  return pool;
}

export function disposeWorkerPool(): void {
  pool?.dispose();
  pool = null;
}

export interface OptimizedSvg {
  code: string;
  blob: Blob;
  previewBlob: Blob;
  size: number;
  format: SvgOutputFormat;
}

/** 在 Worker 中执行 SVGO 优化，返回文本与可下载 Blob。 */
export async function optimizeSvg(
  input: string,
  preset: SvgPreset,
  format: SvgOutputFormat,
): Promise<OptimizedSvg> {
  const { text: code, gzipped } = await getPool().run(input, preset, format);
  const previewBlob = new Blob([code], { type: 'image/svg+xml' });
  if (format === 'svgz') {
    const blob = new Blob([gzipped ?? gzipSvgText(code)], { type: 'application/gzip' });
    return { code, blob, previewBlob, size: blob.size, format };
  }
  return { code, blob: previewBlob, previewBlob, size: previewBlob.size, format };
}

/** 设置变更时取消排队/进行中的优化任务，避免旧代次继续占用 Worker。 */
export function cancelWorkerPool(): void {
  pool?.cancelAll();
}
