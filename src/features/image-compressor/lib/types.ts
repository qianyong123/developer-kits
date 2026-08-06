import type { FormatOption, OutputFormat } from './encoders';

export interface CompressSettings {
  mode: 'quality' | 'target';
  quality: number;
  targetKB: number;
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

export type ItemStatus = 'pending' | 'processing' | 'done' | 'error';

export interface ImageItem {
  id: string;
  file: File;
  originalUrl: string;
  originalSize: number;
  status: ItemStatus;
  progress?: number;
  result?: CompressResult;
  error?: string;
}
