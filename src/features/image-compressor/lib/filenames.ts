import { EXT, type OutputFormat } from './encoders';

export function outputFileName(
  originalName: string,
  format: OutputFormat,
  keepOriginal = false,
): string {
  if (keepOriginal) return originalName;
  const dot = originalName.lastIndexOf('.');
  const base = dot > 0 ? originalName.slice(0, dot) : originalName;
  const origExt = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : '';
  const ext = EXT[format];
  const sameFormat = format === 'jpeg' ? origExt === 'jpg' || origExt === 'jpeg' : origExt === ext;
  return sameFormat ? `${base}-compressed.${ext}` : `${base}.${ext}`;
}
