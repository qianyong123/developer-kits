import { gunzipSync, gzipSync } from 'fflate';
import type { SvgOutputFormat } from '@/features/svg-compressor/lib/types';

export const MAX_SVG_FILE_SIZE = 20 * 1024 * 1024;

export interface EmbeddedImageInfo {
  /** 内嵌 base64 图片数量 */
  count: number;
  /** 估算的解码后字节数 */
  bytes: number;
  /** 占文件大小比例（0-1） */
  ratio: number;
}

/** 检测 SVG 内嵌的 base64 图片，估算其体积占比（用于提示“体积主要来自内嵌图片”）。 */
export function analyzeEmbeddedImages(svgText: string, totalBytes: number): EmbeddedImageInfo {
  const regex = /data:image\/[a-zA-Z0-9.+-]+;base64,([A-Za-z0-9+/=\s]+)/g;
  let count = 0;
  let base64Chars = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(svgText)) !== null) {
    count += 1;
    base64Chars += match[1].replace(/\s/g, '').length;
  }
  const bytes = Math.floor((base64Chars * 3) / 4);
  return { count, bytes, ratio: totalBytes > 0 ? bytes / totalBytes : 0 };
}

export function isSvgFile(file: File): boolean {
  return file.type === 'image/svg+xml' || /\.svgz?$/i.test(file.name);
}

export function isSvgzName(name: string): boolean {
  return /\.svgz$/i.test(name);
}

/** 读取 SVG 文本；svgz（gzip）输入自动解压。 */
export async function readSvgText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    return new TextDecoder().decode(gunzipSync(bytes));
  }
  return new TextDecoder().decode(bytes);
}

export function gzipSvgText(text: string): Uint8Array<ArrayBuffer> {
  return gzipSync(new TextEncoder().encode(text), { level: 9 }) as Uint8Array<ArrayBuffer>;
}

/** 输出文件名：与输入保持一致，仅在格式转换时更换扩展名（svg → svgz / svgz → svg）。 */
export function svgOutputName(originalName: string, format: SvgOutputFormat): string {
  const isSvgz = /\.svgz$/i.test(originalName);
  if ((isSvgz && format === 'svgz') || (!isSvgz && format === 'svg')) {
    return originalName;
  }
  const base = originalName.replace(/\.svgz?$/i, '');
  return `${base}.${format}`;
}
