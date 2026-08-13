export type AnalyticsDimension = 'day' | 'week' | 'month' | 'year';

/** 单页面访问统计（analytics 云函数 getStats 按页面返回的行）。 */
export interface PageStat {
  path: string;
  pv: number;
  uv: number;
  last_viewed?: string;
}

/** 按期间聚合的访问统计（getStats 带 dimension 返回的行）。 */
export interface TrendStat {
  period: string;
  pv: number;
  uv: number;
}
