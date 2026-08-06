export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '--';
  if (bytes < 1024) return `${bytes} B`;

  const units = ['KB', 'MB', 'GB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit += 1;
  } while (value >= 1024 && unit < units.length - 1);

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unit]}`;
}

/** 压缩率，正数为减小，负数为增大。 */
export function ratioPercent(original: number, compressed: number): string {
  if (original <= 0) return '--';
  const pct = (1 - compressed / original) * 100;
  const sign = pct > 0 ? '-' : pct < 0 ? '+' : '';
  return `${sign}${Math.abs(pct).toFixed(1)}%`;
}
