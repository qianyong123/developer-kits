import { callCloudFunction } from '@/shared/lib/cloudbase';
import type {
  AnalyticsDimension,
  DashboardStats,
  PageStat,
  TrendStat,
  VisitorStat,
} from '@/features/analytics/types';

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

/** 拉取按期间（日/周/月/年）聚合的访问统计（公开）。 */
export async function fetchTrend(
  dimension: AnalyticsDimension,
  startDate?: string,
  endDate?: string,
): Promise<TrendStat[]> {
  const payload: Record<string, unknown> = { action: 'getStats', dimension };
  if (startDate && endDate) {
    payload.startDate = startDate;
    payload.endDate = endDate;
  }
  return callCloudFunction<TrendStat[]>('analytics', payload);
}

/** 一次请求拉取全部维度（同一数据快照，保证总数 >= 各维度）。 */
export async function fetchDashboard(
  startDate?: string,
  endDate?: string,
): Promise<DashboardStats> {
  const payload: Record<string, unknown> = { action: 'getDashboard' };
  if (startDate && endDate) {
    payload.startDate = startDate;
    payload.endDate = endDate;
  }
  return callCloudFunction<DashboardStats>('analytics', payload);
}

/** 拉取按访客聚合的访问统计（公开）；可传日期范围（ISO 时间字符串，左闭右开）。 */
export async function fetchVisitors(startDate?: string, endDate?: string): Promise<VisitorStat[]> {
  const payload: Record<string, unknown> = { action: 'getVisitors' };
  if (startDate && endDate) {
    payload.startDate = startDate;
    payload.endDate = endDate;
  }
  return callCloudFunction<VisitorStat[]>('analytics', payload);
}
