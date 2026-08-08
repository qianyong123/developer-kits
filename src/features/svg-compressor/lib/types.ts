export type SvgPreset = 'high' | 'balanced' | 'extreme';
export type SvgOutputFormat = 'svg' | 'svgz';

export interface SvgSettings {
  preset: SvgPreset;
  format: SvgOutputFormat;
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
  status: SvgItemStatus;
  result?: SvgResult;
  error?: string;
}
