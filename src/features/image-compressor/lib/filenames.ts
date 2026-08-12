import { EXT, type OutputFormat } from '@/features/image-compressor/lib/encoders';

/**
 * 输出文件名。
 * 未设置前缀/后缀（均留空）时：格式不变保留原名称，格式转换仅更换扩展名；
 * 设置了前缀/后缀时：按「前缀 + 原名（去扩展名） + 后缀 + 新扩展名」生成，
 * 避免压缩结果与原文件同名（默认后缀 -compressed，与 TinyPNG 思路一致）。
 */
export function outputFileName(
  originalName: string,
  format: OutputFormat,
  prefix = '',
  suffix = '',
): string {
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const origExt = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : '';
  const ext = EXT[format];
  const sameFormat = format === 'jpeg' ? origExt === 'jpg' || origExt === 'jpeg' : origExt === ext;
  if (prefix === '' && suffix === '') {
    return sameFormat ? originalName : `${base}.${ext}`;
  }
  return `${prefix}${base}${suffix}.${ext}`;
}
