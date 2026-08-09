import type { FormatOption, OutputFormat } from '@/features/image-compressor/lib/encoders';

export interface CompressSettings {
  quality: number;
  compressRatio: number;
  format: FormatOption;
  keepMetadata: boolean;
  maxEdge: number;
}

export interface CompressResult {
  blob: Blob;
  url: string;
  size: number;
  format: OutputFormat;
  qualityUsed?: number;
  note?: string;
}

export type ItemStatus = 'pending' | 'processing' | 'done' | 'error' | 'unsupported';

export interface ImageItem {
  id: string;
  file: File;
  originalUrl: string;
  originalSize: number;
  /** 预览背景选择依据：是否含透明像素 */
  hasTransparency?: boolean;
  status: ItemStatus;
  progress?: number;
  result?: CompressResult;
  error?: string;
}
