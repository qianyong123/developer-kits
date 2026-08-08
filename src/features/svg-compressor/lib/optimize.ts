import { gzipSvgText } from './svgFile';
import type { SvgOutputFormat, SvgPreset } from './types';
import { SvgWorkerPool } from './workerPool';

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
  const code = await getPool().run(input, preset);
  const previewBlob = new Blob([code], { type: 'image/svg+xml' });
  if (format === 'svgz') {
    const blob = new Blob([gzipSvgText(code)], { type: 'application/gzip' });
    return { code, blob, previewBlob, size: blob.size, format };
  }
  return { code, blob: previewBlob, previewBlob, size: previewBlob.size, format };
}
