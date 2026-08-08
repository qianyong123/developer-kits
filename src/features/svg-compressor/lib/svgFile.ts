import { gunzipSync, gzipSync } from 'fflate';
import type { SvgOutputFormat } from './types';

export const MAX_SVG_FILE_SIZE = 20 * 1024 * 1024;

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
