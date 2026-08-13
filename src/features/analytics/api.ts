import { callCloudFunction } from '@/shared/lib/cloudbase';
import type { PageStat } from '@/features/analytics/types';

/** 上报一次页面访问（无需登录）。 */
export async function trackVisit(path: string, visitorKey: string): Promise<void> {
  await callCloudFunction<null>('analytics', { action: 'trackVisit', path, visitorKey });
}

/** 拉取按页面聚合的访问统计（需登录）。 */
export async function fetchStats(token: string): Promise<PageStat[]> {
  return callCloudFunction<PageStat[]>('analytics', { action: 'getStats', token });
}
