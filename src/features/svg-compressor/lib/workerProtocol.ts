import type { SvgPreset } from '@/features/svg-compressor/lib/presets';
import type { SvgOutputFormat } from '@/features/svg-compressor/lib/types';

export interface OptimizeRequest {
  id: number;
  input: string;
  preset: SvgPreset;
  /** 输出格式：svgz 时在 Worker 内完成 gzip，避免主线程卡顿 */
  format: SvgOutputFormat;
}

export interface OptimizeResult {
  text: string;
  /** svgz 输出时的 gzip 字节；svg 输出为 null */
  gzipped: Uint8Array<ArrayBuffer> | null;
}

export type OptimizeResponse =
  | { id: number; ok: true; result: OptimizeResult }
  | { id: number; ok: false; error: string };
