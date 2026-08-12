import type { EmbeddedImageInfo } from '@/features/svg-compressor/lib/svgFile';

export type SvgPreset = 'high' | 'balanced' | 'extreme';
export type SvgOutputFormat = 'svg' | 'svgz';

export interface SvgSettings {
  preset: SvgPreset;
  format: SvgOutputFormat;
  /** 输出文件名前缀（留空则不添加） */
  namePrefix: string;
  /** 输出文件名后缀（默认 -compressed，避免与原文件同名） */
  nameSuffix: string;
}

export type SvgItemStatus = 'pending' | 'processing' | 'done' | 'error';

export interface SvgResult {
  /** 可下载文件（.svg 或 .svgz） */
  blob: Blob;
  /** 优化后 SVG 文本的预览 URL（svgz 时用于浏览器内渲染） */
  previewUrl: string;
  size: number;
  format: SvgOutputFormat;
  code: string;
  note?: 'kept-original';
}

export interface SvgItem {
  id: string;
  file: File;
  /** 原始 SVG 的预览 URL（svgz 输入会先解压成文本） */
  originalUrl: string;
  originalSize: number;
  originalCode: string;
  /** 预览背景选择依据：是否含透明像素 */
  hasTransparency?: boolean;
  /** 内嵌 base64 图片检测结果（体积主要来自内嵌图片时用于提示） */
  embeddedImages?: EmbeddedImageInfo;
  status: SvgItemStatus;
  result?: SvgResult;
  error?: string;
}
