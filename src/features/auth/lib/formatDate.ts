/** 将 ISO 时间格式化为 YYYY-MM-DD HH:mm；无效或缺失输入返回 '--'。 */
export function formatCreatedAt(iso?: string): string {
  if (!iso) {
    return '--';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '--';
  }
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
