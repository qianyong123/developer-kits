import type { FormatOption, OutputFormat } from '@/features/image-compressor/lib/encoders';

export interface CompressSettings {
  quality: number;
  compressRatio: number;
  format: FormatOption;
  keepMetadata: boolean;
  maxEdge: number;
  /** 输出文件名前缀（留空则不添加） */
  namePrefix: string;
  /** 输出文件名后缀（默认 -compressed，避免与原文件同名） */
  nameSuffix: string;
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
