import { callCloudFunction } from '@/shared/lib/cloudbase';
import type { PageStat } from '@/features/analytics/types';

/** 上报一次页面访问（无需登录）。 */
export async function trackVisit(path: string, visitorKey: string): Promise<void> {
  await callCloudFunction<null>('analytics', { action: 'trackVisit', path, visitorKey });
}

/** 拉取按页面聚合的访问统计（公开）；可传日期范围（ISO 时间字符串，左闭右开）。 */
export async function fetchStats(startDate?: string, endDate?: string): Promise<PageStat[]> {
  const payload: Record<string, unknown> = { action: 'getStats' };
  if (startDate && endDate) {
    payload.startDate = startDate;
    payload.endDate = endDate;
  }
  return callCloudFunction<PageStat[]>('analytics', payload);
}
