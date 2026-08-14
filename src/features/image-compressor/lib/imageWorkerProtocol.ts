import type { FormatOption, OutputFormat } from '@/features/image-compressor/lib/encoders';

/** 传入 Worker 的压缩参数子集（元数据保留在主线程完成，不传）。 */
export interface ImageWorkerSettings {
  quality: number;
  compressRatio: number;
  format: FormatOption;
  maxEdge: number;
}

export interface ImageCompressRequest {
  id: number;
  /** 通过 postMessage transfer 零拷贝传输，主线程侧随后被 detach */
  bitmap: ImageBitmap;
  settings: ImageWorkerSettings;
  fileType: string;
  fileSize: number;
}

export interface ImageWorkerResult {
  /** 压缩后的文件；kept-original 时为空，由主线程用原文件组装结果 */
  blob?: Blob;
  size: number;
  format: OutputFormat;
  qualityUsed: number;
  note?: string;
}

export type ImageCompressResponse =
  | { id: number; kind: 'progress'; progress: number }
  | { id: number; kind: 'done'; ok: true; result: ImageWorkerResult }
  | { id: number; kind: 'done'; ok: false; error: string };
